/**
 * panel.js — the reading surfaces: country detail, WORLD NOW, topic modal.
 * Everything here is rendered from a frame slice handed in by app.js.
 */
import { t, pick, locale } from './i18n.js';
import {
  activityHistory, countriesWithTopic, worldTopics, activityFromTopics,
} from './data.js';
import {
  filterTopics, renderScopeToggle, renderSourceToggle, getFilters,
} from './filters.js';

const STATUS_GLYPH = {
  emerging: '◦', rising: '▲', peak: '◆', stable: '—', declining: '▽',
};

/* Two-letter tile shown in place of an image thumbnail — no external assets. */
const CAT_MARK = {
  WORLD: 'WD', TECH: 'AI', CULTURE: 'CU', SPORTS: 'SP', SCIENCE: 'SC',
  ENTERTAINMENT: 'EN', POLITICS: 'PO', BUSINESS: 'BZ', WEATHER: 'WX', OTHER: '··',
};

/* ------------------------------------------------------------------- flags */

const FLAG_NS = 'http://www.w3.org/2000/svg';

/**
 * A flag chip, drawn rather than typed. Emoji flags are unreliable — Windows
 * has no glyphs for regional-indicator pairs — so every flag here is a small
 * SVG: a two-band field whose hues come from the country code, with the code
 * itself printed on it. Always visible, never dependent on a font.
 */
export function flagNode(code, cls = 'flag') {
  const cc = /^[A-Za-z]{2}$/.test(String(code ?? '')) ? String(code).toUpperCase() : '--';
  const span = h('span', cls);
  span.dataset.code = cc;

  const hue = cc === '--' ? 215 : (cc.charCodeAt(0) * 37 + cc.charCodeAt(1) * 11) % 360;
  const svg = document.createElementNS(FLAG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 26 18');
  svg.setAttribute('class', 'flag-svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('preserveAspectRatio', 'none');

  const field = document.createElementNS(FLAG_NS, 'rect');
  field.setAttribute('x', '0.5'); field.setAttribute('y', '0.5');
  field.setAttribute('width', '25'); field.setAttribute('height', '17');
  field.setAttribute('rx', '2.5');
  field.setAttribute('fill', cc === '--' ? '#1b2636' : `hsl(${(hue + 38) % 360} 46% 26%)`);
  field.setAttribute('stroke', 'rgba(214, 232, 255, 0.45)');
  field.setAttribute('stroke-width', '1');

  const band = document.createElementNS(FLAG_NS, 'path');
  band.setAttribute('d', 'M1 3a2 2 0 0 1 2-2h5.6L6 17H3a2 2 0 0 1-2-2Z');
  band.setAttribute('fill', cc === '--' ? '#33415a' : `hsl(${hue} 64% 55%)`);

  const label = document.createElementNS(FLAG_NS, 'text');
  label.setAttribute('x', '17'); label.setAttribute('y', '12.6');
  label.setAttribute('class', 'flag-code');
  label.textContent = cc;

  svg.append(field, band, label);
  span.append(svg);
  const title = document.createElementNS(FLAG_NS, 'title');
  title.textContent = cc;
  svg.append(title);
  return span;
}

/* ------------------------------------------------------------------ helpers */

function h(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function fmtChange(change) {
  const sign = change > 0 ? '+' : '';
  return `${sign}${Math.round(change)}%`;
}

function changeClass(change) {
  if (change >= 15) return 'up';
  if (change <= -10) return 'down';
  return 'flat';
}

function fmtClock(date, tz, withSeconds = false) {
  return new Intl.DateTimeFormat(locale(), {
    timeZone: tz, hour: '2-digit', minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}), hour12: false,
  }).format(date);
}

function fmtDate(date, tz) {
  return new Intl.DateTimeFormat(locale(), {
    timeZone: tz, year: 'numeric', month: 'short', day: 'numeric', weekday: 'short',
  }).format(date);
}

function fmtStamp(date, tz) {
  return new Intl.DateTimeFormat(locale(), {
    ...(tz ? { timeZone: tz } : {}), month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale(), {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
}

function fmtViews(n) {
  return new Intl.NumberFormat(locale()).format(Number(n) || 0);
}

function fmtCompact(n) {
  const v = Number(n) || 0;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
}

/** External link — always a real URL from the feed, never a placeholder. */
function externalLink(url, label) {
  const a = document.createElement('a');
  a.className = 'mono t-link';
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = label;
  a.title = t('topic.newTab');
  a.append(h('span', 'ext', '↗'));
  a.addEventListener('click', (e) => e.stopPropagation());
  return a;
}

function statusTag(topic) {
  const span = h('span', `status s-${topic.status}`);
  span.append(h('i', 'glyph', STATUS_GLYPH[topic.status] ?? '—'));
  span.append(document.createTextNode(t(`status.${topic.status}`)));
  return span;
}

function sparkline(values, cls = 'spark') {
  const w = 120;
  const hgt = 30;
  const max = Math.max(60, ...values);
  const pts = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * w;
    const y = hgt - (v / max) * (hgt - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('preserveAspectRatio', 'none');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', pts.join(' '));
  svg.append(line);
  const last = pts[pts.length - 1]?.split(',') ?? ['0', '0'];
  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('cx', last[0]);
  dot.setAttribute('cy', last[1]);
  dot.setAttribute('r', '2.4');
  dot.setAttribute('class', 'spark-dot');
  svg.append(dot);
  return svg;
}

/* ------------------------------------------------------- fetch analytics */

/** What the last pipeline run managed for one country, in plain words. */
function countryNote(ctx, code) {
  if (ctx.model.mode !== 'live') return { key: 'nodata.sample', detail: null };
  const status = ctx.model.status ?? {};
  const targets = status.targets ?? ctx.model.targets ?? [];
  if (targets.length && !targets.includes(code)) return { key: 'nodata.notTarget', detail: null };
  const cs = status.countryStatus?.[code];
  if (!cs) return { key: 'nodata.empty', detail: null };
  if (cs.state === 'news-only') return { key: 'nodata.newsOnly', detail: null };
  if (cs.state === 'wiki-only') return { key: 'nodata.wikiOnly', detail: null };
  if (cs.state === 'failed') {
    return { key: 'nodata.failed', detail: (cs.errors ?? []).join(' / ') || null };
  }
  return { key: 'nodata.empty', detail: null };
}

function meter(value) {
  const wrap = h('div', 'meter');
  const bar = h('i');
  bar.style.setProperty('--v', String(Math.max(0, Math.min(100, value)) / 100));
  wrap.append(bar);
  return wrap;
}

/** Two letters that stand for a headline: initials, or the first ideographs. */
function initialsFor(text) {
  const raw = String(text || '').trim();
  if (!raw) return '\u00b7\u00b7';
  if (/[\u3040-\u30ff\u3400-\u9fff]/.test(raw)) {
    return raw.replace(/[\s\u3000「」『』（）()]/g, '').slice(0, 2) || '\u00b7\u00b7';
  }
  const words = raw.split(/[\s\-_.]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return raw.slice(0, 2).toUpperCase();
}

/**
 * The square to the left of a row. Nothing is fetched from an API: a news row
 * asks the publisher's own site for its favicon, and every row already has a
 * readable placeholder underneath — the publisher's initials for news, the
 * article's own initials for Wikipedia — tinted by category. Nothing shifts
 * when an icon fails to load.
 */
function thumbnail(topic) {
  const box = h('span', 'mono t-thumb');
  box.dataset.cat = topic.category;
  box.setAttribute('aria-hidden', 'true');

  if (topic.kind === 'NEWS') {
    box.classList.add('is-news');
    box.append(h('span', 't-mark', initialsFor(topic.outlet || pick(topic.title))));
    let origin = null;
    try { origin = new URL(topic.url ?? '').origin; } catch { origin = null; }
    if (origin) {
      const img = document.createElement('img');
      img.className = 't-favicon';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('load', () => {
        if (img.naturalWidth > 8) box.classList.add('has-icon');
      });
      img.addEventListener('error', () => img.remove());
      img.src = `${origin}/favicon.ico`;
      box.append(img);
    }
    return box;
  }

  if (topic.kind === 'WIKI') {
    box.classList.add('is-wiki');
    box.append(h('span', 't-mark', initialsFor(pick(topic.title))));
    box.append(h('i', 't-badge', 'W'));       // small corner mark, not the whole tile
    return box;
  }

  box.append(h('span', 't-mark', CAT_MARK[topic.category] ?? '\u00b7\u00b7'));
  return box;
}

/* -------------------------------------------------------------- topic rows */

function topicRow(topic, rank, handlers) {
  const li = h('li', 'topic');
  li.tabIndex = 0;
  li.setAttribute('role', 'button');
  li.dataset.id = topic.id;
  li.dataset.scope = topic.scope;

  li.append(h('span', 'mono t-rank', String(rank)));

  li.append(thumbnail(topic));

  const body = h('div', 't-body');
  body.append(h('h4', 't-title', pick(topic.title)));

  const tags = h('div', 'mono t-tags');
  tags.append(h('span', 'tag', t(`cat.${topic.category}`)));
  tags.append(h('span', `tag tag-scope scope-${topic.scope}`, topic.scope));
  body.append(tags);

  if (topic.kind === 'NEWS') {
    const line = h('p', 'mono t-src');
    if (topic.outlet) line.append(h('span', 't-outlet', topic.outlet));
    const when = fmtDateTime(topic.publishedAt);
    if (when) line.append(h('span', 't-when', when));
    if (topic.url) line.append(externalLink(topic.url, t('topic.openArticle')));
    body.append(line);
  } else if (topic.kind === 'WIKI') {
    const line = h('p', 'mono t-src');
    if (topic.rank) line.append(h('span', 't-outlet', `#${topic.rank}`));
    if (topic.views != null) line.append(h('span', 't-when', `${fmtViews(topic.views)} ${t('topic.views')}`));
    if (topic.url) line.append(externalLink(topic.url, 'Wikipedia'));
    body.append(line);
  } else {
    const summary = pick(topic.summary);
    if (summary) body.append(h('p', 't-sum', summary));
  }

  li.append(body);

  const side = h('div', 't-side');
  side.append(statusTag(topic));
  const delta = h('span', `mono delta ${changeClass(topic.change)}`, fmtChange(topic.change));
  delta.append(h('i', 'arrow', topic.change >= 0 ? '↗' : '↘'));
  side.append(delta);
  const bar = meter(topic.score);
  bar.classList.add('meter-sm');
  side.append(bar);
  li.append(side);

  li.addEventListener('click', () => handlers.onOpen?.(topic));
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlers.onOpen?.(topic); }
  });
  li.addEventListener('pointerenter', () => handlers.onHover?.(topic));
  li.addEventListener('focus', () => handlers.onHover?.(topic));
  li.addEventListener('pointerleave', () => handlers.onHover?.(null));
  li.addEventListener('blur', () => handlers.onHover?.(null));
  return li;
}

/* ------------------------------------------------------------------- panel */

export function createPanel({ root, onClose, onTopicOpen, onTopicHover }) {
  let mode = null;          // 'country' | 'world'
  let currentCode = null;
  let ctx = null;
  let clockTimer = null;
  let expanded = false;

  root.setAttribute('aria-hidden', 'true');

  function close() {
    if (!mode) return;
    mode = null;
    currentCode = null;
    expanded = false;
    stopClock();
    root.classList.remove('is-open');
    root.setAttribute('aria-hidden', 'true');
    root.textContent = '';
    onClose?.();
  }

  function open() {
    root.classList.add('is-open');
    root.setAttribute('aria-hidden', 'false');
  }

  function stopClock() {
    if (clockTimer) { window.clearInterval(clockTimer); clockTimer = null; }
  }

  /* ---------------------------------------------------------------- header */

  function headerBar({ flag, title, sub, clock, date }) {
    const head = h('header', 'p-head');

    const id = h('div', 'p-id');
    if (flag === '\u25CD') id.append(h('span', 'p-glyph', flag));
    else if (flag) id.append(flagNode(flag, 'p-flag flag'));
    const box = h('div', 'p-id-text');
    box.append(h('h2', 'p-name', title));
    box.append(h('p', 'p-name-sub', sub));
    id.append(box);
    head.append(id);

    let clockValue = null;
    if (clock) {
      const time = h('div', 'p-time');
      time.append(h('span', 'mono p-time-k', t('panel.localTime')));
      clockValue = h('b', 'mono p-time-v', clock);
      time.append(clockValue);
      time.append(h('span', 'p-time-d', date));
      head.append(time);
    }

    const btn = h('button', 'p-close');
    btn.type = 'button';
    btn.setAttribute('aria-label', t('panel.close'));
    btn.title = `${t('panel.close')} · Esc`;
    btn.textContent = '×';
    btn.addEventListener('click', close);
    head.append(btn);
    return { head, clockValue };
  }

  /** ALL / NEWS / WIKIPEDIA for live data, ALL / GLOBAL / LOCAL for the sample. */
  function tabsBlock() {
    const live = ctx?.model?.mode === 'live';
    const wrap = h('nav', 'p-tabs');
    const bar = h('div', 'seg-group seg-tabs');
    if (live) renderSourceToggle(bar); else renderScopeToggle(bar);
    wrap.append(bar);
    if (live) {
      const sub = h('div', 'seg-group seg-sub');
      renderScopeToggle(sub);
      wrap.append(sub);
    }
    return wrap;
  }

  function metricCell(key, value, note) {
    const cell = h('div', 'metric');
    cell.append(h('span', 'mono metric-k', key));
    cell.append(h('b', 'mono metric-v', value));
    if (note) cell.append(h('span', 'mono metric-n', note));
    return cell;
  }

  /**
   * The pipeline's own numbers — never derived from the sample data, because
   * sample data must not be able to pass for a live fetch.
   */
  function analyticsBlock() {
    const live = ctx?.model?.mode === 'live';
    const status = ctx?.model?.status ?? {};
    const box = h('section', 'p-analytics');

    const head = h('div', 'sec-head');
    head.append(h('h3', null, t('an.title')));
    if (live) {
      const state = status.status ?? 'success';
      head.append(h('span', `mono an-state is-${state}`, t(`state.${state}`) || state));
    } else {
      head.append(h('span', 'mono an-state is-none', t('an.noLive')));
    }
    box.append(head);

    if (!live) {
      box.append(h('p', 'mono an-empty', t('an.noLiveNote')));
      return box;
    }

    const news = Number(status.counts?.newsItems) || 0;
    const wiki = Number(status.counts?.wikimediaItems) || 0;
    const total = news + wiki;

    const grid = h('div', 'an-grid');
    grid.append(metricCell('NEWS', String(news), t('metric.unitItems')));
    grid.append(metricCell('WIKIPEDIA', String(wiki), t('metric.unitItems')));
    grid.append(metricCell(t('an.coverage'),
      `${status.counts?.countriesWithData ?? 0}/${status.counts?.countriesAttempted ?? (status.targets?.length ?? 0)}`,
      t('nodata.targets')));
    box.append(grid);

    /* source mix */
    const ratio = h('div', 'an-ratio');
    ratio.append(h('span', 'mono an-k', t('an.ratio')));
    const bar = h('div', 'ratio-bar');
    const a = h('i', 'r-news');
    a.style.setProperty('--v', total ? (news / total).toFixed(3) : '0.5');
    const b = h('i', 'r-wiki');
    b.style.setProperty('--v', total ? (wiki / total).toFixed(3) : '0.5');
    bar.append(a, b);
    ratio.append(bar);
    const key = h('div', 'mono ratio-key');
    key.append(h('span', 'k-news', `NEWS ${total ? Math.round((news / total) * 100) : 0}%`));
    key.append(h('span', 'k-wiki', `WIKIPEDIA ${total ? Math.round((wiki / total) * 100) : 0}%`));
    ratio.append(key);
    box.append(ratio);

    /* top three categories across everything on screen */
    const counts = new Map();
    for (const entry of ctx.state.values()) {
      for (const topic of filterTopics(entry.topics)) {
        counts.set(topic.category, (counts.get(topic.category) ?? 0) + 1);
      }
    }
    const top = [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3);
    if (top.length) {
      const most = top[0][1] || 1;
      const list = h('ul', 'an-cats');
      list.append(h('li', 'mono an-k', t('an.cats')));
      top.forEach(([cat, n]) => {
        const li = h('li', 'an-cat');
        li.append(h('span', 'c-name', t(`cat.${cat}`)));
        const m = meter(Math.round((n / most) * 100));
        li.append(m);
        li.append(h('span', 'mono c-n', String(n)));
        list.append(li);
      });
      box.append(list);
    }

    const foot = h('div', 'mono an-foot');
    const at = status.updatedAt ? new Date(status.updatedAt) : ctx.model.updatedAt;
    foot.append(h('span', null, `${t('an.updated')} ${fmtStamp(at)}`));
    const failed = status.failedCountries ?? [];
    if (failed.length) foot.append(h('span', 'an-failed', `${t('state.failed')} ${failed.join(' ')}`));
    box.append(foot);
    return box;
  }

  function metricsBlock(topics) {
    const live = ctx?.model?.mode === 'live';
    const grid = h('section', 'p-metrics');
    const rising = topics.filter((x) => x.change >= 15).length;
    const global = topics.filter((x) => x.scope === 'GLOBAL').length;

    if (live) {
      const news = topics.filter((x) => x.kind === 'NEWS').length;
      const views = topics.reduce((a, x) => a + (Number(x.views) || 0), 0);
      grid.append(metricCell(t('metric.news'), String(news), t('metric.unitItems')));
      grid.append(metricCell(t('metric.wikiViews'), fmtCompact(views), t('metric.unitViews')));
    } else {
      grid.append(metricCell(t('metric.topics'), String(topics.length), t('metric.unitItems')));
      grid.append(metricCell(t('metric.local'), String(topics.length - global), t('metric.unitItems')));
    }
    grid.append(metricCell(t('metric.rising'), String(rising), t('metric.unitItems')));
    grid.append(metricCell(t('metric.global'), String(global), t('metric.unitItems')));
    return grid;
  }

  /* --------------------------------------------------------------- country */

  function renderCountry(code, context) {
    const sameCountry = currentCode === code;
    ctx = context;
    mode = 'country';
    currentCode = code;
    if (!sameCountry) expanded = false;
    stopClock();
    root.textContent = '';
    root.scrollTop = sameCountry ? root.scrollTop : 0;

    const country = ctx.model.countries.get(code);
    const entry = ctx.state.get(code);
    const names = country?.name ?? { ja: code, en: code };
    const primary = pick(names);
    const secondary = names.en === primary ? (names.ja ?? code) : (names.en ?? code);
    const tz = country?.tz ?? 'UTC';

    const { head, clockValue } = headerBar({
      flag: code,
      title: primary,
      sub: `${secondary} · ${code}${country?.code3 ? ` / ${country.code3}` : ''}`,
      clock: fmtClock(new Date(), tz),
      date: fmtDate(new Date(), tz),
    });
    root.append(head);

    if (clockValue) {
      clockTimer = window.setInterval(() => {
        if (!clockValue.isConnected) return stopClock();
        clockValue.textContent = fmtClock(new Date(), tz);
      }, 1000);
    }

    if (!country || !entry?.hasData) {
      const note = countryNote(ctx, code);
      const empty = h('div', 'p-empty');
      empty.append(h('p', 'empty-title', t('panel.noData')));
      empty.append(h('p', 'empty-note', t(note.key)));
      if (note.detail) empty.append(h('p', 'mono empty-detail', note.detail));
      if (ctx.model.mode === 'live' && ctx.model.status?.updatedAt) {
        empty.append(h('p', 'mono empty-detail',
          `${t('nodata.lastTry')} ${fmtStamp(new Date(ctx.model.status.updatedAt), tz)}`));
      }
      root.append(empty);
      root.append(analyticsBlock());
      open();
      return;
    }

    /* ---- score + 24 h change ------------------------------------------- */
    const filtered = filterTopics(entry.topics);
    const filters = getFilters();
    const isAll = filters.category === 'ALL' && filters.scope === 'ALL' && filters.source === 'ALL';
    const activity = isAll ? entry.activityScore : activityFromTopics(filtered);

    const history = activityHistory(ctx.model, code);
    const first = history.find((p) => p.value > 0)?.value ?? 0;
    const change = first ? ((activity - first) / first) * 100 : 0;

    const score = h('section', 'p-score');

    const main = h('div', 'score-main');
    main.append(h('span', 'mono score-k', t('panel.activity')));
    const num = h('div', 'score-num');
    num.append(h('b', 'mono score-v', String(activity)));
    num.append(h('span', 'mono score-max', '/100'));
    main.append(num);
    main.append(meter(activity));
    score.append(main);

    const side = h('div', 'score-side');
    side.append(h('span', 'mono score-k', t('panel.change24')));
    const deltaRow = h('div', 'score-delta');
    deltaRow.append(h('b', `mono delta ${changeClass(change)}`, fmtChange(change)));
    deltaRow.append(h('i', `arrow ${changeClass(change)}`, change >= 0 ? '↗' : '↘'));
    side.append(deltaRow);
    side.append(sparkline(history.map((p) => p.value)));
    score.append(side);

    root.append(score);

    /* ---- tabs ----------------------------------------------------------- */
    root.append(tabsBlock());

    /* ---- topics --------------------------------------------------------- */
    const sections = topicSections(entry, filtered);
    const limit = expanded ? 50 : (sections.length > 1 ? 4 : 6);

    sections.forEach((sec) => {
      const section = h('section', 'p-topics');
      const shead = h('div', 'sec-head');
      shead.append(h('h3', null, sec.title));
      shead.append(h('span', 'mono sec-count',
        `${Math.min(limit, sec.items.length)} / ${sec.items.length}`));
      section.append(shead);
      if (sec.note) section.append(h('p', 'mono sec-note', sec.note));

      if (!sec.items.length) {
        section.append(h('p', 'p-none', t('panel.noTopics')));
      } else {
        const list = h('ol', 'topic-list');
        sec.items.slice(0, limit).forEach((topic, i) => {
          list.append(topicRow(topic, i + 1, { onOpen: onTopicOpen, onHover: onTopicHover }));
        });
        section.append(list);
      }
      root.append(section);
    });

    const total = sections.reduce((a, s) => a + s.items.length, 0);
    if (total > limit || expanded) {
      const more = h('button', 'mono p-more', expanded ? t('panel.showLess') : t('panel.showAll'));
      more.type = 'button';
      more.append(h('span', 'chev', expanded ? '‹' : '›'));
      more.addEventListener('click', () => {
        expanded = !expanded;
        renderCountry(code, ctx);
      });
      root.append(more);
    }

    /* ---- aggregate metrics ---------------------------------------------- */
    const partial = countryNote(ctx, code);
    if (partial.key === 'nodata.newsOnly' || partial.key === 'nodata.wikiOnly') {
      root.append(h('p', 'mono p-source-note', t(partial.key)));
    }
    root.append(metricsBlock(filtered));
    root.append(analyticsBlock());
    root.append(h('p', 'mono p-foot',
      `${t('panel.updated')} ${fmtStamp(ctx.frameDate, tz)} · ${t('topic.openHint')}`));
    open();
  }

  /** One list, or — for live data with source=ALL — News and Wikipedia apart. */
  function topicSections(entry, filtered) {
    const live = ctx?.model?.mode === 'live';
    const source = getFilters().source;
    if (!live || source !== 'ALL') {
      return [{ key: 'topics', title: t('panel.trendTopics'), items: filtered, note: null }];
    }
    const news = filtered.filter((x) => x.kind === 'NEWS');
    const wiki = filtered.filter((x) => x.kind === 'WIKI');
    const perCountry = ctx.model.countries.get(entry.code)?.wikiPerCountry;
    return [
      { key: 'news', title: t('sec.news'), items: news, note: null },
      {
        key: 'wiki',
        title: t('sec.wikipedia'),
        items: wiki,
        note: perCountry === false ? t('sec.wikiLangNote') : null,
      },
    ];
  }

  /* ------------------------------------------------------------ world now */

  function renderWorld(context) {
    ctx = context;
    mode = 'world';
    currentCode = null;
    stopClock();
    root.textContent = '';

    const { head } = headerBar({
      flag: '◍',
      title: t('world.title'),
      sub: t('world.subtitle'),
      clock: fmtClock(new Date(), undefined),
      date: fmtDate(new Date(), undefined),
    });
    root.append(head);

    root.append(tabsBlock());

    const aggregates = worldTopics(ctx.state, (topic) => filterTopics([topic]).length > 0);

    /* top topics worldwide */
    const s1 = h('section', 'p-topics');
    const h1 = h('div', 'sec-head');
    h1.append(h('h3', null, t('world.top')));
    h1.append(h('span', 'mono sec-count', String(aggregates.length)));
    s1.append(h1);
    if (!aggregates.length) {
      s1.append(h('p', 'p-none', t('world.none')));
    } else {
      const list = h('ol', 'topic-list');
      aggregates.slice(0, 6).forEach((agg, i) => {
        const row = topicRow({ ...agg.topic, score: agg.avgScore, change: agg.avgChange },
          i + 1, { onOpen: onTopicOpen, onHover: onTopicHover });
        row.querySelector('.t-tags').append(
          h('span', 'tag reach', `${agg.countryCount} ${t('world.countries')}`),
        );
        list.append(row);
      });
      s1.append(list);
    }
    root.append(s1);

    /* topics climbing in several countries at once */
    const multi = aggregates
      .filter((a) => a.countryCount >= 2 && a.avgChange >= 12)
      .slice(0, 4);
    if (multi.length) {
      const s2 = h('section', 'p-block');
      s2.append(h('h3', null, t('world.multi')));
      const ul = h('ul', 'mini-list');
      multi.forEach((agg) => {
        const li = h('li', 'mini');
        li.append(h('span', 'mini-name', pick(agg.topic.title)));
        const flags = h('span', 'mini-flags');
        agg.codes.slice(0, 6).forEach((c) => flags.append(flagNode(c, 'flag flag-sm')));
        li.append(flags);
        li.append(h('span', `mono delta ${changeClass(agg.avgChange)}`, fmtChange(agg.avgChange)));
        ul.append(li);
      });
      s2.append(ul);
      root.append(s2);
    }

    /* most active countries */
    const active = [...ctx.state.values()]
      .filter((e) => e.hasData)
      .map((e) => {
        const filtered = filterTopics(e.topics);
        const value = getFilters().category === 'ALL' && getFilters().scope === 'ALL'
          ? e.activityScore : activityFromTopics(filtered);
        return { code: e.code, value };
      })
      .filter((e) => e.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    if (active.length) {
      const s3 = h('section', 'p-block');
      s3.append(h('h3', null, t('world.active')));
      const ul = h('ul', 'rank-list');
      active.forEach((row, i) => {
        const li = h('li', 'rank');
        li.tabIndex = 0;
        li.setAttribute('role', 'button');
        li.dataset.code = row.code;
        li.append(h('span', 'mono r-index', String(i + 1).padStart(2, '0')));
        li.append(flagNode(row.code, 'r-flag flag'));
        li.append(h('span', 'r-name', pick(ctx.model.countries.get(row.code)?.name ?? row.code)));
        li.append(meter(row.value));
        li.append(h('span', 'mono r-val', String(row.value)));
        const go = () => ctx.onSelectCountry?.(row.code);
        li.addEventListener('click', go);
        li.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
        });
        ul.append(li);
      });
      s3.append(ul);
      root.append(s3);
    }

    /* categories on the way up */
    const cats = new Map();
    for (const entry of ctx.state.values()) {
      for (const topic of filterTopics(entry.topics)) {
        const c = cats.get(topic.category) ?? { n: 0, change: 0 };
        c.n += 1;
        c.change += topic.change;
        cats.set(topic.category, c);
      }
    }
    const ranked = [...cats.entries()]
      .map(([cat, v]) => ({ cat, avg: v.change / v.n, n: v.n }))
      .filter((c) => c.avg > 0)
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 4);
    if (ranked.length) {
      const s4 = h('section', 'p-block');
      s4.append(h('h3', null, t('world.cats')));
      const ul = h('ul', 'mini-list');
      ranked.forEach((c) => {
        const li = h('li', 'mini');
        li.append(h('span', 'mini-name', t(`cat.${c.cat}`)));
        li.append(h('span', 'mono mini-note', `${c.n}`));
        li.append(h('span', `mono delta ${changeClass(c.avg)}`, fmtChange(c.avg)));
        ul.append(li);
      });
      s4.append(ul);
      root.append(s4);
    }

    const all = [...ctx.state.values()].flatMap((e) => filterTopics(e.topics));
    root.append(metricsBlock(all));
    root.append(analyticsBlock());

    open();
  }

  return {
    renderCountry,
    renderWorld,
    close,
    get mode() { return mode; },
    get code() { return currentCode; },
    refresh(context) {
      if (mode === 'country' && currentCode) renderCountry(currentCode, context);
      else if (mode === 'world') renderWorld(context);
    },
  };
}

/* ------------------------------------------------------------------- modal */

export function createModal({ root, onClose }) {
  let lastFocus = null;
  let open = false;

  function close() {
    if (!open) return;
    open = false;
    root.hidden = true;
    root.textContent = '';
    lastFocus?.focus?.();
    onClose?.();
  }

  function show(topic, ctx) {
    lastFocus = document.activeElement;
    open = true;
    root.hidden = false;
    root.textContent = '';

    const card = h('div', 'modal-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'modal-title');

    const head = h('header', 'm-head');
    const tags = h('div', 'mono m-tags');
    tags.append(h('span', 'tag', t(`cat.${topic.category}`)));
    tags.append(h('span', `tag tag-scope scope-${topic.scope}`, topic.scope));
    head.append(tags);
    const title = h('h2', 'm-title', pick(topic.title));
    title.id = 'modal-title';
    head.append(title);
    const close$ = h('button', 'p-close');
    close$.type = 'button';
    close$.textContent = '×';
    close$.setAttribute('aria-label', t('panel.close'));
    close$.addEventListener('click', close);
    head.append(close$);
    card.append(head);

    const summary = pick(topic.summary);
    if (summary) card.append(h('p', 'm-summary', summary));

    const stats = h('dl', 'mono m-stats');
    const add = (k, v, cls) => {
      stats.append(h('dt', null, k));
      stats.append(h('dd', cls, v));
    };
    add(t('topic.score'), String(topic.score), 'big');
    add(t('topic.change'), fmtChange(topic.change), `big delta ${changeClass(topic.change)}`);
    stats.append(h('dt', null, t('topic.status')));
    const dd = h('dd');
    dd.append(statusTag(topic));
    stats.append(dd);
    if (topic.kind === 'NEWS' && topic.outlet) add(t('topic.outlet'), topic.outlet);
    if (topic.kind === 'NEWS' && topic.publishedAt) add(t('topic.published'), fmtDateTime(topic.publishedAt));
    if (topic.kind === 'WIKI' && topic.rank != null) add(t('topic.wikiRank'), `#${topic.rank}`);
    if (topic.kind === 'WIKI' && topic.views != null) add(t('topic.views'), fmtViews(topic.views), 'big');
    stats.append(h('dt', null, t('topic.origin')));
    const originDd = h('dd');
    originDd.append(flagNode(topic.origin, 'flag flag-sm'));
    originDd.append(document.createTextNode(` ${pick(ctx.model.countries.get(topic.origin)?.name ?? topic.origin)}`));
    stats.append(originDd);
    if (topic.kind == null && topic.startedAt) {
      add(t('topic.started'), new Intl.DateTimeFormat(locale(), {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date(topic.startedAt)));
    }
    if (topic.durationHours != null) {
      add(t('topic.duration'), `${topic.durationHours}${t('topic.hours')}`);
    }
    card.append(stats);

    /* the real article, opened in a new tab */
    if (topic.url) {
      const cta = h('div', 'm-cta');
      const a = document.createElement('a');
      a.className = 'btn btn-open mono';
      a.href = topic.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = topic.kind === 'WIKI' ? t('topic.openWiki') : t('topic.openArticle');
      a.append(h('span', 'ext', '↗'));
      cta.append(a);
      cta.append(h('p', 'mono m-note', t('topic.newTab')));
      card.append(cta);
    }

    /* who is watching it right now */
    const watchers = countriesWithTopic(ctx.state, topic.id);
    if (watchers.length) {
      const block = h('section', 'm-block');
      block.append(h('h3', null, t('topic.watching')));
      const ul = h('ul', 'watch-list');
      watchers.forEach((w) => {
        const li = h('li', 'watch');
        li.append(flagNode(w.code, 'w-flag flag'));
        li.append(h('span', 'w-name', pick(ctx.model.countries.get(w.code)?.name ?? w.code)));
        li.append(h('span', 'mono w-score', String(w.score)));
        li.append(h('span', `mono delta ${changeClass(w.change)}`, fmtChange(w.change)));
        ul.append(li);
      });
      block.append(ul);
      card.append(block);
    }

    if (topic.keywords?.length) {
      const block = h('section', 'm-block');
      block.append(h('h3', null, t('topic.keywords')));
      const row = h('div', 'mono kw-row');
      topic.keywords.forEach((k) => row.append(h('span', 'kw', k)));
      block.append(row);
      card.append(block);
    }

    if (topic.sources?.length) {
      const block = h('section', 'm-block');
      block.append(h('h3', null, t('topic.sources')));
      const row = h('div', 'mono kw-row');
      topic.sources.forEach((s) => row.append(h('span', 'kw src', s)));
      block.append(row);
      card.append(block);
    }

    if (!topic.url) card.append(h('p', 'mono m-note', t('topic.linkNote')));

    root.append(card);
    close$.focus();
  }

  root.addEventListener('click', (e) => { if (e.target === root) close(); });

  return { show, close, get isOpen() { return open; } };
}

export { fmtChange, changeClass, STATUS_GLYPH };
