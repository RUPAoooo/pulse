/**
 * map.js — the world surface.
 *
 * Land comes from data/world-vector.json: one pre-projected SVG path per
 * country, in an equirectangular user space (x = (lon+180)/3*10,
 * y = (84-lat)/3*10). Because the projection is the same one data/countries.json
 * was built against, centroids and bounding boxes keep working unchanged.
 *
 * Rendering never touches topic data — `update()` receives finished numbers.
 */
import { terminator } from './daynight.js';

const NS = 'http://www.w3.org/2000/svg';
const DAYNIGHT_MS = 90_000;          // the terminator barely moves; 90 s is plenty

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function el(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export function renderWorldMap({ svg, geo, countries, onHover, onSelect }) {
  const meta = geo.meta;
  const W = meta.width;
  const H = meta.height;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.textContent = '';

  /* ------------------------------------------------------------------ defs */
  const defs = el('defs');

  const halo = el('radialGradient', { id: 'wp-halo', cx: '50%', cy: '50%', r: '50%' });
  halo.append(
    el('stop', { offset: '0%', 'stop-color': 'var(--glow)', 'stop-opacity': '0.5' }),
    el('stop', { offset: '45%', 'stop-color': 'var(--glow)', 'stop-opacity': '0.13' }),
    el('stop', { offset: '100%', 'stop-color': 'var(--glow)', 'stop-opacity': '0' }),
  );

  const daylight = el('radialGradient', { id: 'wp-daylight', cx: '50%', cy: '50%', r: '50%' });
  daylight.append(
    el('stop', { offset: '0%', 'stop-color': 'var(--day)', 'stop-opacity': '0.20' }),
    el('stop', { offset: '60%', 'stop-color': 'var(--day)', 'stop-opacity': '0.05' }),
    el('stop', { offset: '100%', 'stop-color': 'var(--day)', 'stop-opacity': '0' }),
  );

  const nightFill = el('linearGradient', {
    id: 'wp-night', x1: '0', y1: '0', x2: '0', y2: '1',
  });
  nightFill.append(
    el('stop', { offset: '0%', 'stop-color': 'var(--night)', 'stop-opacity': '0.30' }),
    el('stop', { offset: '100%', 'stop-color': 'var(--night)', 'stop-opacity': '0.72' }),
  );

  const soften = el('filter', {
    id: 'wp-soften', x: '-12%', y: '-30%', width: '124%', height: '160%',
    'color-interpolation-filters': 'sRGB',
  });
  soften.append(el('feGaussianBlur', { stdDeviation: '6' }));

  defs.append(halo, daylight, nightFill, soften);
  svg.append(defs);

  /* An SVG root only receives pointer events where something is painted, so the
     whole canvas gets a backdrop to hit-test against. */
  svg.append(el('rect', { class: 'map-bg', x: 0, y: 0, width: W, height: H }));

  const dayLayer = el('g', { class: 'layer-day' });
  const landLayer = el('g', { class: 'layer-land' });
  const nightLayer = el('g', { class: 'layer-night' });
  const haloLayer = el('g', { class: 'layer-halo' });
  const linkLayer = el('g', { class: 'layer-links' });
  const rippleLayer = el('g', { class: 'layer-ripple' });
  const hitLayer = el('g', { class: 'layer-hit' });
  svg.append(dayLayer, landLayer, nightLayer, haloLayer, rippleLayer, linkLayer, hitLayer);

  /* ------------------------------------------------------------------ land */
  const shapes = new Map();          // code -> <path>
  const bounds = new Map();          // code -> {cx, cy, bbox}

  for (const entry of geo.countries) {
    const country = entry.code ? countries.get(entry.code) : null;
    const path = el('path', {
      class: `country${country?.hasData ? ' has-data' : ''}${entry.code ? '' : ' uncharted'}`,
      d: entry.d,
    });
    if (entry.code) {
      path.dataset.code = entry.code;
      shapes.set(entry.code, path);
      bounds.set(entry.code, { cx: entry.cx, cy: entry.cy, bbox: entry.bbox });
    }
    landLayer.append(path);
  }

  /* Countries the vector file does not cover still need a position for their
     halo — fall back to the centroid recorded in data/countries.json. */
  function anchor(country) {
    const b = bounds.get(country.code);
    if (b) return b;
    const cx = country.centroid.x * meta.cell;
    const cy = country.centroid.y * meta.cell;
    const bb = country.bbox
      ? country.bbox.map((v) => v * meta.cell)
      : [cx - 8, cy - 8, cx + 8, cy + 8];
    return { cx, cy, bbox: [bb[0], bb[1], bb[2] + meta.cell, bb[3] + meta.cell] };
  }

  /* ------------------------------------------------- halos + keyboard hits */
  const halos = new Map();
  const hits = new Map();

  for (const country of countries.values()) {
    if (!country.hasData) continue;
    const { cx, cy, bbox } = anchor(country);

    const g = el('g', { class: 'halo', 'data-code': country.code });
    const glow = el('circle', { cx, cy, r: 60, fill: 'url(#wp-halo)', class: 'halo-glow' });
    const ring = el('circle', { cx, cy, r: 14, class: 'halo-ring' });
    const core = el('circle', { cx, cy, r: 2.4, class: 'halo-core' });
    g.append(glow, ring, core);
    haloLayer.append(g);
    halos.set(country.code, { g, glow, ring, core, cx, cy });

    const pad = 5;
    const hit = el('rect', {
      class: 'hit',
      x: bbox[0] - pad,
      y: bbox[1] - pad,
      width: Math.max(12, bbox[2] - bbox[0]) + pad * 2,
      height: Math.max(12, bbox[3] - bbox[1]) + pad * 2,
      rx: 3,
      tabindex: '0',
      role: 'button',
      'data-code': country.code,
    });
    hit.addEventListener('focus', () => {
      hoverCode = country.code;
      paintHover();
      const r = hit.getBoundingClientRect();
      onHover?.(country.code, { x: r.left + r.width / 2, y: r.top, viaKeyboard: true });
    });
    hit.addEventListener('blur', () => {
      if (hoverCode === country.code) { hoverCode = null; paintHover(); onHover?.(null); }
    });
    hit.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(country.code); }
    });
    hitLayer.append(hit);
    hits.set(country.code, hit);

    /* A small country is hard to hit by its outline alone, so its marker is
       clickable too. */
    const dot = el('circle', { class: 'hit-dot', cx, cy, r: 11, 'data-code': country.code });
    hitLayer.append(dot);
  }

  /* --------------------------------------------------------- day and night */
  const dayGlow = el('circle', { class: 'daylight', r: W * 0.34, fill: 'url(#wp-daylight)' });
  dayLayer.append(dayGlow);
  const nightShape = el('path', { class: 'night', fill: 'url(#wp-night)', filter: 'url(#wp-soften)' });
  const nightEdge = el('path', { class: 'night-edge' });
  nightLayer.append(nightShape, nightEdge);

  function paintDayNight() {
    const { night, sun } = terminator(meta, new Date());
    nightShape.setAttribute('d', night);
    nightEdge.setAttribute('d', night);
    dayGlow.setAttribute('cx', sun.x);
    dayGlow.setAttribute('cy', sun.y);
  }
  paintDayNight();
  const dayNightTimer = window.setInterval(() => {
    if (!document.hidden) paintDayNight();
  }, DAYNIGHT_MS);

  /* --------------------------------------------------------------- pointer */
  let hoverCode = null;
  let selectedCode = null;

  function paintHover() {
    landLayer.querySelectorAll('.country.is-hover').forEach((p) => p.classList.remove('is-hover'));
    haloLayer.querySelectorAll('.halo.is-hover').forEach((p) => p.classList.remove('is-hover'));
    if (!hoverCode) return;
    shapes.get(hoverCode)?.classList.add('is-hover');
    halos.get(hoverCode)?.g.classList.add('is-hover');
  }

  /** Country under the pointer — land shape, or the marker of a small country. */
  function codeAt(evt) {
    const node = evt.target?.closest?.('[data-code]');
    return node?.dataset.code || null;
  }

  function handleMove(evt) {
    const code = codeAt(evt);
    if (code !== hoverCode) {
      hoverCode = code;
      paintHover();
    }
    svg.classList.toggle('is-pointing', Boolean(code));
    onHover?.(code, { x: evt.clientX, y: evt.clientY });
  }

  function handleLeave() {
    hoverCode = null;
    paintHover();
    svg.classList.remove('is-pointing');
    onHover?.(null);
  }

  svg.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') handleMove(e); });
  svg.addEventListener('pointerleave', handleLeave);
  svg.addEventListener('click', (e) => {
    const code = codeAt(e);
    if (code) onSelect?.(code);
  });

  /* ---------------------------------------------------------------- update */
  let lastActivity = new Map();

  function update(activityByCode) {
    lastActivity = activityByCode;
    for (const [code, path] of shapes) {
      const a = activityByCode.get(code);
      path.style.setProperty('--a', a == null ? 0 : (a / 100).toFixed(3));
    }
    const ranked = [...activityByCode.entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
    const breathing = new Set(ranked.slice(0, 5).map(([c]) => c));

    for (const [code, h] of halos) {
      const a = activityByCode.get(code) ?? 0;
      const on = a > 0;
      h.g.classList.toggle('is-off', !on);
      h.g.classList.toggle('is-breathing', on && breathing.has(code) && !reduceMotion.matches);
      h.g.style.setProperty('--a', (a / 100).toFixed(3));
      h.glow.setAttribute('r', 30 + a * 0.5);
      h.ring.setAttribute('r', 8 + a * 0.08);
    }
  }

  /* -------------------------------------------------------------- ripples */
  function ripple(code) {
    if (reduceMotion.matches) return;
    const h = halos.get(code);
    if (!h) return;
    const c = el('circle', { cx: h.cx, cy: h.cy, r: 8, class: 'ripple' });
    rippleLayer.append(c);
    window.setTimeout(() => c.remove(), 3600);
  }

  /* ---------------------------------------------------------------- links */
  function showLinks(originCode, codes) {
    linkLayer.textContent = '';
    const from = halos.get(originCode) ?? halos.get(codes?.[0]);
    if (!from) return;
    const targets = (codes ?? []).filter((c) => c !== originCode && halos.has(c));
    targets.forEach((code, i) => {
      const to = halos.get(code);
      const mx = (from.cx + to.cx) / 2;
      const my = (from.cy + to.cy) / 2;
      const dx = to.cx - from.cx;
      const dy = to.cy - from.cy;
      const dist = Math.hypot(dx, dy) || 1;
      const bend = Math.min(96, dist * 0.19);
      const cx = mx - (dy / dist) * bend;
      const cy = my + (dx / dist) * bend;
      const path = el('path', {
        class: 'link',
        d: `M ${from.cx} ${from.cy} Q ${cx} ${cy} ${to.cx} ${to.cy}`,
      });
      if (!reduceMotion.matches) path.style.animationDelay = `${i * 90}ms`;
      linkLayer.append(path);
      linkLayer.append(el('circle', { class: 'link-end', cx: to.cx, cy: to.cy, r: 2.6 }));
    });
    linkLayer.append(el('circle', { class: 'link-origin', cx: from.cx, cy: from.cy, r: 4 }));
  }

  function clearLinks() {
    linkLayer.textContent = '';
  }

  /* ------------------------------------------------------------ selection */
  function setSelected(code) {
    selectedCode = code;
    landLayer.querySelectorAll('.country.is-selected').forEach((p) => p.classList.remove('is-selected'));
    haloLayer.querySelectorAll('.halo.is-selected').forEach((p) => p.classList.remove('is-selected'));
    svg.classList.toggle('has-selection', Boolean(code));
    if (!code) return;
    shapes.get(code)?.classList.add('is-selected');
    halos.get(code)?.g.classList.add('is-selected');
  }

  function focusCountry(code) {
    hits.get(code)?.focus();
  }

  function setLabel(code, label) {
    hits.get(code)?.setAttribute('aria-label', label);
    shapes.get(code)?.setAttribute('aria-label', label);
  }

  function centroidClientPos(code) {
    const h = halos.get(code);
    const ctm = svg.getScreenCTM();
    if (!h || !ctm) return null;
    const pt = new DOMPoint(h.cx, h.cy).matrixTransform(ctm);
    return { x: pt.x, y: pt.y };
  }

  function destroy() {
    window.clearInterval(dayNightTimer);
  }

  return {
    update, ripple, showLinks, clearLinks, setSelected, focusCountry, setLabel,
    centroidClientPos, destroy,
    get selected() { return selectedCode; },
    get activity() { return lastActivity; },
    prefersReducedMotion: () => reduceMotion.matches,
  };
}
