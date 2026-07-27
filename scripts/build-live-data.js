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

function run() {
  const result = build();
  const nowISO = new Date().toISOString();

  if (!result.ok) {
    process.stdout.write(`build: ${result.reason} — previous data left in place\n`);
    return 0;
  }

  const previous = readJSON(F.topics);
  if (previous && previous.fingerprint === fingerprint(result.countries)) {
    process.stdout.write('build: content identical to last run — nothing written\n');
    return 0;
  }

  const wikiResult = readJSON(path.join(__dirname, '.wikimedia-result.json'), { ok: [], failed: [] });
  const newsResult = readJSON(path.join(__dirname, '.news-result.json'), { ok: [], failed: [] });

  const successful = result.countries.map((c) => c.code);
  const attempted = COUNTRIES.map((c) => c.code);
  const failedCountries = attempted.filter((c) => !successful.includes(c));
  const errors = [...(wikiResult.failed ?? []), ...(newsResult.failed ?? [])];

  const perCountryWiki = result.countries.every((c) => c.wikiPerCountry !== false);

  fs.writeFileSync(F.topics, `${JSON.stringify({
    updatedAt: nowISO,
    source: 'live',
    fingerprint: fingerprint(result.countries),
    wikiPerCountry: perCountryWiki,
    newsSource: result.news?.source ?? null,
    wikiSource: result.wiki?.source ?? null,
    countries: result.countries,
  }, null, 1)}\n`);

  const { history, frames } = buildTimeline(result.countries, nowISO);
  fs.writeFileSync(F.timeline, `${JSON.stringify({ ...history, frames }, null, 1)}\n`);

  fs.writeFileSync(F.status, `${JSON.stringify({
    updatedAt: nowISO,
    status: failedCountries.length === 0 ? 'ok' : (successful.length ? 'partial' : 'failed'),
    hasData: true,
    successfulCountries: successful,
    failedCountries,
    errors,
  }, null, 1)}\n`);

  process.stdout.write(
    `build: ${successful.length}/${attempted.length} countries, ` +
    `${result.countries.reduce((n, c) => n + c.topics.length, 0)} topics, ` +
    `${frames.length} timeline frames\n`,
  );
  return 0;
}

if (require.main === module) process.exitCode = run();

module.exports = { build, buildTimeline, activityFromScores, statusFor, fingerprint };
