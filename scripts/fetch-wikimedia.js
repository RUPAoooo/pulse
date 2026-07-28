/**
 * fetch-wikimedia.js — most-read Wikipedia articles per country.
 *
 * Primary:  /metrics/pageviews/top-per-country/{country}/all-access/{y}/{m}/{d}
 * Fallback: /metrics/pageviews/top/{project}/all-access/{y}/{m}/{d}
 *
 * The fallback is per *language edition*, not per country, so every country
 * record carries `perCountry` — the UI has to say so when it is false.
 *
 * Writes data/live-wikipedia.json. Never throws: a country that fails is
 * reported in the result and the others carry on.
 */

const fs = require('fs');
const path = require('path');
const { COUNTRIES, LIMITS, classify, getJSON } = require('./config');

const OUT = path.join(__dirname, '..', 'data', 'live-wikipedia.json');
const API = 'https://wikimedia.org/api/rest_v1/metrics/pageviews';

/* Pageviews data lands with a lag, so walk back a few days until one answers.
   Kept short: with 31 countries every extra day costs 31 more requests. */
const LOOKBACK_DAYS = LIMITS.wikiLookbackDays ?? 3;

function ymd(daysAgo) {
  const d = new Date(Date.now() - daysAgo * 86400000);
  return {
    y: String(d.getUTCFullYear()),
    m: String(d.getUTCMonth() + 1).padStart(2, '0'),
    d: String(d.getUTCDate()).padStart(2, '0'),
    iso: d.toISOString().slice(0, 10),
  };
}

const MAIN_PAGES = new Set([
  'Main_Page', 'メインページ', 'Wikipedia:メインページ', 'Accueil_principal',
  'Wikipédia:Accueil_principal', 'Wikipedia:Hauptseite', 'Hauptseite',
  '위키백과:대문', '대문', 'Special:Search', '-',
]);

/** Drops main pages, namespace pages (Special:, Portal:, …) and search pages. */
function isArticle(title) {
  if (!title || MAIN_PAGES.has(title)) return false;
  if (/^[A-Za-z]+:/.test(title) && !/^https?:/.test(title)) return false;
  if (/^(特別|特別:|Wikipedia|Wikipédia|위키백과|Portal|Kategorie|Category):/.test(title)) return false;
  return true;
}

function articleUrl(project, title) {
  const host = project.includes('.') ? `${project}.org` : `${project}.wikipedia.org`;
  return `https://${host}/wiki/${encodeURIComponent(title)}`;
}

/** Turns either API shape into our flat article rows. */
function shapeArticles(rawArticles, fallbackProject, limit) {
  return (rawArticles || [])
    .filter((a) => isArticle(a.article))
    .slice(0, limit)
    .map((a, i) => {
      const project = a.project || fallbackProject;
      const title = String(a.article).replace(/_/g, ' ');
      return {
        rank: i + 1,
        title,
        views: Number(a.views_ceil ?? a.views ?? 0),
        url: articleUrl(project, a.article),
        project,
        category: classify(title),
      };
    });
}

async function topPerCountry(code, day) {
  const url = `${API}/top-per-country/${code}/all-access/${day.y}/${day.m}/${day.d}`;
  process.stdout.write(`  ${code} Wikimedia request: ${url}\n`);
  const json = await getJSON(url);
  const articles = json?.items?.[0]?.articles;
  process.stdout.write(`  ${code} Wikimedia status: 200 (per-country ${day.iso})\n`);
  if (!Array.isArray(articles) || !articles.length) throw new Error('no articles in response');
  process.stdout.write(`  ${code} Wikimedia raw items: ${articles.length}\n`);
  return articles;
}

async function topPerProject(project, day) {
  const url = `${API}/top/${project}/all-access/${day.y}/${day.m}/${day.d}`;
  process.stdout.write(`  ${project} Wikimedia request: ${url}\n`);
  const json = await getJSON(url);
  const articles = json?.items?.[0]?.articles;
  process.stdout.write(`  ${project} Wikimedia status: 200 (per-project ${day.iso})\n`);
  if (!Array.isArray(articles) || !articles.length) throw new Error('no articles in response');
  process.stdout.write(`  ${project} Wikimedia raw items: ${articles.length}\n`);
  return articles;
}

async function fetchCountry(entry) {
  const errors = [];

  for (let back = 1; back <= LOOKBACK_DAYS; back += 1) {
    const day = ymd(back);
    try {
      const raw = await topPerCountry(entry.code, day);
      return {
        code: entry.code,
        perCountry: true,
        project: entry.wiki,
        date: day.iso,
        articles: shapeArticles(raw, entry.wiki, LIMITS.wikiPerCountry),
      };
    } catch (e) {
      errors.push(`per-country ${day.iso}: ${e.message}`);
    }
  }

  for (let back = 1; back <= LOOKBACK_DAYS; back += 1) {
    const day = ymd(back);
    try {
      const raw = await topPerProject(entry.wiki, day);
      return {
        code: entry.code,
        perCountry: false,          // language edition, not the country
        project: entry.wiki,
        date: day.iso,
        articles: shapeArticles(raw, entry.wiki, LIMITS.wikiPerCountry),
      };
    } catch (e) {
      errors.push(`per-project ${day.iso}: ${e.message}`);
    }
  }

  throw new Error(errors[errors.length - 1] || 'unknown error');
}

async function run() {
  const countries = [];
  const failed = [];
  const perCountry = {};              // code -> { items, perCountry, date }
  let rawItemTotal = 0;

  process.stdout.write(`Wikimedia: fetching ${COUNTRIES.length} countries\n`);

  for (const entry of COUNTRIES) {
    try {
      const result = await fetchCountry(entry);
      if (!result.articles.length) throw new Error('no usable articles after filtering');
      rawItemTotal += result.articles.length;
      countries.push(result);
      perCountry[entry.code] = {
        items: result.articles.length,
        perCountry: result.perCountry,
        date: result.date,
      };
      process.stdout.write(
        `  ${entry.code} Wikimedia items: ${result.articles.length} ` +
        `(${result.perCountry ? 'per-country' : 'per-language'}, ${result.date}) — OK\n`,
      );
    } catch (e) {
      failed.push({ country: entry.code, source: 'wikimedia', message: e.message });
      perCountry[entry.code] = { items: 0, error: e.message };
      process.stdout.write(`  ${entry.code} Wikimedia: FAILED — ${e.message}\n`);
    }
    await new Promise((r) => setTimeout(r, LIMITS.wikiDelayMs ?? 250));
  }

  const payload = {
    fetchedAt: new Date().toISOString(),
    source: 'Wikimedia Pageviews API',
    countries,
  };

  const rel = path.relative(process.cwd(), OUT);
  if (countries.length) {
    fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 1)}\n`);
    process.stdout.write(`Wikimedia wrote: ${rel} (${countries.length} countries, ${rawItemTotal} articles)\n`);
  } else {
    process.stdout.write(`Wikimedia wrote: nothing — no country returned usable data; ${rel} left unchanged\n`);
  }

  process.stdout.write(
    `Wikimedia summary: ok=[${countries.map((c) => c.code).join(',')}] ` +
    `failed=[${failed.map((f) => f.country).join(',')}]\n`,
  );

  return { ok: countries.map((c) => c.code), failed, items: rawItemTotal, perCountry };
}

if (require.main === module) {
  run().then((r) => {
    fs.writeFileSync(
      path.join(__dirname, '.wikimedia-result.json'),
      JSON.stringify(r, null, 1),
    );
    process.stdout.write(`Wikimedia wrote: scripts/.wikimedia-result.json\n`);
  }).catch((e) => {
    process.stdout.write(`Wikimedia: fatal — ${e.message}\n`);
    fs.writeFileSync(
      path.join(__dirname, '.wikimedia-result.json'),
      JSON.stringify({ ok: [], failed: [{ country: '*', source: 'wikimedia', message: e.message }], items: 0, perCountry: {} }, null, 1),
    );
  });
}

module.exports = { run, shapeArticles, isArticle, articleUrl };
