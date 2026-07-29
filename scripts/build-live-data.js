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
const {
  COUNTRIES, LIMITS, normaliseTitle, isBreakingNews,
} = require('./config');

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
  return Math.min(100, Math.round(0.55 * top[0] + 0.45 * avg));
}

function statusFor(topic, change, isNew, now = Date.now()) {
  if (topic.kind === 'NEWS') {
    const ageHours = topic.ageHours ?? ageHoursSince(topic.publishedAt, now);
    if (ageHours <= 6 && topic.breaking) return 'emerging';
    if (ageHours <= 6 && topic.sourceOutletCount >= 2) return 'rising';
    if (ageHours <= 6 && isNew && topic.score >= 105) return 'emerging';
    if (isNew) return 'stable';
  } else if (isNew) {
    return 'emerging';
  }
  if (change >= 15) return 'rising';
  if (change <= -15) return 'declining';
  if (topic.score >= 85) return 'peak';
  return 'stable';
}

/* ------------------------------------------------------------------ shaping */

function ageHoursSince(publishedAt, now = Date.now()) {
  const published = new Date(publishedAt || 0).getTime();
  if (!Number.isFinite(published) || published <= 0) return 24;
  return Math.max(0, (now - published) / 3600000);
}

function freshnessBoostFor(ageHours) {
  if (ageHours <= 2) return 30;
  if (ageHours <= 6) return 22;
  if (ageHours <= 12) return 12;
  if (ageHours <= 24) return 4;
  return 0;
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'after', 'into',
  'about', 'over', 'says', 'new', 'latest', 'news', '速報', '発表', 'について',
]);

function themeTokens(title) {
  const text = normaliseTitle(title);
  const out = new Set(
    (text.match(/[a-z0-9]{3,}/g) || []).filter((word) => !STOPWORDS.has(word)),
  );
  for (const run of text.match(/[\u3040-\u30ff\u3400-\u9fff]{2,}/g) || []) {
    for (let i = 0; i < run.length - 1; i += 1) out.add(run.slice(i, i + 2));
  }
  return out;
}

function sameTheme(a, b) {
  const ak = normaliseTitle(a.title);
  const bk = normaliseTitle(b.title);
  if (ak === bk || (Math.min(ak.length, bk.length) >= 20 && (ak.includes(bk) || bk.includes(ak)))) {
    return true;
  }
  const at = themeTokens(a.title);
  const bt = themeTokens(b.title);
  if (!at.size || !bt.size) return false;
  let shared = 0;
  for (const token of at) if (bt.has(token)) shared += 1;
  const ratio = shared / Math.min(at.size, bt.size);
  return shared >= 2 && ratio >= 0.3;
}

function coverageStats(article, articles) {
  const related = articles.filter((candidate) => sameTheme(article, candidate));
  const outlets = new Set(related.map((item) => item.outlet).filter(Boolean));
  return {
    coverageCount: Math.max(1, related.length),
    sourceOutletCount: Math.max(1, outlets.size),
  };
}

function coverageBoostFor(coverageCount, sourceOutletCount) {
  const articleBoost = Math.min(6, Math.max(0, coverageCount - 1) * 2);
  const outletBoost = Math.min(8, Math.max(0, sourceOutletCount - 1) * 4);
  return Math.min(14, articleBoost + outletBoost);
}

function scoreNews(article, articles, now = Date.now()) {
  const rank = Math.max(1, Number(article.rank) || 1);
  const ageHours = ageHoursSince(article.publishedAt, now);
  const baseRankScore = Math.max(0, 100 - (rank - 1) * 3);
  const freshnessBoost = freshnessBoostFor(ageHours);
  const breaking = isBreakingNews(article.title);
  const breakingBoost = breaking ? 15 : 0;
  const { coverageCount, sourceOutletCount } = coverageStats(article, articles);
  const coverageBoost = coverageBoostFor(coverageCount, sourceOutletCount);
  const rawScore = baseRankScore + freshnessBoost + breakingBoost + coverageBoost;
  const score = Math.max(0, Math.min(
    130,
    Math.round((rawScore / 159) * 130),
  ));
  return {
    score, rawScore, ageHours, baseRankScore, freshnessBoost, breaking,
    breakingBoost, coverageCount, sourceOutletCount, coverageBoost,
  };
}

function newsTopics(entry, keyOf, now = Date.now()) {
  const articles = entry?.articles ?? [];
  return articles.map((a) => {
    const key = keyOf(a.title);
    const scoring = scoreNews(a, articles, now);
    return {
      id: idFor('n', key),
      key,
      kind: 'NEWS',
      title: { ja: a.title, en: a.title },
      summary: { ja: '', en: '' },
      category: a.category || 'OTHER',
      score: scoring.score,
      url: a.url,
      outlet: a.outlet,
      publishedAt: a.publishedAt || null,
      language: a.language || null,
      keywords: [],
      sources: ['NEWS'],
      ageHours: Math.round(scoring.ageHours * 10) / 10,
      rawScore: scoring.rawScore,
      baseRankScore: scoring.baseRankScore,
      freshnessBoost: scoring.freshnessBoost,
      breaking: scoring.breaking,
      breakingBoost: scoring.breakingBoost,
      coverageCount: scoring.coverageCount,
      sourceOutletCount: scoring.sourceOutletCount,
      coverageBoost: scoring.coverageBoost,
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

function build(inputs = {}) {
  const news = Object.prototype.hasOwnProperty.call(inputs, 'news') ? inputs.news : readJSON(F.news);
  const wiki = Object.prototype.hasOwnProperty.call(inputs, 'wiki') ? inputs.wiki : readJSON(F.wiki);
  if (!news && !wiki) return { ok: false, reason: 'no fetched data on disk' };
  const now = inputs.now ? new Date(inputs.now).getTime() : Date.now();

  const previous = readJSON(F.topics);
  const prevScores = new Map();          // `${code}|${id}` → score
  for (const c of previous?.countries ?? []) {
    for (const t of c.topics ?? []) prevScores.set(`${c.code}|${t.id}`, t.score);
  }

  const keyOf = normaliseTitle;
  const byCountry = new Map();

  for (const { code } of COUNTRIES) {
    const n = (news?.countries ?? []).find((c) => c.code === code);
    const w = (wiki?.countries ?? []).find((c) => c.code === code);
    if (!n && !w) continue;

    const topics = [...newsTopics(n, keyOf, now), ...wikiTopics(w, keyOf)];
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
        status: statusFor(t, change, isNew, now),
        origin,
        relatedCountries: codes,
        startedAt: t.publishedAt,
        durationHours: null,
      };
    }).sort((a, b) => b.score - a.score);

    countries.push({
      code,
      activityScore: activityFromScores(topics.map((t) => t.score)),
      risingCount: topics.filter((t) =>
        t.change >= 15 || t.status === 'emerging' || t.status === 'rising').length,
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
    topics: c.topics.map((t) => [
      t.id, t.score, t.status, t.change, t.title, t.url, t.outlet, t.publishedAt,
    ]),
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

  const wikiResult = readJSON(
    path.join(__dirname, '.wikimedia-result.json'),
    { ok: [], failed: [], items: 0, missing: true },
  );
  const newsResult = readJSON(
    path.join(__dirname, '.news-result.json'),
    { ok: [], failed: [], items: 0, missing: true },
  );
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

  const result = build({
    news: newsResult.missing || (newsResult.ok ?? []).length ? newsRaw : null,
    wiki: wikiResult.missing || (wikiResult.ok ?? []).length ? wikiRaw : null,
    now: nowISO,
  });

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
  const countriesWithoutData = attempted.filter((c) => !successful.includes(c));
  const sourceFailedCountries = [...new Set(
    errors.map((error) => error.country).filter((code) => code && code !== '*'),
  )];
  const failedCountries = [...new Set([...countriesWithoutData, ...sourceFailedCountries])];
  const partial = failedCountries.length > 0 || errors.length > 0;
  const topicsGenerated = result.countries.reduce((n, c) => n + c.topics.length, 0);
  const perCountryWiki = result.countries.every((c) => c.wikiPerCountry !== false);

  /* Refresh generatedAt and the rolling timeline on every run. The status file
     already changes every run, so skipping these files only leaves Pages
     presenting an older successful refresh. */
  const previous = readJSON(F.topics);
  const identical = previous && previous.fingerprint === fingerprint(result.countries);

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
    + `(${successful.length} countries, ${topicsGenerated} topics`
    + `${identical ? ', same ranking refreshed' : ''})\n`);

  const { history, frames } = buildTimeline(result.countries, nowISO);
  fs.writeFileSync(F.timeline, `${JSON.stringify({ ...history, frames }, null, 1)}\n`);
  process.stdout.write(`build wrote: ${path.relative(process.cwd(), F.timeline)} (${frames.length} frames)\n`);

  const jpNews = result.countries.find((country) => country.code === 'JP')
    ?.topics.filter((topic) => topic.kind === 'NEWS') ?? [];
  process.stdout.write(`  JP generated NEWS topics: ${jpNews.length}\n`);
  process.stdout.write('  JP NEWS top 5:\n');
  jpNews.slice(0, 5).forEach((topic, i) => {
    process.stdout.write(
      `    ${i + 1}. ${topic.title.ja} | score=${topic.score} | `
      + `publishedAt=${topic.publishedAt ?? 'unknown'}\n`,
    );
  });

  writeStatus(
    partial ? 'partial' : 'success',
    !partial
      ? `Live data generated for all ${successful.length} countries.`
      : `Live data generated for ${successful.length}/${attempted.length} countries; `
        + `one or more sources failed for ${failedCountries.join(', ')}.`,
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
  process.stdout.write(`  live-topics.json:   YES${identical ? ' (same ranking, timestamp refreshed)' : ''}\n`);
  process.stdout.write(`  live-wikipedia.json: ${wikiRaw ? 'YES (by fetch-wikimedia.js)' : 'NO'}\n`);
  process.stdout.write(`  live-news.json:      ${newsRaw ? 'YES (by fetch-news.js)' : 'NO'}\n`);
  process.stdout.write('  live-timeline.json: YES\n');
  process.stdout.write('  update-status.json: YES\n');
  process.stdout.write(
    `build: ${successful.length}/${attempted.length} countries, ${topicsGenerated} topics\n`,
  );
  process.stdout.write(`build: ok=[${successful.join(',')}]\n`);
  process.stdout.write(`build: failed=[${failedCountries.join(',')}]\n`);
  return 0;
}

if (require.main === module) process.exitCode = run();

module.exports = {
  build, buildTimeline, activityFromScores, statusFor, fingerprint, buildCountryStatus,
  ageHoursSince, freshnessBoostFor, sameTheme, coverageStats, coverageBoostFor, scoreNews,
};
