/**
 * i18n.js — all UI strings live here.
 * Nothing else in the app should contain user-visible Japanese or English text.
 */

export const LANGS = ['ja', 'en'];

const DICT = {
  'app.name':          { ja: 'WORLD PULSE',      en: 'WORLD PULSE' },
  'app.nameJa':        { ja: '世界の脈拍',        en: 'THE PULSE OF THE WORLD' },
  'app.tagline':       { ja: '世界は今、何を見ているのか。', en: 'What is the world watching right now?' },

  'intro.en':          { ja: 'THE WORLD, RIGHT NOW.', en: 'THE WORLD, RIGHT NOW.' },
  'intro.ja':          { ja: '世界は今、何を見ているのか。', en: '世界は今、何を見ているのか。' },

  'hint.select':       { ja: '国を選択',          en: 'Select a country' },
  'hint.selectLong':   { ja: '地図の光っている国を選ぶと、その国の話題が開きます。',
                         en: 'Pick a lit country on the map to open its topics.' },

  'nav.worldNow':      { ja: 'WORLD NOW',        en: 'WORLD NOW' },
  'nav.links':         { ja: '接続線',            en: 'LINKS' },
  'nav.linksTitle':    { ja: 'GLOBALな話題の広がりを地図上に表示します',
                         en: 'Draw how global topics spread between countries' },
  'nav.lang':          { ja: '表示言語',          en: 'Language' },
  'nav.pickCountry':   { ja: '国を検索して選ぶ',   en: 'Find a country' },

  'filter.category':   { ja: 'カテゴリー',        en: 'Category' },
  'filter.scope':      { ja: '範囲',              en: 'Scope' },

  'scope.ALL':         { ja: 'すべて',            en: 'ALL' },
  'scope.GLOBAL':      { ja: 'GLOBAL',           en: 'GLOBAL' },
  'scope.LOCAL':       { ja: 'LOCAL',            en: 'LOCAL' },

  'filter.source':     { ja: '情報の種類',        en: 'Source' },
  'source.ALL':        { ja: 'ALL',              en: 'ALL' },
  'source.NEWS':       { ja: 'NEWS',             en: 'NEWS' },
  'source.WIKIPEDIA':  { ja: 'WIKIPEDIA',        en: 'WIKIPEDIA' },

  'data.live':         { ja: 'LIVE DATA',        en: 'LIVE DATA' },
  'data.stale':        { ja: 'LAST AVAILABLE DATA', en: 'LAST AVAILABLE DATA' },
  'data.demo':         { ja: 'DEMO DATA',        en: 'DEMO DATA' },
  'data.demoNote':     { ja: 'これはサンプルデータです', en: 'This is sample data' },
  'data.updatedAt':    { ja: '最終更新',          en: 'Updated' },
  'data.fetchedAt':    { ja: '最終取得',          en: 'Last fetched' },
  'data.partial':      { ja: '一部の国の取得に失敗しています', en: 'Some countries failed to update' },

  'sec.news':          { ja: 'ニュース',          en: 'News' },
  'sec.wikipedia':     { ja: 'Wikipedia でよく読まれている記事',
                         en: 'Most-read on Wikipedia' },
  'sec.wikiLangNote':  { ja: 'このデータは国別ではなく、言語版Wikipediaの閲覧傾向です',
                         en: 'This reflects a language edition of Wikipedia, not the country itself' },

  'topic.outlet':      { ja: '媒体',              en: 'Outlet' },
  'topic.published':   { ja: '公開日時',          en: 'Published' },
  'topic.views':       { ja: '閲覧数',            en: 'Views' },
  'topic.wikiRank':    { ja: '順位',              en: 'Rank' },
  'topic.country':     { ja: '対象国',            en: 'Country' },
  'topic.openArticle': { ja: '元記事を読む',      en: 'Read the article' },
  'topic.openWiki':    { ja: 'Wikipedia で開く',  en: 'Open in Wikipedia' },
  'topic.newTab':      { ja: '新しいタブで開きます', en: 'Opens in a new tab' },
  'scope.GLOBAL.note': { ja: '複数の国で同時に注目されている話題',
                         en: 'Topics rising in several countries at once' },
  'scope.LOCAL.note':  { ja: 'その国で特に注目されている話題',
                         en: 'Topics that stand out in this country only' },

  'cat.ALL':           { ja: 'すべて',            en: 'ALL' },
  'cat.WORLD':         { ja: '世界',              en: 'WORLD' },
  'cat.TECH':          { ja: 'テクノロジー',      en: 'TECH' },
  'cat.CULTURE':       { ja: '文化',              en: 'CULTURE' },
  'cat.SPORTS':        { ja: 'スポーツ',          en: 'SPORTS' },
  'cat.SCIENCE':       { ja: '科学',              en: 'SCIENCE' },
  'cat.ENTERTAINMENT': { ja: 'エンタメ',          en: 'ENTERTAINMENT' },
  'cat.POLITICS':      { ja: '政治・行政',        en: 'POLITICS' },
  'cat.BUSINESS':      { ja: '経済',              en: 'BUSINESS' },
  'cat.WEATHER':       { ja: '天候',              en: 'WEATHER' },
  'cat.OTHER':         { ja: 'その他',            en: 'OTHER' },

  'status.emerging':   { ja: '発生',              en: 'EMERGING' },
  'status.rising':     { ja: '急上昇',            en: 'RISING' },
  'status.peak':       { ja: 'ピーク',            en: 'PEAK' },
  'status.stable':     { ja: '継続',              en: 'STABLE' },
  'status.declining':  { ja: '沈静化',            en: 'DECLINING' },

  'panel.activity':    { ja: '関心の活発度',      en: 'Activity' },
  'panel.rising':      { ja: '上昇中',            en: 'Rising' },
  'panel.localTime':   { ja: '現在時刻',          en: 'Local time' },
  'panel.updated':     { ja: 'データ更新',        en: 'Data updated' },
  'panel.change24':    { ja: '24時間の変化',      en: 'Last 24 hours' },
  'panel.topics':      { ja: '注目されている話題', en: 'Top topics' },
  'panel.close':       { ja: '閉じる',            en: 'Close' },
  'panel.noData':      { ja: '現在表示できるデータはありません',
                         en: 'No data available for this country yet.' },
  'panel.noDataNote':  { ja: 'サンプルデータは32か国分のみです。',
                         en: 'The sample data only covers 32 countries.' },
  'panel.noTopics':    { ja: 'この条件に一致する話題はありません',
                         en: 'No topics match the current filter.' },
  'panel.of':          { ja: '件中',              en: 'of' },
  'panel.shown':       { ja: '件を表示',          en: 'shown' },

  'topic.score':       { ja: '注目度',            en: 'Score' },
  'topic.change':      { ja: '前回比',            en: 'Change' },
  'topic.status':      { ja: '状態',              en: 'Status' },
  'topic.origin':      { ja: '発生した国',        en: 'Started in' },
  'topic.watching':    { ja: '現在注目している国', en: 'Watching now' },
  'topic.keywords':    { ja: '関連キーワード',    en: 'Keywords' },
  'topic.sources':     { ja: '情報源の種類',      en: 'Source types' },
  'topic.started':     { ja: '発生時刻',          en: 'Started at' },
  'topic.duration':    { ja: '継続時間',          en: 'Duration' },
  'topic.hours':       { ja: '時間',              en: 'h' },
  'topic.summary':     { ja: '要約',              en: 'Summary' },
  'topic.linkNote':    { ja: '記事リンクはサンプルのため用意していません。',
                         en: 'Article links are not part of this sample data.' },
  'topic.openHint':    { ja: '話題を選ぶと詳細が開きます', en: 'Select a topic for details' },

  'world.title':       { ja: 'WORLD NOW',        en: 'WORLD NOW' },
  'world.subtitle':    { ja: '世界全体の状態',    en: 'The world as a whole' },
  'world.top':         { ja: '世界の上位話題',    en: 'Top topics worldwide' },
  'world.multi':       { ja: '複数国で同時に上昇中', en: 'Rising in several countries' },
  'world.active':      { ja: '最も活発な国',      en: 'Most active countries' },
  'world.cats':        { ja: '上昇中のカテゴリー', en: 'Rising categories' },
  'world.countries':   { ja: 'か国',              en: 'countries' },
  'world.avgChange':   { ja: '平均変化',          en: 'avg. change' },
  'world.none':        { ja: '該当する話題はありません', en: 'Nothing matches this filter.' },

  'time.label':        { ja: '時刻',              en: 'Timeline' },
  'time.title':        { ja: 'グローバル・アクティビティ タイムライン',
                         en: 'Global activity timeline' },
  'time.sub':          { ja: '世界の関心の推移',    en: 'How the world\u2019s attention moved' },
  'time.now':          { ja: '現在',              en: 'NOW' },
  'time.viewing':      { ja: '表示中の時刻',      en: 'Viewing' },
  'time.ago':          { ja: '時間前',            en: 'h ago' },

  'loading':           { ja: 'データを読み込んでいます', en: 'Loading trend data' },
  'error.title':       { ja: 'データを読み込めませんでした。',
                         en: 'Trend data could not be loaded.' },
  'error.hint':        { ja: 'data/ 内のJSONを読み込めませんでした。ローカルで開く場合は簡易サーバー経由で表示してください。',
                         en: 'The JSON files in data/ could not be read. When running locally, serve the folder over http instead of opening the file directly.' },
  'error.retry':       { ja: '再読み込み',        en: 'Reload' },
  'error.partial':     { ja: '一部の国のデータを読み込めませんでした。',
                         en: 'Some country data could not be loaded.' },

  'legend.title':      { ja: 'グローバル・アテンション', en: 'Global attention' },
  'legend.high':       { ja: '高',                en: 'High' },
  'legend.low':        { ja: '低',                en: 'Low' },
  'legend.active':     { ja: 'アクティブな国・地域', en: 'Active country / region' },
  'legend.spread':     { ja: 'トピックの広がり',    en: 'How a topic spreads' },
  'legend.night':      { ja: '夜の側',            en: 'Night side' },

  'panel.trendTopics': { ja: 'トレンドトピック',    en: 'Trending topics' },
  'panel.showAll':     { ja: 'すべてのトレンドを見る', en: 'See all trends' },
  'panel.showLess':    { ja: '表示を戻す',          en: 'Show fewer' },

  'metric.news':       { ja: 'ニュース件数',        en: 'News items' },
  'metric.wikiViews':  { ja: 'Wikipedia閲覧数',    en: 'Wikipedia views' },
  'metric.rising':     { ja: '上昇中',            en: 'Rising' },
  'metric.global':     { ja: 'GLOBAL話題',        en: 'Global topics' },
  'metric.local':      { ja: 'LOCAL話題',         en: 'Local topics' },
  'metric.topics':     { ja: '話題の総数',         en: 'Topics' },
  'metric.unitItems':  { ja: '件',                en: 'items' },
  'metric.unitViews':  { ja: '24H',               en: '24H' },

  'an.title':          { ja: '取得サマリー',       en: 'Fetch summary' },
  'an.ratio':          { ja: 'データソース比率',    en: 'Source mix' },
  'an.cats':           { ja: 'カテゴリー上位',      en: 'Top categories' },
  'an.updated':        { ja: '最終更新',           en: 'Last updated' },
  'an.state':          { ja: '取得状態',           en: 'Fetch state' },
  'an.coverage':       { ja: '取得できた国',       en: 'Countries with data' },
  'an.noLive':         { ja: 'No live data',      en: 'No live data' },
  'an.noLiveNote':     { ja: '実データはまだ取得されていません。表示中はサンプルデータです。',
                         en: 'No live fetch has run yet — the sample data is on screen.' },

  'state.success':     { ja: '成功',               en: 'Success' },
  'state.partial':     { ja: '一部成功',           en: 'Partial' },
  'state.failed':      { ja: '失敗',               en: 'Failed' },
  'state.empty':       { ja: 'データなし',         en: 'Empty' },
  'state.never':       { ja: '未実行',             en: 'Never run' },

  'nodata.sample':     { ja: 'サンプルデータを表示中のため、この国の実データはありません。',
                         en: 'The sample data is on screen, so this country has no live data.' },
  'nodata.notTarget':  { ja: 'この国は現在、実データ取得の対象外です。',
                         en: 'This country is not part of the live fetch yet.' },
  'nodata.failed':     { ja: 'この国は取得対象ですが、直近の取得に失敗しました。',
                         en: 'This country is a target, but the last fetch failed.' },
  'nodata.empty':      { ja: 'この国は取得対象ですが、直近の取得ではデータがありませんでした。',
                         en: 'This country is a target, but the last fetch returned nothing.' },
  'nodata.newsOnly':   { ja: 'ニュースのみ取得できました。',
                         en: 'News only — Wikipedia returned nothing.' },
  'nodata.wikiOnly':   { ja: 'Wikipediaのみ取得できました。',
                         en: 'Wikipedia only — news returned nothing.' },
  'nodata.lastTry':    { ja: '最終取得',           en: 'Last attempt' },
  'nodata.targets':    { ja: '取得対象',           en: 'Targets' },

  'a11y.map':          { ja: '世界地図。国を選ぶとその国の話題が開きます。',
                         en: 'World map. Choose a country to open its topics.' },
  'a11y.activity':     { ja: '活発度',            en: 'activity' },
  'a11y.noData':       { ja: 'データなし',        en: 'no data' },
  'a11y.escClose':     { ja: 'Escキーで閉じます', en: 'Press Esc to close' },
};

let current = 'ja';
const listeners = new Set();

/** Best guess from the browser, defaulting to Japanese. */
export function detectLang() {
  const nav = (navigator.languages || [navigator.language || 'ja']).join(',');
  return /\bja\b/i.test(nav) ? 'ja' : 'en';
}

export function getLang() {
  return current;
}

export function setLang(lang) {
  if (!LANGS.includes(lang) || lang === current) return;
  current = lang;
  document.documentElement.lang = lang;
  listeners.forEach((fn) => fn(current));
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Translate a key. */
export function t(key) {
  const entry = DICT[key];
  if (!entry) return key;
  return entry[current] ?? entry.en ?? key;
}

/** Pick the right field out of a `{ja, en}` value coming from the data files. */
export function pick(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return value[current] ?? value.en ?? value.ja ?? '';
}

/** BCP-47 locale used for dates and numbers. */
export function locale() {
  return current === 'ja' ? 'ja-JP' : 'en-GB';
}

/** Applies text to every element carrying data-i18n. */
export function applyStaticText(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nLabel));
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.setAttribute('title', t(el.dataset.i18nTitle));
  });
}
