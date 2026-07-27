/**
 * map.js — draws the world as a dot matrix and keeps it in sync with a frame.
 *
 * The grid in data/worldgrid.json is a plain equirectangular raster: every
 * entry is [column, row, ISO-3166-1 alpha-2 code]. Rendering never touches the
 * topic data directly — `update()` receives finished numbers.
 */

const NS = 'http://www.w3.org/2000/svg';
const CELL = 10;      // user units per grid cell
const DOT_R = 2.35;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function el(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

export function renderWorldMap({ svg, grid, countries, onHover, onSelect }) {
  const cols = grid.cols;
  const rows = grid.rows;
  svg.setAttribute('viewBox', `0 0 ${cols * CELL} ${rows * CELL}`);
  svg.textContent = '';

  /* defs — one soft radial glow reused by every country */
  const defs = el('defs');
  const grad = el('radialGradient', { id: 'wp-halo', cx: '50%', cy: '50%', r: '50%' });
  grad.append(
    el('stop', { offset: '0%', 'stop-color': 'var(--glow)', 'stop-opacity': '0.55' }),
    el('stop', { offset: '55%', 'stop-color': 'var(--glow)', 'stop-opacity': '0.14' }),
    el('stop', { offset: '100%', 'stop-color': 'var(--glow)', 'stop-opacity': '0' }),
  );
  defs.append(grad);
  svg.append(defs);

  // An SVG root only receives pointer events where something is painted, so the
  // whole canvas gets a transparent backdrop to hit-test against.
  const backdrop = el('rect', {
    class: 'map-bg', x: 0, y: 0, width: cols * CELL, height: rows * CELL, fill: 'transparent',
  });
  svg.append(backdrop);

  const landLayer = el('g', { class: 'layer-land' });
  const haloLayer = el('g', { class: 'layer-halo' });
  const linkLayer = el('g', { class: 'layer-links' });
  const rippleLayer = el('g', { class: 'layer-ripple' });
  const hitLayer = el('g', { class: 'layer-hit' });
  svg.append(haloLayer, landLayer, rippleLayer, linkLayer, hitLayer);

  /* ---------------------------------------------------------------- land */
  const cellMap = new Map();          // "x,y" → code ('' for uncharted land)
  const groups = new Map();           // code → <g>
  const byCode = new Map();           // code → cells[]

  for (const [x, y, code] of grid.cells) {
    cellMap.set(`${x},${y}`, code);
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push([x, y]);
  }

  for (const [code, cells] of byCode) {
    const country = countries.get(code);
    const g = el('g', {
      class: `country${country?.hasData ? ' has-data' : ''}${code ? '' : ' uncharted'}`,
    });
    if (code) g.dataset.code = code;
    for (const [x, y] of cells) {
      g.append(el('circle', {
        cx: x * CELL + CELL / 2,
        cy: y * CELL + CELL / 2,
        r: DOT_R,
      }));
    }
    landLayer.append(g);
    if (code) groups.set(code, g);
  }

  /* ------------------------------------------------- halos + keyboard hits */
  const halos = new Map();
  const hits = new Map();

  for (const country of countries.values()) {
    if (!country.hasData) continue;
    const cx = country.centroid.x * CELL;
    const cy = country.centroid.y * CELL;

    const halo = el('g', { class: 'halo', 'data-code': country.code });
    const glow = el('circle', { cx, cy, r: 60, fill: 'url(#wp-halo)', class: 'halo-glow' });
    const ring = el('circle', { cx, cy, r: 14, class: 'halo-ring' });
    const core = el('circle', { cx, cy, r: 2.6, class: 'halo-core' });
    halo.append(glow, ring, core);
    haloLayer.append(halo);
    halos.set(country.code, { halo, glow, ring, core, cx, cy });

    const bbox = country.bbox ?? [country.centroid.x - 1, country.centroid.y - 1, country.centroid.x + 1, country.centroid.y + 1];
    const pad = 4;
    const hit = el('rect', {
      class: 'hit',
      x: bbox[0] * CELL - pad,
      y: bbox[1] * CELL - pad,
      width: (bbox[2] - bbox[0] + 1) * CELL + pad * 2,
      height: (bbox[3] - bbox[1] + 1) * CELL + pad * 2,
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
  }

  /* -------------------------------------------------------------- pointer */
  let hoverCode = null;
  let selectedCode = null;

  function toCell(evt) {
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = new DOMPoint(evt.clientX, evt.clientY).matrixTransform(ctm.inverse());
    return { x: Math.floor(pt.x / CELL), y: Math.floor(pt.y / CELL) };
  }

  /** Nearest country within `radius` cells; countries with data win ties. */
  function codeAt(cell, radius = 2) {
    if (!cell) return null;
    let fallback = null;
    for (let r = 0; r <= radius; r += 1) {
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const code = cellMap.get(`${cell.x + dx},${cell.y + dy}`);
          if (code == null) continue;
          if (countries.get(code)?.hasData) return code;
          if (fallback === null) fallback = code || '';
        }
      }
    }
    return fallback;
  }

  function paintHover() {
    landLayer.querySelectorAll('.country.is-hover').forEach((g) => g.classList.remove('is-hover'));
    haloLayer.querySelectorAll('.halo.is-hover').forEach((g) => g.classList.remove('is-hover'));
    if (!hoverCode) return;
    groups.get(hoverCode)?.classList.add('is-hover');
    halos.get(hoverCode)?.halo.classList.add('is-hover');
  }

  function handleMove(evt) {
    const code = codeAt(toCell(evt));
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

  function handleClick(evt) {
    const code = codeAt(toCell(evt), 3);
    if (code === null) return;
    onSelect?.(code);
  }

  svg.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') handleMove(e); });
  svg.addEventListener('pointerleave', handleLeave);
  svg.addEventListener('click', handleClick);

  /* --------------------------------------------------------------- update */
  let lastActivity = new Map();

  function update(activityByCode) {
    lastActivity = activityByCode;
    for (const [code, g] of groups) {
      const a = activityByCode.get(code);
      g.style.setProperty('--a', a == null ? 0 : (a / 100).toFixed(3));
    }
    const ranked = [...activityByCode.entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
    const breathing = new Set(ranked.slice(0, 5).map(([c]) => c));

    for (const [code, h] of halos) {
      const a = activityByCode.get(code) ?? 0;
      const on = a > 0;
      h.halo.classList.toggle('is-off', !on);
      h.halo.classList.toggle('is-breathing', on && breathing.has(code) && !reduceMotion.matches);
      h.glow.setAttribute('r', 34 + a * 0.55);
      h.halo.style.setProperty('--a', (a / 100).toFixed(3));
      h.ring.setAttribute('r', 10 + a * 0.09);
    }
  }

  /* -------------------------------------------------------------- ripples */
  function ripple(code) {
    if (reduceMotion.matches) return;
    const h = halos.get(code);
    if (!h) return;
    const c = el('circle', { cx: h.cx, cy: h.cy, r: 8, class: 'ripple' });
    rippleLayer.append(c);
    window.setTimeout(() => c.remove(), 3400);
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
      const bend = Math.min(90, dist * 0.18);
      const cx = mx - (dy / dist) * bend;
      const cy = my + (dx / dist) * bend;
      const path = el('path', {
        class: 'link',
        d: `M ${from.cx} ${from.cy} Q ${cx} ${cy} ${to.cx} ${to.cy}`,
      });
      if (!reduceMotion.matches) path.style.animationDelay = `${i * 90}ms`;
      linkLayer.append(path);
      linkLayer.append(el('circle', { class: 'link-end', cx: to.cx, cy: to.cy, r: 3 }));
    });
    linkLayer.append(el('circle', { class: 'link-origin', cx: from.cx, cy: from.cy, r: 4.5 }));
  }

  function clearLinks() {
    linkLayer.textContent = '';
  }

  /* ------------------------------------------------------------ selection */
  function setSelected(code) {
    selectedCode = code;
    landLayer.querySelectorAll('.country.is-selected').forEach((g) => g.classList.remove('is-selected'));
    haloLayer.querySelectorAll('.halo.is-selected').forEach((g) => g.classList.remove('is-selected'));
    svg.classList.toggle('has-selection', Boolean(code));
    if (!code) return;
    groups.get(code)?.classList.add('is-selected');
    halos.get(code)?.halo.classList.add('is-selected');
  }

  function focusCountry(code) {
    hits.get(code)?.focus();
  }

  function setLabel(code, label) {
    hits.get(code)?.setAttribute('aria-label', label);
  }

  function centroidClientPos(code) {
    const h = halos.get(code);
    const ctm = svg.getScreenCTM();
    if (!h || !ctm) return null;
    const pt = new DOMPoint(h.cx, h.cy).matrixTransform(ctm);
    return { x: pt.x, y: pt.y };
  }

  return {
    update, ripple, showLinks, clearLinks, setSelected, focusCountry, setLabel,
    centroidClientPos,
    get selected() { return selectedCode; },
    get activity() { return lastActivity; },
    prefersReducedMotion: () => reduceMotion.matches,
  };
}
