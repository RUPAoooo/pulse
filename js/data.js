/**
 * data.js — the only file that knows the shape of the files in data/.
 *
 * Swap `fetchTrendData()` for a real API call later; as long as it resolves to
 * the same raw shape (or `normalizeTrendData()` is updated to match), nothing
 * in the rendering layer has to change.
 */

const FILES = {
  grid: 'data/worldgrid.json',
  countries: 'data/countries.json',
  topics: 'data/topics.json',
  timeline: 'data/timeline.json',
  status: 'data/update-status.json',
  liveTopics: 'data/live-topics.json',
  liveTimeline: 'data/live-timeline.json',
};

/* ------------------------------------------------------------------ loading */

async function getJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

/**
 * Load order, as required by the brief:
 *   1. live data written by the GitHub Actions pipeline
 *   2. whatever that pipeline last managed to write
 *   3. the bundled sample — only if live data has never arrived
 *
 * `update-status.json` is always present in the repo, so step 1 costs one
 * small request and never a 404 in the console.
 */
export async function fetchTrendData() {
  const [grid, countries] = await Promise.all([
    getJSON(FILES.grid),
    getJSON(FILES.countries),
  ]);

  let status = null;
  try {
    status = await getJSON(FILES.status);
  } catch {
    status = null;                     // treat an unreadable status as "no live data"
  }

  if (status?.hasData) {
    try {
      const [topics, timeline] = await Promise.all([
        getJSON(FILES.liveTopics),
        getJSON(FILES.liveTimeline),
      ]);
      return { grid, countries, topics, timeline, status, mode: 'live' };
    } catch (e) {
      // Live files went missing or broke — fall through to the sample rather
      // than showing nothing, but say so.
      status = { ...status, hasData: false, liveError: e.message };
    }
  }

  const [topics, timeline] = await Promise.all([
    getJSON(FILES.topics),
    getJSON(FILES.timeline),
  ]);
  return { grid, countries, topics, timeline, status, mode: 'sample' };
}

/* ------------------------------------------------------------ normalisation */

const REQUIRED_TOPIC_FIELDS = ['id', 'title', 'category', 'scope', 'score'];

function usableTopic(topic) {
  return topic && REQUIRED_TOPIC_FIELDS.every((f) => topic[f] != null);
}

/**
 * Turns whatever the sources gave us into one flat, predictable model.
 * Countries without topics stay in the model but are marked `hasData: false`,
 * so a gap in one country never takes the whole map down.
 */
export function normalizeTrendData(raw) {
  const countries = new Map();
  const warnings = [];

  for (const c of raw.countries?.countries ?? []) {
    countries.set(c.code, {
      code: c.code,
      code3: c.code3 ?? '',
      name: c.name ?? { ja: c.code, en: c.code },
      tz: c.tz ?? 'UTC',
      centroid: c.centroid ?? { x: 0, y: 0 },
      bbox: c.bbox ?? null,
      hasData: false,
      activityScore: 0,
      risingCount: 0,
      topics: [],
    });
  }

  for (const c of raw.topics?.countries ?? []) {
    const country = countries.get(c.code);
    if (!country) {
      warnings.push(`unknown country code in topics.json: ${c.code}`);
      continue;
    }
    const topics = (c.topics ?? []).filter((t) => {
      if (usableTopic(t)) return true;
      warnings.push(`skipped malformed topic in ${c.code}`);
      return false;
    }).map((t) => ({
      id: t.id,
      title: t.title,
      summary: t.summary ?? { ja: '', en: '' },
      category: t.category,
      scope: t.scope === 'GLOBAL' ? 'GLOBAL' : 'LOCAL',
      score: Number(t.score) || 0,
      change: Number(t.change) || 0,
      status: t.status ?? 'stable',
      origin: t.origin ?? c.code,
      relatedCountries: t.relatedCountries ?? [c.code],
      startedAt: t.startedAt ?? null,
      durationHours: t.durationHours ?? null,
      keywords: t.keywords ?? [],
      sources: t.sources ?? [],
      /* live-data extras — absent in the sample, checked with `?.` everywhere */
      kind: t.kind ?? null,            // 'NEWS' | 'WIKI'
      url: t.url ?? null,
      outlet: t.outlet ?? null,
      publishedAt: t.publishedAt ?? null,
      views: t.views ?? null,
      rank: t.rank ?? null,
    }));
    if (!topics.length) continue;
    country.topics = topics;
    country.hasData = true;
    country.activityScore = Number(c.activityScore) || 0;
    country.risingCount = Number(c.risingCount) || 0;
    country.wikiPerCountry = c.wikiPerCountry ?? null;
  }

  const frames = (raw.timeline?.frames ?? []).map((f) => ({
    offsetHours: Number(f.offsetHours) || 0,
    label: f.label ?? { ja: `${f.offsetHours}h`, en: `${f.offsetHours}H` },
    shortLabel: f.shortLabel ?? `${f.offsetHours}H`,
    countries: f.countries ?? {},
  })).sort((a, b) => a.offsetHours - b.offsetHours);

  const grid = {
    cols: raw.grid?.meta?.cols ?? 120,
    rows: raw.grid?.meta?.rows ?? 48,
    cells: raw.grid?.cells ?? [],
  };

  const model = {
    mode: raw.mode === 'live' ? 'live' : 'sample',
    status: raw.status ?? null,
    wikiPerCountry: raw.topics?.wikiPerCountry !== false,
    updatedAt: raw.topics?.updatedAt ? new Date(raw.topics.updatedAt) : new Date(),
    countries,
    order: [...countries.keys()].sort(),
    targets: raw.countries?.targets ?? [...countries.values()].filter((c) => c.hasData).map((c) => c.code),
    frames: frames.length ? frames : [{ offsetHours: 0, label: { ja: '現在', en: 'NOW' }, shortLabel: 'NOW', countries: {} }],
    grid,
    warnings,
  };
  return model;
}

/* --------------------------------------------------------------- time slices */

const frameCache = new Map();

/**
 * Returns the world as it looked `offsetHours` ago:
 * Map<code, {activityScore, risingCount, topics[]}> with topics already sorted.
 */
export function getFrameState(model, offsetHours) {
  const key = String(offsetHours);
  if (frameCache.has(key)) return frameCache.get(key);

  const frame = model.frames.find((f) => f.offsetHours === offsetHours) ?? model.frames[0];
  const isNow = offsetHours === 0;
  const state = new Map();

  for (const country of model.countries.values()) {
    if (!country.hasData) {
      state.set(country.code, { code: country.code, hasData: false, activityScore: 0, risingCount: 0, topics: [] });
      continue;
    }
    // At NOW, topics.json is the single source of truth — edit it and the map moves.
    const slice = isNow ? null : frame.countries?.[country.code];
    const topics = country.topics.map((t) => {
      const s = slice?.topics?.[t.id];
      return s ? { ...t, score: s.score, change: s.change } : { ...t };
    }).sort((a, b) => b.score - a.score);

    state.set(country.code, {
      code: country.code,
      hasData: true,
      activityScore: slice?.activityScore ?? country.activityScore,
      risingCount: slice?.risingCount ?? country.risingCount,
      topics,
    });
  }
  frameCache.set(key, state);
  return state;
}

/** Activity recomputed from an arbitrary topic subset (used when filtering). */
export function activityFromTopics(topics) {
  if (!topics.length) return 0;
  const top = topics.map((t) => t.score).sort((a, b) => b - a).slice(0, 4);
  const avg = top.reduce((a, b) => a + b, 0) / top.length;
  return Math.round(0.55 * top[0] + 0.45 * avg);
}

/** Activity history oldest → newest, for the little 24 h sparkline. */
export function activityHistory(model, code) {
  return [...model.frames]
    .sort((a, b) => b.offsetHours - a.offsetHours)
    .map((f) => ({
      offsetHours: f.offsetHours,
      value: f.countries?.[code]?.activityScore ?? 0,
    }));
}

/** Every country currently carrying a given topic id, strongest first. */
export function countriesWithTopic(state, topicId) {
  const out = [];
  for (const entry of state.values()) {
    const hit = entry.topics.find((t) => t.id === topicId);
    if (hit) out.push({ code: entry.code, score: hit.score, change: hit.change, status: hit.status });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Aggregates the same topic id across countries — the WORLD NOW view. */
export function worldTopics(state, filterFn = () => true) {
  const bucket = new Map();
  for (const entry of state.values()) {
    for (const topic of entry.topics) {
      if (!filterFn(topic)) continue;
      let agg = bucket.get(topic.id);
      if (!agg) {
        agg = { topic, codes: [], totalScore: 0, totalChange: 0 };
        bucket.set(topic.id, agg);
      }
      agg.codes.push(entry.code);
      agg.totalScore += topic.score;
      agg.totalChange += topic.change;
    }
  }
  return [...bucket.values()].map((a) => ({
    topic: a.topic,
    codes: a.codes,
    countryCount: a.codes.length,
    avgScore: Math.round(a.totalScore / a.codes.length),
    avgChange: Math.round((a.totalChange / a.codes.length) * 10) / 10,
    reach: a.totalScore,
  })).sort((a, b) => b.reach - a.reach);
}

/* ------------------------------------------------------------------ helpers */

export function flagEmoji(code) {
  if (!code || code.length !== 2) return '🏳️';
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function frameDate(model, offsetHours) {
  return new Date(model.updatedAt.getTime() - offsetHours * 3600 * 1000);
}
