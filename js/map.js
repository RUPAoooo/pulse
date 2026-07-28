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
import { terminator, solarAltitude } from './daynight.js';
import { CITIES } from './citylights.js';

const NS = 'http://www.w3.org/2000/svg';
const DAYNIGHT_MS = 90_000;          // the terminator barely moves; 90 s is plenty
const MAX_LINKS = 5;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const coarse = window.matchMedia('(max-width: 680px)');

function el(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function stops(node, list) {
  for (const [offset, color, opacity] of list) {
    node.append(el('stop', { offset, 'stop-color': color, 'stop-opacity': opacity }));
  }
  return node;
}

export function renderWorldMap({ svg, geo, countries, onHover, onSelect }) {
  const meta = geo.meta;
  const W = meta.width;
  const H = meta.height;
  const project = (lon, lat) => ({
    x: (lon - meta.lonMin) / meta.deg * meta.cell,
    y: (meta.latMax - lat) / meta.deg * meta.cell,
  });

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.textContent = '';

  /* ------------------------------------------------------------------ defs */
  const defs = el('defs');

  const ocean = stops(el('radialGradient', { id: 'wp-ocean', cx: '50%', cy: '42%', r: '78%' }), [
    ['0%', 'var(--sea-1)', '1'],
    ['58%', 'var(--sea-2)', '1'],
    ['100%', 'var(--sea-3)', '1'],
  ]);

  const halo = stops(el('radialGradient', { id: 'wp-halo', cx: '50%', cy: '50%', r: '50%' }), [
    ['0%', 'var(--glow)', '0.62'],
    ['30%', 'var(--glow)', '0.20'],
    ['70%', 'var(--glow)', '0.04'],
    ['100%', 'var(--glow)', '0'],
  ]);

  const daylight = stops(el('radialGradient', { id: 'wp-daylight', cx: '50%', cy: '50%', r: '50%' }), [
    ['0%', 'var(--day)', '0.20'],
    ['55%', 'var(--day)', '0.05'],
    ['100%', 'var(--day)', '0'],
  ]);

  const warm = stops(el('radialGradient', { id: 'wp-warm', cx: '50%', cy: '50%', r: '50%' }), [
    ['0%', 'var(--warm-light)', '0.16'],
    ['48%', 'var(--warm-light)', '0.05'],
    ['100%', 'var(--warm-light)', '0'],
  ]);

  const nightFill = stops(el('linearGradient', { id: 'wp-night', x1: '0', y1: '0', x2: '0', y2: '1' }), [
    ['0%', 'var(--night)', '0.42'],
    ['100%', 'var(--night)', '0.80'],
  ]);

  const vignette = stops(el('radialGradient', { id: 'wp-vignette', cx: '50%', cy: '48%', r: '72%' }), [
    ['0%', '#000', '0'],
    ['62%', '#000', '0'],
    ['100%', 'var(--sea-3)', '0.78'],
  ]);

  const atmo = stops(el('radialGradient', { id: 'wp-atmo', cx: '50%', cy: '48%', r: '58%' }), [
    ['0%', 'var(--atmo)', '0.16'],
    ['55%', 'var(--atmo)', '0.07'],
    ['100%', 'var(--atmo)', '0'],
  ]);

  /* A slow, low-frequency noise field, blurred until it reads as mist rather
     than as noise. Rendered once — it never animates. */
  const mist = el('filter', {
    id: 'wp-mist', x: '-8%', y: '-14%', width: '116%', height: '128%',
    'color-interpolation-filters': 'linearRGB',
  });
  mist.append(el('feTurbulence', {
    type: 'fractalNoise', baseFrequency: '0.0075 0.014', numOctaves: '3',
    seed: '11', result: 'n',
  }));
  mist.append(el('feColorMatrix', {
    in: 'n', type: 'matrix', result: 'm',
    values: [
      '0 0 0 0 0.18',
      '0 0 0 0 0.42',
      '0 0 0 0 0.85',
      '1.45 0.9 0 0 -0.87',
    ].join(' '),
  }));
  mist.append(el('feGaussianBlur', { in: 'm', stdDeviation: '11' }));

  const swirl = el('filter', {
    id: 'wp-swirl', x: '-10%', y: '-16%', width: '120%', height: '132%',
    'color-interpolation-filters': 'linearRGB',
  });
  swirl.append(el('feTurbulence', {
    type: 'fractalNoise', baseFrequency: '0.004 0.009', numOctaves: '2',
    seed: '4', result: 'n',
  }));
  swirl.append(el('feColorMatrix', {
    in: 'n', type: 'matrix', result: 'm',
    values: [
      '0 0 0 0 0.95',
      '0 0 0 0 0.55',
      '0 0 0 0 0.28',
      '1.15 0.75 0 0 -1.02',
    ].join(' '),
  }));
  swirl.append(el('feGaussianBlur', { in: 'm', stdDeviation: '16' }));

  /* Coastline relief: the same path drawn twice, once pushed down as shadow. */
  const relief = el('filter', {
    id: 'wp-relief', x: '-4%', y: '-8%', width: '108%', height: '116%',
    'color-interpolation-filters': 'sRGB',
  });
  relief.append(el('feDropShadow', {
    dx: '0', dy: '0.9', stdDeviation: '1.1',
    'flood-color': '#020610', 'flood-opacity': '0.85',
  }));

  const soften = el('filter', {
    id: 'wp-soften', x: '-14%', y: '-34%', width: '128%', height: '168%',
    'color-interpolation-filters': 'sRGB',
  });
  soften.append(el('feGaussianBlur', { stdDeviation: '7' }));

  const cityBlur = el('filter', {
    id: 'wp-city', x: '-60%', y: '-60%', width: '220%', height: '220%',
    'color-interpolation-filters': 'sRGB',
  });
  cityBlur.append(el('feGaussianBlur', { stdDeviation: '2.2' }));

  defs.append(ocean, halo, daylight, warm, nightFill, vignette, atmo, mist, swirl, relief, soften, cityBlur);
  svg.append(defs);

  /* The sea doubles as the hit-test backdrop for the whole canvas. */
  svg.append(el('rect', { class: 'map-sea', x: 0, y: 0, width: W, height: H, fill: 'url(#wp-ocean)' }));
  svg.append(el('rect', {
    class: 'map-mist', x: -40, y: -40, width: W + 80, height: H + 80, filter: 'url(#wp-mist)',
  }));
  svg.append(el('rect', {
    class: 'map-swirl', x: -40, y: -40, width: W + 80, height: H + 80, filter: 'url(#wp-swirl)',
  }));
  svg.append(el('rect', { class: 'map-atmo', x: 0, y: 0, width: W, height: H, fill: 'url(#wp-atmo)' }));

  const dayLayer = el('g', { class: 'layer-day' });
  const landLayer = el('g', { class: 'layer-land' });
  const lineLayer = el('g', { class: 'layer-line' });
  const nightLayer = el('g', { class: 'layer-night' });
  const cityLayer = el('g', { class: 'layer-city' });
  const haloLayer = el('g', { class: 'layer-halo' });
  const rippleLayer = el('g', { class: 'layer-ripple' });
  const linkLayer = el('g', { class: 'layer-links' });
  const labelLayer = el('g', { class: 'layer-label' });
  const hitLayer = el('g', { class: 'layer-hit' });
  svg.append(dayLayer, landLayer, lineLayer, nightLayer, cityLayer, haloLayer, rippleLayer,
    linkLayer, labelLayer, hitLayer);
  svg.append(el('rect', {
    class: 'map-vignette', x: 0, y: 0, width: W, height: H, fill: 'url(#wp-vignette)',
  }));

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

  /* Coastline and internal borders are separate strokes so the coast can read
     brighter than a border without the two fighting each other. */
  if (geo.borders) lineLayer.append(el('path', { class: 'borderline', d: geo.borders }));
  if (geo.coast) {
    lineLayer.append(el('path', { class: 'coast-shadow', d: geo.coast }));
    lineLayer.append(el('path', { class: 'coastline', d: geo.coast }));
    lineLayer.append(el('path', { class: 'coast-light', d: geo.coast }));
  }

  /* A country too small for the 3-degree source grid has no polygon — fall
     back to the centroid recorded in data/countries.json so it still glows. */
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

  /* ------------------------------------------- halos, labels, keyboard hits */
  const halos = new Map();
  const hits = new Map();
  const labels = new Map();

  for (const country of countries.values()) {
    if (!country.hasData) continue;
    const { cx, cy, bbox } = anchor(country);

    const g = el('g', { class: 'halo', 'data-code': country.code });
    const glow = el('circle', { cx, cy, r: 60, fill: 'url(#wp-halo)', class: 'halo-glow' });
    const outer = el('circle', { cx, cy, r: 22, class: 'halo-outer' });
    const ring = el('circle', { cx, cy, r: 14, class: 'halo-ring' });
    const core = el('circle', { cx, cy, r: 2.4, class: 'halo-core' });
    const spark = el('circle', { cx, cy, r: 1.1, class: 'halo-spark' });
    g.append(glow, outer, ring, core, spark);
    haloLayer.append(g);
    halos.set(country.code, { g, glow, outer, ring, core, cx, cy });

    const label = el('text', { class: 'clabel', x: cx, y: cy + 17, 'paint-order': 'stroke' });
    labelLayer.append(label);
    labels.set(country.code, label);

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
    hitLayer.append(el('circle', { class: 'hit-dot', cx, cy, r: 11, 'data-code': country.code }));
  }

  /* --------------------------------------------------------- day and night */
  const dayGlow = el('circle', { class: 'daylight', r: W * 0.32, fill: 'url(#wp-daylight)' });
  const warmGlow = el('circle', { class: 'warmlight', r: W * 0.5, fill: 'url(#wp-warm)' });
  dayLayer.append(warmGlow, dayGlow);

  const nightShape = el('path', { class: 'night', fill: 'url(#wp-night)', filter: 'url(#wp-soften)' });
  const nightEdge = el('path', { class: 'night-edge' });
  nightLayer.append(nightShape, nightEdge);

  /* city lights — scenery only, never interactive */
  const cityBloomGroup = el('g', { class: 'city-bloom-group', filter: 'url(#wp-city)' });
  const cityGroup = el('g', { class: 'city-group' });
  cityLayer.append(cityBloomGroup, cityGroup);
  const cities = CITIES.map(([lon, lat, weight], i) => {
    const { x, y } = project(lon, lat);
    const bloom = el('circle', {
      class: 'city-bloom', cx: x, cy: y, r: (2.6 + weight * 3.4).toFixed(2),
    });
    const dot = el('circle', {
      class: 'city', cx: x, cy: y, r: (0.75 + weight * 0.95).toFixed(2),
    });
    for (const node of [bloom, dot]) {
      node.style.setProperty('--w', weight.toFixed(2));
      if (!reduceMotion.matches) node.style.animationDelay = `${(i % 9) * 0.9}s`;
    }
    cityBloomGroup.append(bloom);
    cityGroup.append(dot);
    return { lon, lat, dot, bloom };
  });

  function paintDayNight() {
    const { night, sun } = terminator(meta, new Date());
    nightShape.setAttribute('d', night);
    nightEdge.setAttribute('d', night);
    dayGlow.setAttribute('cx', sun.x);
    dayGlow.setAttribute('cy', sun.y);
    warmGlow.setAttribute('cx', sun.x);
    warmGlow.setAttribute('cy', sun.y);
    for (const c of cities) {
      const night = solarAltitude(c.lon, c.lat, sun) < 0.02;
      c.dot.classList.toggle('is-night', night);
      c.bloom.classList.toggle('is-night', night);
    }
  }
  paintDayNight();
  const dayNightTimer = window.setInterval(() => {
    if (!document.hidden) paintDayNight();
  }, DAYNIGHT_MS);

  /* --------------------------------------------------------------- pointer */
  let hoverCode = null;
  let selectedCode = null;
  let labelText = new Map();         // code -> country name in the current language
  let labelShow = new Set();         // codes app.js decided are worth naming

  function paintLabels() {
    for (const [code, node] of labels) {
      const text = labelText.get(code);
      if (text && node.textContent !== text) node.textContent = text;
      const forced = code === hoverCode || code === selectedCode;
      const on = Boolean(node.textContent) && (labelShow.has(code) || forced);
      node.classList.toggle('is-on', on);
      node.classList.toggle('is-strong', forced);
    }
  }

  function paintHover() {
    landLayer.querySelectorAll('.country.is-hover').forEach((p) => p.classList.remove('is-hover'));
    haloLayer.querySelectorAll('.halo.is-hover').forEach((p) => p.classList.remove('is-hover'));
    if (hoverCode) {
      shapes.get(hoverCode)?.classList.add('is-hover');
      halos.get(hoverCode)?.g.classList.add('is-hover');
    }
    paintLabels();
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
    const breathing = new Set(ranked.slice(0, coarse.matches ? 3 : 6).map(([c]) => c));

    for (const [code, h] of halos) {
      const a = activityByCode.get(code) ?? 0;
      const on = a > 0;
      h.g.classList.toggle('is-off', !on);
      h.g.classList.toggle('is-strong', a >= 70);
      h.g.classList.toggle('is-breathing', on && breathing.has(code) && !reduceMotion.matches);
      h.g.style.setProperty('--a', (a / 100).toFixed(3));
      h.glow.setAttribute('r', 17 + a * 0.45);
      h.outer.setAttribute('r', 11 + a * 0.14);
      h.ring.setAttribute('r', 5.5 + a * 0.055);
    }
    paintLabels();
  }

  /**
   * app.js owns the wording (language) and the shortlist; the map only draws.
   *   texts   Map<code, name>   every country that has a name to show
   *   show    Iterable<code>    the shortlist visible without hovering
   */
  function setLabels(texts, show) {
    labelText = texts instanceof Map ? texts : new Map(texts);
    labelShow = new Set(show ?? []);
    paintLabels();
  }

  /* -------------------------------------------------------------- ripples */
  function ripple(code, strong = false) {
    if (reduceMotion.matches) return;
    const h = halos.get(code);
    if (!h) return;
    const make = (cls, delay) => {
      const c = el('circle', { cx: h.cx, cy: h.cy, r: 8, class: cls });
      if (delay) c.style.animationDelay = `${delay}ms`;
      rippleLayer.append(c);
      window.setTimeout(() => c.remove(), 3800 + delay);
    };
    make('ripple', 0);
    if (strong) make('ripple ripple-2', 900);   // a second ring for a loud country
  }

  /* ---------------------------------------------------------------- links */
  function showLinks(originCode, codes) {
    linkLayer.textContent = '';
    const list = (codes ?? []).filter((c) => halos.has(c));
    if (list.length < 2) return;                 // a link needs two ends
    const from = halos.get(originCode) ?? halos.get(list[0]);
    if (!from) return;
    const targets = list
      .filter((c) => c !== (originCode ?? list[0]))
      .sort((a, b) => (lastActivity.get(b) ?? 0) - (lastActivity.get(a) ?? 0))
      .slice(0, MAX_LINKS);
    if (!targets.length) return;

    targets.forEach((code, i) => {
      const to = halos.get(code);
      const mx = (from.cx + to.cx) / 2;
      const my = (from.cy + to.cy) / 2;
      const dx = to.cx - from.cx;
      const dy = to.cy - from.cy;
      const dist = Math.hypot(dx, dy) || 1;
      const bend = Math.min(104, dist * 0.21);
      const cx = mx - (dy / dist) * bend;
      const cy = my + (dx / dist) * bend;
      const d = `M ${from.cx} ${from.cy} Q ${cx} ${cy} ${to.cx} ${to.cy}`;
      linkLayer.append(el('path', { class: 'link-under', d }));
      const path = el('path', { class: 'link', d });
      if (!reduceMotion.matches) path.style.animationDelay = `${i * 110}ms`;
      linkLayer.append(path);
      linkLayer.append(el('circle', { class: 'link-end', cx: to.cx, cy: to.cy, r: 2.4 }));
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
    if (code) {
      shapes.get(code)?.classList.add('is-selected');
      halos.get(code)?.g.classList.add('is-selected');
    }
    paintLabels();
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
    setLabels, centroidClientPos, destroy,
    get selected() { return selectedCode; },
    get activity() { return lastActivity; },
    prefersReducedMotion: () => reduceMotion.matches,
  };
}
