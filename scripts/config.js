/**
 * config.js — the single place where the pipeline's country list lives.
 * Adding a country means adding one row here (and, for the map, making sure
 * data/countries.json already knows the code — it carries 85 of them).
 */

const COUNTRIES = [
  // code  wiki project        GDELT sourcecountry (FIPS 10-4) / language
  { code: 'JP', wiki: 'ja.wikipedia', gdelt: 'JA', lang: 'japanese' },
  { code: 'US', wiki: 'en.wikipedia', gdelt: 'US', lang: 'english' },
  { code: 'GB', wiki: 'en.wikipedia', gdelt: 'UK', lang: 'english' },
  { code: 'FR', wiki: 'fr.wikipedia', gdelt: 'FR', lang: 'french' },
  { code: 'DE', wiki: 'de.wikipedia', gdelt: 'GM', lang: 'german' },
  { code: 'KR', wiki: 'ko.wikipedia', gdelt: 'KS', lang: 'korean' },
  { code: 'IN', wiki: 'en.wikipedia', gdelt: 'IN', lang: 'english' },
  { code: 'AU', wiki: 'en.wikipedia', gdelt: 'AS', lang: 'english' },
];

const LIMITS = {
  newsPerCountry: 12,     // kept after dedupe
  wikiPerCountry: 10,
  maxPerDomain: 3,        // stops one outlet owning the list
  historyHours: 25,       // rolling window kept in live-timeline.json
  requestTimeoutMs: 20000,
};

const USER_AGENT =
  'WorldPulse/1.0 (https://github.com/RUPAoooo/pulse - static trend visualiser; contact via repository issues)';

/**
 * Deliberately crude keyword classification — no AI, no API.
 * First rule that matches wins; anything unmatched becomes OTHER.
 */
const CATEGORY_RULES = [
  ['WEATHER', ['weather', 'storm', 'typhoon', 'hurricane', 'cyclone', 'flood', 'heatwave', 'heat wave', 'snow', 'rain', 'quake', 'earthquake', 'tsunami', 'wildfire', 'drought',
    '台風', '大雨', '豪雨', '地震', '津波', '天気', '気温', '猛暑', '洪水', '警報',
    'wetter', 'sturm', 'météo', 'tempête', 'canicule', '날씨', '태풍', '지진']],
  ['SPORTS', ['football', 'soccer', 'baseball', 'basketball', 'cricket', 'olympic', 'tennis', 'rugby', 'golf', 'league', 'match', 'tournament', 'championship', 'world cup', 'formula 1',
    'サッカー', '野球', '五輪', 'オリンピック', '選手', '優勝', '試合', 'リーグ', '相撲',
    'fußball', 'bundesliga', 'ligue 1', '축구', '야구', '올림픽']],
  ['TECH', ['ai ', ' ai', 'artificial intelligence', 'software', 'chip', 'semiconductor', 'smartphone', 'iphone', 'android', 'startup', 'app', 'robot', 'cyber', 'data centre', 'data center', 'quantum', 'internet', 'tech',
    'ai', '人工知能', 'スマホ', '半導体', 'アプリ', 'ロボット', 'サイバー', 'デジタル',
    'technologie', 'künstliche intelligenz', '인공지능', '반도체']],
  ['BUSINESS', ['market', 'stock', 'shares', 'economy', 'inflation', 'trade', 'tariff', 'bank', 'revenue', 'profit', 'merger', 'ipo', 'currency', 'yen', 'dollar', 'euro', 'price',
    '株', '市場', '経済', '物価', '円安', '円高', '決算', '企業', '関税', '金利',
    'wirtschaft', 'börse', 'économie', 'bourse', '경제', '증시']],
  ['POLITICS', ['election', 'parliament', 'minister', 'president', 'senate', 'congress', 'policy', 'government', 'vote', 'party', 'diplomat', 'sanction', 'summit', 'bill', 'law',
    '選挙', '国会', '首相', '大統領', '政府', '政権', '与党', '野党', '法案', '外交',
    'wahl', 'regierung', 'élection', 'gouvernement', '선거', '대통령', '국회']],
  ['SCIENCE', ['research', 'study', 'scientist', 'space', 'nasa', 'satellite', 'climate', 'physics', 'biology', 'vaccine', 'health', 'medical', 'disease', 'telescope', 'ocean',
    '研究', '科学', '宇宙', '衛星', '気候', 'ワクチン', '医療', '感染', '発見', '観測',
    'forschung', 'wissenschaft', 'recherche', 'espace', '연구', '우주']],
  ['ENTERTAINMENT', ['film', 'movie', 'series', 'album', 'music', 'concert', 'actor', 'actress', 'singer', 'drama', 'anime', 'game', 'netflix', 'box office', 'celebrity', 'star',
    '映画', 'ドラマ', '音楽', 'ライブ', '俳優', '女優', '歌手', 'アニメ', 'ゲーム', '声優',
    'kino', 'musik', 'cinéma', 'musique', '영화', '드라마', '가수', '아이돌']],
  ['CULTURE', ['museum', 'art', 'exhibition', 'festival', 'literature', 'book', 'novel', 'heritage', 'tradition', 'design', 'architecture', 'food', 'cuisine',
    '美術', '展覧会', '祭', '文学', '小説', '文化', '伝統', '建築', '料理', '世界遺産',
    'kunst', 'kultur', 'musée', 'culture', '문화', '전시']],
  ['WORLD', ['war', 'conflict', 'border', 'refugee', 'united nations', 'un ', 'nato', 'peace', 'treaty', 'global', 'international', 'foreign',
    '国際', '世界', '紛争', '停戦', '国連', '難民', '海外',
    'welt', 'international', 'monde', '국제', '세계']],
];

const CATEGORIES = [
  'WORLD', 'TECH', 'CULTURE', 'SPORTS', 'SCIENCE',
  'ENTERTAINMENT', 'POLITICS', 'BUSINESS', 'WEATHER', 'OTHER',
];

/** Lower-cases, strips punctuation and collapses whitespace — for dedupe keys. */
function normaliseTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d'"`]/g, '')
    .replace(/[!-/:-@[-`{-~\u3000-\u303f\uff01-\uff65]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function classify(title) {
  const hay = ` ${normaliseTitle(title)} `;
  for (const [category, words] of CATEGORY_RULES) {
    for (const w of words) {
      const needle = normaliseTitle(w);
      if (needle && hay.includes(needle)) return category;
    }
  }
  return 'OTHER';
}

/** fetch with a timeout and a descriptive User-Agent (Wikimedia requires one). */
async function getText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIMITS.requestTimeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function getJSON(url) {
  const text = await getText(url);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`response was not JSON (${text.slice(0, 80).replace(/\s+/g, ' ')})`);
  }
}

module.exports = {
  COUNTRIES, LIMITS, CATEGORIES, CATEGORY_RULES, USER_AGENT,
  normaliseTitle, classify, getText, getJSON,
};
