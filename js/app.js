/**
 * app.js — wiring. Loads data, holds the small amount of shared state
 * (time offset, selection, link mode) and tells the other modules to repaint.
 */
import {
  t, pick, locale, getLang, setLang, detectLang, onLangChange, applyStaticText,
} from './i18n.js';
import {
  fetchTrendData, normalizeTrendData, getFrameState, activityFromTopics,
  worldTopics, flagEmoji, frameDate,
} from './data.js';
import {
  renderCategoryChips, filterTopics, getFilters, onFilterChange, refreshControls,
} from './filters.js';
import { renderWorldMap } from './map.js';
import { renderTimeline } from './timeline.js';
import { createPanel, createModal } from './panel.js';

/* Tells the inline fallback in index.html that the module graph resolved.
   Set before anything else can throw. */
window.__WP_BOOTED__ = true;

const dom = {
  app: document.getElementById('app'),
  loader: document.getElementById('loader'),
  error: document.getElementById('error'),
  errorRetry: document.getElementById('error-retry'),
  map: document.getElementById('map'),
  mapWrap: document.getElementById('map-wrap'),
  tooltip: document.getElementById('tooltip'),
  hint: document.getElementById('hint'),
  filters: document.getElementById('filters'),
  timeline: document.getElementById('timeline'),
  panel: document.getElementById('panel'),
  modal: document.getElementById('modal'),
  worldBtn: document.getElementById('world-now'),
  linksBtn: document.getElementById('links-toggle'),
  langBtns: [...document.querySelectorAll('[data-lang]')],
  select: document.getElementById('country-select'),
  intro: document.getElementById('intro'),
  updated: document.getElementById('updated-stamp'),
};

const state = {
  model: null,
  offsetHours: 0,
  selected: null,
  linksOn: false,
  hoverTopic: null,
  modalTopic: null,
};

let map = null;
let timeline = null;
let panel = null;
let modal = null;
let rippleTimer = null;

/* ------------------------------------------------------------------- boot */

async function boot() {
  setLang(detectLang());
  applyStaticText();
  paintLangButtons();

  try {
    const raw = await fetchTrendData();
    state.model = normalizeTrendData(raw);
  } catch (err) {
    console.warn('[world-pulse]', err);
    showError();
    return;
  }
  if (state.model.warnings.length) console.warn('[world-pulse]', state.model.warnings);

  build();
  dom.loader.hidden = true;
  dom.app.hidden = false;
  playIntro();
}

function showError() {
  dom.loader.hidden = true;
  dom.error.hidden = false;
  dom.errorRetry.addEventListener('click', () => window.location.reload(), { once: true });
}

/* ------------------------------------------------------------------ build */

function build() {
  const model = state.model;

  map = renderWorldMap({
    svg: dom.map,
    grid: model.grid,
    countries: model.countries,
    onHover: handleHover,
    onSelect: selectCountry,
  });

  timeline = renderTimeline({
    container: dom.timeline,
    frames: model.frames,
    onChange: (offset) => {
      state.offsetHours = offset;
      render();
    },
  });

  renderCategoryChips(dom.filters);

  panel = createPanel({
    root: dom.panel,
    onClose: () => {
      state.selected = null;
      map.setSelected(null);
      document.body.classList.remove('panel-open');
      applyLinks();
      render();
    },
    onTopicOpen: (topic) => {
      state.modalTopic = topic;
      modal.show(topic, context());
      applyLinks();
    },
    onTopicHover: (topic) => {
      state.hoverTopic = topic;
      applyLinks();
    },
  });

  modal = createModal({
    root: dom.modal,
    onClose: () => { state.modalTopic = null; applyLinks(); },
  });

  buildCountrySelect();

  dom.worldBtn.addEventListener('click', () => {
    if (panel.mode === 'world') { panel.close(); return; }
    state.selected = null;
    map.setSelected(null);
    document.body.classList.add('panel-open');
    panel.renderWorld(context());
  });

  dom.linksBtn.addEventListener('click', () => {
    state.linksOn = !state.linksOn;
    dom.linksBtn.setAttribute('aria-pressed', String(state.linksOn));
    dom.linksBtn.classList.toggle('is-on', state.linksOn);
    applyLinks();
  });

  dom.langBtns.forEach((btn) => {
    btn.addEventListener('click', () => setLang(btn.dataset.lang));
  });

  onLangChange(() => {
    applyStaticText();
    refreshControls();
    paintLangButtons();
    timeline.refresh();
    buildCountrySelect();
    render();
  });

  onFilterChange(() => render());

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (modal.isOpen) modal.close();
    else if (panel.mode) panel.close();
  });

  window.addEventListener('resize', debounce(() => hideTooltip(), 150));

  render();
  startRipples();
}

function buildCountrySelect() {
  const model = state.model;
  const previous = dom.select.value;
  dom.select.textContent = '';

  const placeholder = new Option(t('nav.pickCountry'), '');
  placeholder.disabled = false;
  dom.select.append(placeholder);

  const withData = [];
  const without = [];
  for (const c of model.countries.values()) {
    (c.hasData ? withData : without).push(c);
  }
  const byName = (a, b) => pick(a.name).localeCompare(pick(b.name), locale());

  const g1 = document.createElement('optgroup');
  g1.label = t('panel.topics');
  withData.sort(byName).forEach((c) => g1.append(new Option(`${flagEmoji(c.code)} ${pick(c.name)}`, c.code)));
  const g2 = document.createElement('optgroup');
  g2.label = t('panel.noData');
  without.sort(byName).forEach((c) => g2.append(new Option(`${flagEmoji(c.code)} ${pick(c.name)}`, c.code)));
  dom.select.append(g1, g2);
  dom.select.value = previous || '';

  dom.select.onchange = () => {
    if (dom.select.value) selectCountry(dom.select.value);
  };
}

function paintLangButtons() {
  dom.langBtns.forEach((b) => {
    const on = b.dataset.lang === getLang();
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

/* ----------------------------------------------------------------- render */

function context() {
  return {
    model: state.model,
    state: getFrameState(state.model, state.offsetHours),
    offsetHours: state.offsetHours,
    frameDate: frameDate(state.model, state.offsetHours),
    onSelectCountry: selectCountry,
  };
}

function activityMap(frame) {
  const filters = getFilters();
  const isAll = filters.category === 'ALL' && filters.scope === 'ALL';
  const out = new Map();
  for (const entry of frame.values()) {
    if (!entry.hasData) continue;
    out.set(entry.code, isAll ? entry.activityScore : activityFromTopics(filterTopics(entry.topics)));
  }
  return out;
}

function render() {
  const ctx = context();
  const activity = activityMap(ctx.state);
  map.update(activity);

  for (const [code, value] of activity) {
    const country = state.model.countries.get(code);
    const entry = ctx.state.get(code);
    const top = filterTopics(entry.topics)[0];
    map.setLabel(code, `${pick(country.name)} — ${t('a11y.activity')} ${value}${top ? `, ${pick(top.title)}` : ''}`);
  }

  timeline.setReadout(ctx.frameDate);
  if (dom.updated) {
    dom.updated.textContent = new Intl.DateTimeFormat(locale(), {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(ctx.frameDate);
  }

  panel.refresh(ctx);
  if (state.modalTopic) {
    const fresh = findTopic(ctx.state, state.modalTopic.id);
    if (fresh) { state.modalTopic = fresh; modal.show(fresh, ctx); }
  }
  applyLinks();
}

function findTopic(frame, id) {
  for (const entry of frame.values()) {
    const hit = entry.topics.find((x) => x.id === id);
    if (hit) return hit;
  }
  return null;
}

/* ------------------------------------------------------------- selection */

function selectCountry(code) {
  if (!code) return;
  state.selected = code;
  map.setSelected(code);
  dom.select.value = state.model.countries.has(code) ? code : '';
  document.body.classList.add('panel-open');
  dom.hint.classList.add('is-gone');
  panel.renderCountry(code, context());
  applyLinks();
}

/* ------------------------------------------------------------------ links */

function applyLinks() {
  if (!map) return;
  const topic = state.modalTopic ?? state.hoverTopic;
  if (topic && topic.scope === 'GLOBAL') {
    map.showLinks(topic.origin, topic.relatedCountries);
    return;
  }
  if (state.linksOn) {
    const ctx = context();
    const top = worldTopics(ctx.state, (x) => x.scope === 'GLOBAL' && filterTopics([x]).length > 0)[0];
    if (top) { map.showLinks(top.topic.origin, top.codes); return; }
  }
  map.clearLinks();
}

/* ---------------------------------------------------------------- tooltip */

function handleHover(code, pos) {
  if (!code) { hideTooltip(); return; }
  const ctx = context();
  const country = state.model.countries.get(code);
  const entry = ctx.state.get(code);
  dom.tooltip.textContent = '';

  const head = document.createElement('div');
  head.className = 'tt-head';
  head.append(el('span', 'tt-flag', flagEmoji(code)));
  head.append(el('span', 'tt-name', country ? pick(country.name) : code));
  head.append(el('span', 'mono tt-code', code));
  dom.tooltip.append(head);

  if (!country || !entry?.hasData) {
    dom.tooltip.append(el('p', 'tt-empty', t('panel.noData')));
  } else {
    const topics = filterTopics(entry.topics).slice(0, 3);
    if (topics.length) {
      const ol = document.createElement('ol');
      ol.className = 'tt-list';
      topics.forEach((topic, i) => {
        const li = document.createElement('li');
        li.append(el('span', 'mono tt-rank', String(i + 1).padStart(2, '0')));
        li.append(el('span', 'tt-title', pick(topic.title)));
        ol.append(li);
      });
      dom.tooltip.append(ol);
    } else {
      dom.tooltip.append(el('p', 'tt-empty', t('panel.noTopics')));
    }
    const foot = document.createElement('div');
    foot.className = 'mono tt-foot';
    const filters = getFilters();
    const isAll = filters.category === 'ALL' && filters.scope === 'ALL';
    const act = isAll ? entry.activityScore : activityFromTopics(filterTopics(entry.topics));
    foot.append(el('span', null, `${t('panel.activity')} ${act}`));
    foot.append(el('span', null, `${t('panel.rising')} ${filterTopics(entry.topics).filter((x) => x.change >= 15).length}`));
    dom.tooltip.append(foot);
  }

  dom.tooltip.hidden = false;
  positionTooltip(pos);
}

function positionTooltip(pos) {
  if (!pos) return;
  const wrap = dom.mapWrap.getBoundingClientRect();
  const box = dom.tooltip.getBoundingClientRect();
  const pad = 14;
  let x = pos.x - wrap.left + pad;
  let y = pos.y - wrap.top + pad;
  if (x + box.width > wrap.width - 8) x = pos.x - wrap.left - box.width - pad;
  if (y + box.height > wrap.height - 8) y = pos.y - wrap.top - box.height - pad;
  dom.tooltip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
}

function hideTooltip() {
  dom.tooltip.hidden = true;
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

/* ---------------------------------------------------------------- ripples */

function startRipples() {
  if (map.prefersReducedMotion()) return;
  rippleTimer = window.setInterval(() => {
    if (document.hidden) return;
    const ctx = context();
    const candidates = [...ctx.state.values()]
      .filter((e) => e.hasData && filterTopics(e.topics).some((x) => x.status === 'emerging' || x.status === 'rising'))
      .sort((a, b) => b.activityScore - a.activityScore)
      .slice(0, 6);
    if (!candidates.length) return;
    const pick$ = candidates[Math.floor(Math.random() * candidates.length)];
    map.ripple(pick$.code);
    if (state.selected) map.ripple(state.selected);
  }, 4200);
}

/* ------------------------------------------------------------------ intro */

function playIntro() {
  if (!dom.intro) return;
  const done = () => {
    dom.intro.classList.add('is-gone');
    window.setTimeout(() => { dom.intro.hidden = true; }, 900);
    window.removeEventListener('pointerdown', done);
    window.removeEventListener('keydown', done);
  };
  window.addEventListener('pointerdown', done, { once: true });
  window.addEventListener('keydown', done, { once: true });
  window.setTimeout(done, 3400);
}

/* ---------------------------------------------------------------- utility */

function debounce(fn, ms) {
  let id = 0;
  return (...args) => {
    window.clearTimeout(id);
    id = window.setTimeout(() => fn(...args), ms);
  };
}

window.addEventListener('beforeunload', () => window.clearInterval(rippleTimer));

boot();
