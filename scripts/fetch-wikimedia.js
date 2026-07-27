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

/* Pageviews data lands with a lag, so walk back a few days until one answers. */
const LOOKBACK_DAYS = 4;

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
  const json = await getJSON(url);
  const articles = json?.items?.[0]?.articles;
  if (!Array.isArray(articles) || !articles.length) throw new Error('no articles in response');
  return articles;
}

async function topPerProject(project, day) {
  const url = `${API}/top/${project}/all-access/${day.y}/${day.m}/${day.d}`;
  const json = await getJSON(url);
  const articles = json?.items?.[0]?.articles;
  if (!Array.isArray(articles) || !articles.length) throw new Error('no articles in response');
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

  for (const entry of COUNTRIES) {
    try {
      const result = await fetchCountry(entry);
      if (!result.articles.length) throw new Error('no usable articles');
      countries.push(result);
      process.stdout.write(
        `wiki ${entry.code}: ${result.articles.length} articles ` +
        `(${result.perCountry ? 'per-country' : 'per-language'}, ${result.date})\n`,
      );
    } catch (e) {
      failed.push({ country: entry.code, source: 'wikimedia', message: e.message });
      process.stdout.write(`wiki ${entry.code}: FAILED — ${e.message}\n`);
    }
  }

  const payload = {
    fetchedAt: new Date().toISOString(),
    source: 'Wikimedia Pageviews API',
    countries,
  };

  if (countries.length) {
    fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 1)}\n`);
    process.stdout.write(`wrote ${path.relative(process.cwd(), OUT)}\n`);
  } else {
    // Nothing usable — leave whatever was there last time untouched.
    process.stdout.write('wiki: nothing fetched, keeping previous file\n');
  }

  return { ok: countries.map((c) => c.code), failed };
}

if (require.main === module) {
  run().then((r) => {
    fs.writeFileSync(
      path.join(__dirname, '.wikimedia-result.json'),
      JSON.stringify(r, null, 1),
    );
  }).catch((e) => {
    process.stdout.write(`wiki: fatal — ${e.message}\n`);
    fs.writeFileSync(
      path.join(__dirname, '.wikimedia-result.json'),
      JSON.stringify({ ok: [], failed: [{ country: '*', source: 'wikimedia', message: e.message }] }, null, 1),
    );
  });
}

module.exports = { run, shapeArticles, isArticle, articleUrl };
