/**
 * panel.js — the reading surfaces: country detail, WORLD NOW, topic modal.
 * Everything here is rendered from a frame slice handed in by app.js.
 */
import { t, pick, locale } from './i18n.js';
import {
  flagEmoji, activityHistory, countriesWithTopic, worldTopics, activityFromTopics,
} from './data.js';
import {
  filterTopics, renderScopeToggle, renderCategoryChips, renderSourceToggle, getFilters,
} from './filters.js';

const STATUS_GLYPH = {
  emerging: '◦', rising: '▲', peak: '◆', stable: '—', declining: '▽',
};

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

function fmtClock(date, tz, withSeconds = true) {
  return new Intl.DateTimeFormat(locale(), {
    timeZone: tz, hour: '2-digit', minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}), hour12: false,
  }).format(date);
}

function fmtStamp(date, tz) {
  return new Intl.DateTimeFormat(locale(), {
    timeZone: tz, month: '2-digit', day: '2-digit',
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

/** External link — always a real URL from the feed, never a placeholder. */
function externalLink(url, label) {
  const a = document.createElement('a');
  a.className = 'mono t-link';
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = label;
  a.title = t('topic.newTab');
  a.append(h('span', 'ext', '\u2197'));
  a.addEventListener('click', (e) => e.stopPropagation());
  return a;
}

function statusTag(topic) {
  const span = h('span', `status s-${topic.status}`);
  span.append(h('i', 'glyph', STATUS_GLYPH[topic.status] ?? '—'));
  span.append(document.createTextNode(t(`status.${topic.status}`)));
  return span;
}

function sparkline(values) {
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
  svg.setAttribute('class', 'spark');
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

function meter(value) {
  const wrap = h('div', 'meter');
  const bar = h('i');
  bar.style.setProperty('--v', String(Math.max(0, Math.min(100, value)) / 100));
  wrap.append(bar);
  return wrap;
}

/* -------------------------------------------------------------- topic rows */

function topicRow(topic, rank, handlers) {
  const li = h('li', 'topic');
  li.tabIndex = 0;
  li.setAttribute('role', 'button');
  li.dataset.id = topic.id;
  li.dataset.scope = topic.scope;

  li.append(h('span', 'mono t-rank', String(rank).padStart(2, '0')));

  const body = h('div', 't-body');
  body.append(h('h4', 't-title', pick(topic.title)));

  const tags = h('div', 'mono t-tags');
  tags.append(h('span', 'tag', t(`cat.${topic.category}`)));
  tags.append(h('span', `tag tag-scope scope-${topic.scope}`, topic.scope));
  body.append(tags);

  const summary = pick(topic.summary);
  if (summary) body.append(h('p', 't-sum', summary));

  if (topic.kind === 'NEWS') {
    const line = h('p', 'mono t-src');
    if (topic.outlet) line.append(h('span', 't-outlet', topic.outlet));
    const when = fmtDateTime(topic.publishedAt);
    if (when) line.append(h('span', 't-when', when));
    body.append(line);
  } else if (topic.kind === 'WIKI') {
    const line = h('p', 'mono t-src');
    if (topic.rank) line.append(h('span', 't-outlet', `#${topic.rank}`));
    if (topic.views != null) line.append(h('span', 't-when', `${fmtViews(topic.views)} ${t('topic.views')}`));
    body.append(line);
  }

  const stats = h('div', 'mono t-stats');
  stats.append(h('span', 't-score', `${t('topic.score')} ${topic.score}`));
  stats.append(h('span', `delta ${changeClass(topic.change)}`, fmtChange(topic.change)));
  stats.append(statusTag(topic));
  if (topic.url) {
    stats.append(externalLink(topic.url, topic.kind === 'WIKI' ? 'Wikipedia' : t('topic.openArticle')));
  }
  body.append(stats);

  li.append(body);

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

  root.setAttribute('aria-hidden', 'true');

  function close() {
    if (!mode) return;
    mode = null;
    currentCode = null;
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

  function headerBar(titleText, subText, flag) {
    const head = h('header', 'p-head');
    if (flag) head.append(h('span', 'p-flag', flag));
    const box = h('div', 'p-head-text');
    box.append(h('div', 'mono p-eyebrow', subText));
    box.append(h('h2', 'p-name', titleText));
    head.append(box);
    const btn = h('button', 'p-close');
    btn.type = 'button';
    btn.setAttribute('aria-label', t('panel.close'));
    btn.title = `${t('panel.close')} · Esc`;
    btn.textContent = '×';
    btn.addEventListener('click', close);
    head.append(btn);
    return head;
  }

  function controlsBlock() {
    const wrap = h('div', 'p-controls');
    if (ctx?.model?.mode === 'live') {
      const source = h('div', 'seg-group seg-source');
      renderSourceToggle(source);
      wrap.append(source);
    }
    const scope = h('div', 'seg-group');
    renderScopeToggle(scope);
    const chips = h('div', 'chips chips-sm');
    renderCategoryChips(chips);
    wrap.append(scope, chips);
    return wrap;
  }

  /** One list, or — for live data with source=ALL — News and Wikipedia apart. */
  function topicSections(entry, filtered) {
    const live = ctx?.model?.mode === 'live';
    const source = getFilters().source;
    if (!live || source !== 'ALL') {
      return [{ key: 'topics', title: t('panel.topics'), items: filtered, note: null }];
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

  function renderCountry(code, context) {
    ctx = context;
    mode = 'country';
    currentCode = code;
    stopClock();
    root.textContent = '';

    const country = ctx.model.countries.get(code);
    const entry = ctx.state.get(code);
    const name = country ? pick(country.name) : code;

    root.append(headerBar(name, `${code}${country?.code3 ? ` · ${country.code3}` : ''}`, flagEmoji(code)));

    if (!country || !entry?.hasData) {
      const empty = h('div', 'p-empty');
      empty.append(h('p', 'empty-title', t('panel.noData')));
      empty.append(h('p', 'empty-note', t('panel.noDataNote')));
      root.append(empty);
      open();
      return;
    }

    /* clock + data time */
    const meta = h('div', 'mono p-meta');
    const clockCell = h('div', 'meta-cell');
    clockCell.append(h('span', 'meta-k', t('panel.localTime')));
    const clockValue = h('b', 'meta-v', fmtClock(new Date(), country.tz));
    clockCell.append(clockValue);
    const updCell = h('div', 'meta-cell');
    updCell.append(h('span', 'meta-k', t('panel.updated')));
    updCell.append(h('b', 'meta-v', fmtStamp(ctx.frameDate, country.tz)));
    meta.append(clockCell, updCell);
    root.append(meta);
    clockTimer = window.setInterval(() => {
      if (!clockValue.isConnected) return stopClock();
      clockValue.textContent = fmtClock(new Date(), country.tz);
    }, 1000);

    /* activity */
    const filtered = filterTopics(entry.topics);
    const filters = getFilters();
    const isAll = filters.category === 'ALL' && filters.scope === 'ALL';
    const activity = isAll ? entry.activityScore : activityFromTopics(filtered);

    const act = h('section', 'p-activity');
    act.append(h('div', 'mono act-num', String(activity)));
    const side = h('div', 'act-side');
    side.append(h('div', 'act-label', t('panel.activity')));
    side.append(meter(activity));
    const rising = filtered.filter((x) => x.change >= 15).length;
    side.append(h('div', 'mono act-rising', `${t('panel.rising')} ${rising}`));
    act.append(side);
    root.append(act);

    /* 24 h history */
    const history = activityHistory(ctx.model, code);
    const spark = h('section', 'p-spark');
    spark.append(h('div', 'mono s-label', t('panel.change24')));
    spark.append(sparkline(history.map((p) => p.value)));
    const axis = h('div', 'mono s-axis');
    axis.append(h('span', null, '24H'), h('span', null, t('time.now')));
    spark.append(axis);
    root.append(spark);

    /* filters */
    root.append(controlsBlock());

    /* topics — one section, or News / Wikipedia side by side */
    const sections = topicSections(entry, filtered);
    const limit = sections.length > 1 ? 6 : 5;
    let shownAny = false;

    sections.forEach((sec) => {
      const section = h('section', 'p-topics');
      const head = h('div', 'sec-head');
      head.append(h('h3', null, sec.title));
      head.append(h('span', 'mono sec-count',
        `${Math.min(limit, sec.items.length)} / ${sec.items.length}`));
      section.append(head);
      if (sec.note) section.append(h('p', 'mono sec-note', sec.note));

      if (!sec.items.length) {
        section.append(h('p', 'p-none', t('panel.noTopics')));
      } else {
        shownAny = true;
        const list = h('ol', 'topic-list');
        sec.items.slice(0, limit).forEach((topic, i) => {
          list.append(topicRow(topic, i + 1, { onOpen: onTopicOpen, onHover: onTopicHover }));
        });
        section.append(list);
      }
      root.append(section);
    });

    if (shownAny) root.append(h('p', 'mono p-foot', t('topic.openHint')));
    open();
  }

  function renderWorld(context) {
    ctx = context;
    mode = 'world';
    currentCode = null;
    stopClock();
    root.textContent = '';

    root.append(headerBar(t('world.title'), t('world.subtitle'), '◍'));

    const meta = h('div', 'mono p-meta');
    const cell = h('div', 'meta-cell');
    cell.append(h('span', 'meta-k', t('panel.updated')));
    cell.append(h('b', 'meta-v', new Intl.DateTimeFormat(locale(), {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(ctx.frameDate)));
    meta.append(cell);
    root.append(meta);

    root.append(controlsBlock());

    const aggregates = worldTopics(ctx.state, (topic) => filterTopics([topic]).length > 0);

    /* top topics worldwide */
    const s1 = h('section', 'p-topics');
    const h1 = h('div', 'sec-head');
    h1.append(h('h3', null, t('world.top')));
    s1.append(h1);
    if (!aggregates.length) {
      s1.append(h('p', 'p-none', t('world.none')));
    } else {
      const list = h('ol', 'topic-list');
      aggregates.slice(0, 5).forEach((agg, i) => {
        const row = topicRow({ ...agg.topic, score: agg.avgScore, change: agg.avgChange },
          i + 1, { onOpen: onTopicOpen, onHover: onTopicHover });
        row.querySelector('.t-stats').append(
          h('span', 'reach', `${agg.countryCount} ${t('world.countries')}`),
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
        const flags = h('span', 'mini-flags', agg.codes.slice(0, 6).map(flagEmoji).join(' '));
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
      .slice(0, 5);

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
        li.append(h('span', 'r-flag', flagEmoji(row.code)));
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

    card.append(h('p', 'm-summary', pick(topic.summary)));

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
    add(t('topic.origin'), `${flagEmoji(topic.origin)} ${pick(ctx.model.countries.get(topic.origin)?.name ?? topic.origin)}`);
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
      a.append(h('span', 'ext', '\u2197'));
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
        li.append(h('span', 'w-flag', flagEmoji(w.code)));
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
