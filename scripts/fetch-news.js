/**
 * fetch-news.js — recent news per country from GDELT DOC 2.0 (no API key).
 *
 * One source only, on purpose. GDELT hands back the publisher's own URL plus
 * domain, language, country and timestamp, which is exactly the field set the
 * UI needs, so nothing has to be invented.
 *
 * Writes data/live-news.json. A country that fails is skipped, not fatal.
 */

const fs = require('fs');
const path = require('path');
const {
  COUNTRIES, LIMITS, JP_DISASTER_TERMS,
  classify, normaliseTitle, getJSON,
} = require('./config');

const OUT = path.join(__dirname, '..', 'data', 'live-news.json');
const API = 'https://api.gdeltproject.org/api/v2/doc/doc';

/** GDELT timestamps look like 20260727T110000Z. */
function parseSeenDate(s) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(String(s || ''));
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
}

/** Publisher name from the domain: "www.bbc.co.uk" → "bbc.co.uk". */
function outletFrom(domain) {
  return String(domain || '').replace(/^www\./, '');
}

function buildQuery(entry, { disaster = false } = {}) {
  const q = disaster
    ? `sourcecountry:${entry.gdelt} (${JP_DISASTER_TERMS.join(' OR ')})`
    : `sourcecountry:${entry.gdelt} sourcelang:${entry.lang}`;
  const params = new URLSearchParams({
    query: q,
    mode: 'ArtList',
    format: 'json',
    maxrecords: String(LIMITS.newsRequestRecords ?? 100),
    timespan: '24h',
    sort: 'DateDesc',
  });
  return `${API}?${params.toString()}`;
}

/**
 * Cheap dedupe, in this order:
 *   same URL → drop; identical normalised title → drop;
 *   one title fully containing another (headline restated) → drop;
 *   more than LIMITS.maxPerDomain from one outlet → drop.
 */
function dedupe(articles, limit) {
  const seenUrl = new Set();
  const keys = [];
  const perDomain = new Map();
  const out = [];

  for (const a of articles) {
    if (!a.url || !a.title) continue;
    const url = a.url.split('#')[0];
    if (seenUrl.has(url)) continue;

    const key = normaliseTitle(a.title);
    if (!key || key.length < 8) continue;
    if (keys.some((k) => k === key || (k.length > 20 && (k.includes(key) || key.includes(k))))) continue;

    const outlet = outletFrom(a.domain);
    const used = perDomain.get(outlet) || 0;
    if (used >= LIMITS.maxPerDomain) continue;

    seenUrl.add(url);
    keys.push(key);
    perDomain.set(outlet, used + 1);
    out.push({ ...a, url });
    if (out.length >= limit) break;
  }
  return out;
}

async function requestArticles(entry, options = {}) {
  const label = options.disaster ? 'disaster' : 'latest';
  const url = buildQuery(entry, options);
  process.stdout.write(`  ${entry.code} GDELT ${label} request: ${url}\n`);

  let json;
  try {
    json = await getJSON(url);
    process.stdout.write(`  ${entry.code} GDELT ${label} status: 200\n`);
  } catch (e) {
    process.stdout.write(`  ${entry.code} GDELT ${label} status: ${e.message}\n`);
    throw e;
  }

  const raw = Array.isArray(json?.articles) ? json.articles : null;
  if (!raw) throw new Error('no articles array in response');
  process.stdout.write(`  ${entry.code} GDELT ${label} raw articles: ${raw.length}\n`);

  return raw.map((a, i) => ({
    title: String(a.title || '').trim(),
    url: a.url,
    domain: a.domain,
    language: a.language,
    sourceCountry: a.sourcecountry,
    publishedAt: parseSeenDate(a.seendate),
    feedRank: i + 1,
    queryType: label,
  })).filter((a) => a.title && a.url);
}

function publishedTime(article) {
  const value = new Date(article.publishedAt || 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

async function fetchCountry(entry) {
  const batches = [];
  const errors = [];

  try {
    batches.push(await requestArticles(entry));
  } catch (e) {
    errors.push(`latest: ${e.message}`);
  }

  if (entry.code === 'JP') {
    try {
      batches.push(await requestArticles(entry, { disaster: true }));
    } catch (e) {
      errors.push(`disaster: ${e.message}`);
    }
  }

  if (!batches.length) throw new Error(errors.join(' | ') || 'no GDELT response');

  const shaped = batches.flat().sort((a, b) =>
    publishedTime(b) - publishedTime(a)
    || Number(b.queryType === 'disaster') - Number(a.queryType === 'disaster')
    || a.feedRank - b.feedRank);

  const kept = dedupe(shaped, LIMITS.newsPerCountry);
  process.stdout.write(`  ${entry.code} GDELT after dedupe: ${kept.length}\n`);
  if (!kept.length) throw new Error('all articles filtered out by dedupe');

  if (entry.code === 'JP') {
    const acquired = batches.reduce((sum, batch) => sum + batch.length, 0);
    process.stdout.write(`  JP GDELT acquired: ${acquired}\n`);
    process.stdout.write(`  JP latest publishedAt: ${kept[0]?.publishedAt ?? 'unknown'}\n`);
  }

  return {
    code: entry.code,
    articles: kept.map((a, i) => ({
      rank: i + 1,
      title: a.title,
      outlet: outletFrom(a.domain),
      url: a.url,
      publishedAt: a.publishedAt,
      language: a.language || entry.lang,
      country: entry.code,
      category: classify(a.title),
      source: 'GDELT',
      queryType: a.queryType,
    })),
  };
}

async function run() {
  const countries = [];
  const failed = [];
  const perCountry = {};              // code -> { items } or { items: 0, error }
  let keptTotal = 0;

  process.stdout.write(`News (GDELT): fetching ${COUNTRIES.length} countries\n`);

  for (const entry of COUNTRIES) {
    try {
      const result = await fetchCountry(entry);
      keptTotal += result.articles.length;
      countries.push(result);
      perCountry[entry.code] = { items: result.articles.length };
      process.stdout.write(`  ${entry.code} GDELT items: ${result.articles.length} — OK\n`);
    } catch (e) {
      failed.push({ country: entry.code, source: 'news', message: e.message });
      perCountry[entry.code] = { items: 0, error: e.message };
      process.stdout.write(`  ${entry.code} GDELT: FAILED — ${e.message}\n`);
    }
    await new Promise((r) => setTimeout(r, LIMITS.newsDelayMs ?? 900));   // be polite to GDELT
  }

  const payload = {
    fetchedAt: new Date().toISOString(),
    source: 'GDELT DOC 2.0 API',
    countries,
  };

  const rel = path.relative(process.cwd(), OUT);
  if (countries.length) {
    fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 1)}\n`);
    process.stdout.write(`News wrote: ${rel} (${countries.length} countries, ${keptTotal} articles)\n`);
  } else {
    process.stdout.write(`News wrote: nothing — no country returned usable data; ${rel} left unchanged\n`);
  }

  process.stdout.write(
    `News summary: ok=[${countries.map((c) => c.code).join(',')}] ` +
    `failed=[${failed.map((f) => f.country).join(',')}]\n`,
  );

  return { ok: countries.map((c) => c.code), failed, items: keptTotal, perCountry };
}

if (require.main === module) {
  run().then((r) => {
    fs.writeFileSync(path.join(__dirname, '.news-result.json'), JSON.stringify(r, null, 1));
    process.stdout.write(`News wrote: scripts/.news-result.json\n`);
  }).catch((e) => {
    process.stdout.write(`News: fatal — ${e.message}\n`);
    fs.writeFileSync(
      path.join(__dirname, '.news-result.json'),
      JSON.stringify({ ok: [], failed: [{ country: '*', source: 'news', message: e.message }], items: 0, perCountry: {} }, null, 1),
    );
  });
}

module.exports = {
  run, dedupe, parseSeenDate, outletFrom, buildQuery, requestArticles, publishedTime,
};
