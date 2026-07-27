/**
 * filters.js — one shared filter state (category + scope) for every view.
 * Controls can be rendered into more than one container; they all stay in sync.
 */
import { t } from './i18n.js';

export const CATEGORIES = [
  'ALL', 'WORLD', 'TECH', 'CULTURE', 'SPORTS', 'SCIENCE',
  'ENTERTAINMENT', 'POLITICS', 'BUSINESS', 'WEATHER', 'OTHER',
];

export const SCOPES = ['ALL', 'GLOBAL', 'LOCAL'];

/* Only meaningful for live data, where every topic carries a `kind`. */
export const SOURCES = ['ALL', 'NEWS', 'WIKIPEDIA'];
const KIND_OF = { NEWS: 'NEWS', WIKIPEDIA: 'WIKI' };

const state = { category: 'ALL', scope: 'ALL', source: 'ALL' };
const listeners = new Set();
const chipGroups = new Set();
const scopeGroups = new Set();
const sourceGroups = new Set();

export function getFilters() {
  return { ...state };
}

export function isDefault() {
  return state.category === 'ALL' && state.scope === 'ALL' && state.source === 'ALL';
}

export function setCategory(cat) {
  if (!CATEGORIES.includes(cat) || cat === state.category) return;
  state.category = cat;
  sync();
}

export function setScope(scope) {
  if (!SCOPES.includes(scope) || scope === state.scope) return;
  state.scope = scope;
  sync();
}

export function setSource(source) {
  if (!SOURCES.includes(source) || source === state.source) return;
  state.source = source;
  sync();
}

export function onFilterChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function sync() {
  refreshControls();
  listeners.forEach((fn) => fn(getFilters()));
}

/** Predicate used everywhere a topic list is built. */
export function topicMatches(topic) {
  if (state.category !== 'ALL' && topic.category !== state.category) return false;
  if (state.scope !== 'ALL' && topic.scope !== state.scope) return false;
  if (state.source !== 'ALL' && topic.kind !== KIND_OF[state.source]) return false;
  return true;
}

export function filterTopics(topics) {
  return topics.filter(topicMatches);
}

/* ------------------------------------------------------------------ controls */

export function renderCategoryChips(container) {
  container.textContent = '';
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', t('filter.category'));
  for (const cat of CATEGORIES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.cat = cat;
    b.addEventListener('click', () => setCategory(cat));
    container.append(b);
  }
  chipGroups.add(container);
  paintChips(container);
  return () => chipGroups.delete(container);
}

export function renderScopeToggle(container) {
  container.textContent = '';
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', t('filter.scope'));
  for (const scope of SCOPES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg';
    b.dataset.scope = scope;
    b.addEventListener('click', () => setScope(scope));
    container.append(b);
  }
  scopeGroups.add(container);
  paintScopes(container);
  return () => scopeGroups.delete(container);
}

export function renderSourceToggle(container) {
  container.textContent = '';
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', t('filter.source'));
  for (const source of SOURCES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg';
    b.dataset.source = source;
    b.addEventListener('click', () => setSource(source));
    container.append(b);
  }
  sourceGroups.add(container);
  paintSources(container);
  return () => sourceGroups.delete(container);
}

function paintSources(container) {
  container.querySelectorAll('.seg').forEach((b) => {
    const on = b.dataset.source === state.source;
    b.textContent = t(`source.${b.dataset.source}`);
    b.setAttribute('aria-pressed', String(on));
    b.classList.toggle('is-on', on);
  });
}

function paintChips(container) {
  container.querySelectorAll('.chip').forEach((b) => {
    const on = b.dataset.cat === state.category;
    b.textContent = t(`cat.${b.dataset.cat}`);
    b.setAttribute('aria-pressed', String(on));
    b.classList.toggle('is-on', on);
  });
}

function paintScopes(container) {
  container.querySelectorAll('.seg').forEach((b) => {
    const on = b.dataset.scope === state.scope;
    b.textContent = t(`scope.${b.dataset.scope}`);
    b.setAttribute('aria-pressed', String(on));
    b.classList.toggle('is-on', on);
    const note = b.dataset.scope === 'ALL' ? '' : t(`scope.${b.dataset.scope}.note`);
    if (note) b.title = note; else b.removeAttribute('title');
  });
}

/** Re-labels every control — called on filter change and on language change. */
export function refreshControls() {
  chipGroups.forEach((c) => { if (c.isConnected) paintChips(c); else chipGroups.delete(c); });
  scopeGroups.forEach((c) => { if (c.isConnected) paintScopes(c); else scopeGroups.delete(c); });
  sourceGroups.forEach((c) => { if (c.isConnected) paintSources(c); else sourceGroups.delete(c); });
}
