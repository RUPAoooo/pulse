/**
 * build-live-data.js — folds the two raw fetches into the shape the site
 * already understands (the same shape as data/topics.json), so the map,
 * filters, timeline and WORLD NOW keep working untouched.
 *
 * Writes data/live-topics.json, data/live-timeline.json, data/update-status.json.
 * If nothing actually changed since the last run it writes nothing at all —
 * that is what keeps the hourly workflow from committing noise.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { COUNTRIES, LIMITS } = require('./config');

const DATA = path.join(__dirname, '..', 'data');
const F = {
  news: path.join(DATA, 'live-news.json'),
  wiki: path.join(DATA, 'live-wikipedia.json'),
  topics: path.join(DATA, 'live-topics.json'),
  timeline: path.join(DATA, 'live-timeline.json'),
  status: path.join(DATA, 'update-status.json'),
};

const OFFSETS = [0, 3, 6, 12, 24];
const FRAME_LABELS = {
  0: { ja: '現在', en: 'NOW' },
  3: { ja: '3時間前', en: '3H ago' },
  6: { ja: '6時間前', en: '6H ago' },
  12: { ja: '12時間前', en: '12H ago' },
  24: { ja: '24時間前', en: '24H ago' },
};

function readJSON(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function idFor(prefix, key) {
  return `${prefix}-${crypto.createHash('sha1').update(key).digest('hex').slice(0, 10)}`;
}

/** Same curve the front end uses, so a filtered and an unfiltered score agree. */
function activityFromScores(scores) {
  if (!scores.length) return 0;
  const top = [...scores].sort((a, b) => b - a).slice(0, 4);
  const avg = top.reduce((a, b) => a + b, 0) / top.length;
  return Math.round(0.55 * top[0] + 0.45 * avg);
}

function statusFor(score, change, isNew) {
  if (isNew) return 'emerging';
  if (change >= 15) return 'rising';
  if (change <= -15) return 'declining';
  if (score >= 85) return 'peak';
  return 'stable';
}

/* ------------------------------------------------------------------ shaping */

function newsTopics(entry, keyOf) {
  return (entry?.articles ?? []).map((a) => {
    const key = keyOf(a.title);
    return {
      id: idFor('n', key),
      key,
      kind: 'NEWS',
      title: { ja: a.title, en: a.title },
      summary: { ja: '', en: '' },
      category: a.category || 'OTHER',
      score: Math.max(40, 100 - (a.rank - 1) * 4),
      url: a.url,
      outlet: a.outlet,
      publishedAt: a.publishedAt || null,
      language: a.language || null,
      keywords: [],
      sources: ['NEWS'],
    };
  });
}

function wikiTopics(entry, keyOf) {
  const articles = entry?.articles ?? [];
  const top = Math.max(1, ...articles.map((a) => a.views || 0));
  return articles.map((a) => {
    const key = keyOf(a.title);
    return {
      id: idFor('w', key),
      key,
      kind: 'WIKI',
      title: { ja: a.title, en: a.title },
      summary: { ja: '', en: '' },
      category: a.category || 'OTHER',
      score: Math.max(30, Math.round((a.views / top) * 100)),
      url: a.url,
      views: a.views,
      rank: a.rank,
      project: a.project,
      publishedAt: null,
      keywords: [],
      sources: ['WIKIPEDIA'],
    };
  });
}

/* -------------------------------------------------------------------- build */

function build() {
  const news = readJSON(F.news);
  const wiki = readJSON(F.wiki);
  if (!news && !wiki) return { ok: false, reason: 'no fetched data on disk' };

  const previous = readJSON(F.topics);
  const prevScores = new Map();          // `${code}|${id}` → score
  for (const c of previous?.countries ?? []) {
    for (const t of c.topics ?? []) prevScores.set(`${c.code}|${t.id}`, t.score);
  }

  const keyOf = (title) => require('./config').normaliseTitle(title);
  const byCountry = new Map();

  for (const { code } of COUNTRIES) {
    const n = (news?.countries ?? []).find((c) => c.code === code);
    const w = (wiki?.countries ?? []).find((c) => c.code === code);
    if (!n && !w) continue;

    const topics = [...newsTopics(n, keyOf), ...wikiTopics(w, keyOf)];
    if (!topics.length) continue;

    byCountry.set(code, {
      code,
      wikiPerCountry: w ? w.perCountry !== false : null,
      wikiDate: w?.date ?? null,
      topics,
    });
  }

  if (!byCountry.size) return { ok: false, reason: 'nothing usable after shaping' };

  /* a story carried by two or more countries is GLOBAL */
  const spread = new Map();              // id → [codes]
  for (const [code, c] of byCountry) {
    for (const t of c.topics) {
      if (!spread.has(t.id)) spread.set(t.id, []);
      spread.get(t.id).push(code);
    }
  }

  const countries = [];
  for (const [code, c] of byCountry) {
    const topics = c.topics.map((t) => {
      const codes = spread.get(t.id) ?? [code];
      const before = prevScores.get(`${code}|${t.id}`);
      const isNew = before == null;
      const change = isNew ? 0 : Math.round(((t.score - before) / Math.max(1, before)) * 1000) / 10;
      const origin = codes
        .map((cc) => ({ cc, s: byCountry.get(cc).topics.find((x) => x.id === t.id)?.score ?? 0 }))
        .sort((a, b) => b.s - a.s)[0].cc;

      const { key, ...rest } = t;
      return {
        ...rest,
        scope: codes.length >= 2 ? 'GLOBAL' : 'LOCAL',
        change,
        status: statusFor(t.score, change, isNew),
        origin,
        relatedCountries: codes,
        startedAt: t.publishedAt,
        durationHours: null,
      };
    }).sort((a, b) => b.score - a.score);

    countries.push({
      code,
      activityScore: activityFromScores(topics.map((t) => t.score)),
      risingCount: topics.filter((t) => t.change >= 15).length,
      wikiPerCountry: c.wikiPerCountry,
      wikiDate: c.wikiDate,
      topics,
    });
  }

  countries.sort((a, b) => a.code.localeCompare(b.code));
  return { ok: true, countries, news, wiki };
}

/* ----------------------------------------------------------------- timeline */

function buildTimeline(countries, nowISO) {
  const history = readJSON(F.timeline, null);
  const snapshots = Array.isArray(history?.snapshots) ? history.snapshots : [];

  const snapshot = {
    at: nowISO,
    countries: Object.fromEntries(countries.map((c) => [c.code, {
      activityScore: c.activityScore,
      risingCount: c.risingCount,
      topics: Object.fromEntries(c.topics.map((t) => [t.id, { score: t.score, change: t.change }])),
    }])),
  };

  const cutoff = Date.now() - LIMITS.historyHours * 3600000;
  const kept = [snapshot, ...snapshots.filter((s) => new Date(s.at).getTime() > cutoff)]
    .sort((a, b) => new Date(b.at) - new Date(a.at));

  /* pick the snapshot nearest each offset; skip an offset with no history yet */
  const now = new Date(nowISO).getTime();
  const frames = [];
  for (const off of OFFSETS) {
    const target = now - off * 3600000;
    let best = null;
    let bestGap = Infinity;
    for (const s of kept) {
      const gap = Math.abs(new Date(s.at).getTime() - target);
      if (gap < bestGap) { bestGap = gap; best = s; }
    }
    // 0 always exists; older frames need a snapshot within 75 minutes
    if (off === 0 || (best && bestGap <= 75 * 60000)) {
      frames.push({
        offsetHours: off,
        label: FRAME_LABELS[off],
        shortLabel: off === 0 ? 'NOW' : `${off}H`,
        countries: off === 0 ? snapshot.countries : best.countries,
      });
    }
  }

  return { history: { updatedAt: nowISO, snapshots: kept }, frames };
}

/* ------------------------------------------------------------------- output */

function fingerprint(countries) {
  return crypto.createHash('sha1').update(JSON.stringify(countries.map((c) => ({
    code: c.code,
    topics: c.topics.map((t) => [t.id, t.score]),
  })))).digest('hex');
}

/**
 * Per-country outcome, so the UI can say *why* a country is empty instead of
 * just "no data". One row per attempted country, whatever happened.
 *   news / wiki  items kept from each source (0 = that source gave nothing)
 *   wikiPerCountry  true = real per-country data, false = language edition
 *   state        'ok' | 'news-only' | 'wiki-only' | 'failed'
 */
function buildCountryStatus(wikiResult, newsResult, successful) {
  const out = {};
  const ok = new Set(successful);
  for (const { code } of COUNTRIES) {
    const w = wikiResult.perCountry?.[code] ?? {};
    const n = newsResult.perCountry?.[code] ?? {};
    const news = n.items ?? 0;
    const wiki = w.items ?? 0;
    let state = 'failed';
    if (ok.has(code) && news && wiki) state = 'ok';
    else if (ok.has(code) && news) state = 'news-only';
    else if (ok.has(code) && wiki) state = 'wiki-only';
    out[code] = {
      news,
      wiki,
      wikiPerCountry: wiki ? w.perCountry !== false : null,
      wikiDate: w.date ?? null,
      state,
      errors: [n.error, w.error].filter(Boolean),
    };
  }
  return out;
}

/** update-status.json is written on EVERY code path — this is the contract. */
function writeStatus(status, message, extra = {}) {
  const payload = {
    updatedAt: new Date().toISOString(),
    status,                         // 'success' | 'partial' | 'failed' | 'empty'
    message,
    hasData: Boolean(extra.hasData),
    targets: COUNTRIES.map((c) => c.code),
    counts: {
      wikimediaItems: extra.wikimediaItems ?? 0,
      newsItems: extra.newsItems ?? 0,
      countriesWithData: extra.countriesWithData ?? 0,
      topicsGenerated: extra.topicsGenerated ?? 0,
      countriesAttempted: COUNTRIES.length,
    },
    successfulCountries: extra.successfulCountries ?? [],
    failedCountries: extra.failedCountries ?? [],
    countryStatus: extra.countryStatus ?? {},
    errors: extra.errors ?? [],
  };
  fs.writeFileSync(F.status, `${JSON.stringify(payload, null, 1)}\n`);
  process.stdout.write(`build wrote: ${path.relative(process.cwd(), F.status)} (status=${status})\n`);
  return payload;
}

function run() {
  const nowISO = new Date().toISOString();

  const wikiResult = readJSON(path.join(__dirname, '.wikimedia-result.json'), { ok: [], failed: [], items: 0 });
  const newsResult = readJSON(path.join(__dirname, '.news-result.json'), { ok: [], failed: [], items: 0 });
  const errors = [...(wikiResult.failed ?? []), ...(newsResult.failed ?? [])];
  const attempted = COUNTRIES.map((c) => c.code);

  /* what did the fetchers leave on disk? */
  const newsRaw = readJSON(F.news);
  const wikiRaw = readJSON(F.wiki);
  process.stdout.write('build: input files ---------------------------------\n');
  process.stdout.write(`  ${path.relative(process.cwd(), F.news)}: ${newsRaw ? 'present' : 'MISSING'}` +
    `${newsRaw ? ` (${newsRaw.countries?.length ?? 0} countries)` : ''}\n`);
  process.stdout.write(`  ${path.relative(process.cwd(), F.wiki)}: ${wikiRaw ? 'present' : 'MISSING'}` +
    `${wikiRaw ? ` (${wikiRaw.countries?.length ?? 0} countries)` : ''}\n`);
  process.stdout.write(`  wikimedia items fetched: ${wikiResult.items ?? 0}\n`);
  process.stdout.write(`  news items fetched: ${newsResult.items ?? 0}\n`);

  const result = build();

  if (!result.ok) {
    // No usable input at all — say why, keep any previous live JSON in place.
    const empty = !newsRaw && !wikiRaw;
    writeStatus(
      empty ? 'empty' : 'failed',
      empty
        ? 'No fetched input found (live-news.json and live-wikipedia.json are both missing). '
          + 'Both fetchers returned zero countries, so no live-topics.json was generated.'
        : `Input present but produced nothing usable: ${result.reason}. `
          + 'Previous live JSON, if any, was left untouched.',
      {
        hasData: false,
        wikimediaItems: wikiResult.items ?? 0,
        newsItems: newsResult.items ?? 0,
        countriesWithData: 0,
        topicsGenerated: 0,
        successfulCountries: [],
        failedCountries: attempted,
        countryStatus: buildCountryStatus(wikiResult, newsResult, []),
        errors,
      },
    );
    process.stdout.write(`build: NOT generating live-topics.json — ${result.reason}\n`);
    return 0;
  }

  const successful = result.countries.map((c) => c.code);
  const failedCountries = attempted.filter((c) => !successful.includes(c));
  const topicsGenerated = result.countries.reduce((n, c) => n + c.topics.length, 0);
  const perCountryWiki = result.countries.every((c) => c.wikiPerCountry !== false);

  /* Skip re-writing topics/timeline when the content is byte-for-byte the same,
     but STILL refresh status so update-status.json always reflects this run. */
  const previous = readJSON(F.topics);
  const identical = previous && previous.fingerprint === fingerprint(result.countries);

  if (identical) {
    process.stdout.write('build: live-topics.json content identical to last run — not rewriting it\n');
  } else {
    fs.writeFileSync(F.topics, `${JSON.stringify({
      updatedAt: nowISO,
      source: 'live',
      fingerprint: fingerprint(result.countries),
      wikiPerCountry: perCountryWiki,
      newsSource: result.news?.source ?? null,
      wikiSource: result.wiki?.source ?? null,
      countries: result.countries,
    }, null, 1)}\n`);
    process.stdout.write(`build wrote: ${path.relative(process.cwd(), F.topics)} `
      + `(${successful.length} countries, ${topicsGenerated} topics)\n`);

    const { history, frames } = buildTimeline(result.countries, nowISO);
    fs.writeFileSync(F.timeline, `${JSON.stringify({ ...history, frames }, null, 1)}\n`);
    process.stdout.write(`build wrote: ${path.relative(process.cwd(), F.timeline)} (${frames.length} frames)\n`);
  }

  writeStatus(
    failedCountries.length === 0 ? 'success' : 'partial',
    failedCountries.length === 0
      ? `Live data generated for all ${successful.length} countries.`
      : `Live data generated for ${successful.length}/${attempted.length} countries; `
        + `${failedCountries.join(', ')} failed and were skipped.`,
    {
      hasData: true,
      wikimediaItems: wikiResult.items ?? 0,
      newsItems: newsResult.items ?? 0,
      countriesWithData: successful.length,
      topicsGenerated,
      successfulCountries: successful,
      failedCountries,
      countryStatus: buildCountryStatus(wikiResult, newsResult, successful),
      errors,
    },
  );

  process.stdout.write('build: generated files -----------------------------\n');
  process.stdout.write(`  live-topics.json:   ${identical ? 'unchanged (identical)' : 'YES'}\n`);
  process.stdout.write(`  live-wikipedia.json: ${wikiRaw ? 'YES (by fetch-wikimedia.js)' : 'NO'}\n`);
  process.stdout.write(`  live-news.json:      ${newsRaw ? 'YES (by fetch-news.js)' : 'NO'}\n`);
  process.stdout.write(`  live-timeline.json: ${identical ? 'unchanged' : 'YES'}\n`);
  process.stdout.write('  update-status.json: YES\n');
  process.stdout.write(
    `build: ${successful.length}/${attempted.length} countries, ${topicsGenerated} topics\n`,
  );
  process.stdout.write(`build: ok=[${successful.join(',')}]\n`);
  process.stdout.write(`build: failed=[${failedCountries.join(',')}]\n`);
  return 0;
}

if (require.main === module) process.exitCode = run();

module.exports = { build, buildTimeline, activityFromScores, statusFor, fingerprint, buildCountryStatus };
