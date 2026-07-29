/**
 * timeline.js — the 24-hour scrubber under the map, drawn as an activity
 * waveform. It emits an offset in hours (0 = now) and never re-renders
 * anything itself.
 */
import { t, pick, locale, getLang } from './i18n.js';

const NS = 'http://www.w3.org/2000/svg';
const TICKS = [24, 12, 6, 3, 0];
const COLUMN_DOTS = 7;

function svgEl(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function h(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

export function renderTimeline({ container, frames, onChange }) {
  // oldest on the left, now on the right
  const ordered = [...frames].sort((a, b) => b.offsetHours - a.offsetHours);
  let index = ordered.length - 1;

  container.textContent = '';

  const panel = h('div', 'tl-panel');

  /* ------------------------------------------------------------- captions */
  const side = h('div', 'tl-side');
  const title = h('p', 'tl-title');
  const sub = h('p', 'tl-sub');
  const readout = h('p', 'mono tl-readout');
  side.append(title, sub, readout);

  /* ---------------------------------------------------------------- chart */
  const chart = h('div', 'tl-chart');
  const plot = svgEl('svg', {
    class: 'tl-wave', viewBox: '0 0 1000 90', preserveAspectRatio: 'none',
    'aria-hidden': 'true',
  });
  const area = svgEl('path', { class: 'tl-area' });
  const trace = svgEl('path', { class: 'tl-trace' });
  const columns = svgEl('g', { class: 'tl-cols' });
  const baseline = svgEl('line', { class: 'tl-base', x1: 0, y1: 78, x2: 1000, y2: 78 });
  const nowMark = svgEl('g', { class: 'tl-now' });
  nowMark.append(
    svgEl('line', { class: 'tl-now-line', x1: 1000, y1: 4, x2: 1000, y2: 78 }),
    svgEl('circle', { class: 'tl-now-dot', cx: 1000, cy: 78, r: 2.6 }),
  );
  const cursor = svgEl('g', { class: 'tl-cursor' });
  const cursorLine = svgEl('line', { class: 'tl-cursor-line', y1: 6, y2: 78 });
  const cursorDot = svgEl('circle', { class: 'tl-cursor-dot', r: 4.5, cy: 6 });
  cursor.append(cursorLine, cursorDot);
  plot.append(area, trace, columns, baseline, nowMark, cursor);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = String(ordered.length - 1);
  slider.step = '1';
  slider.value = String(index);
  slider.className = 'tl-slider';

  const marks = h('div', 'tl-marks');
  const markButtons = TICKS.map((hours) => {
    const b = h('button', 'mono tl-mark');
    b.type = 'button';
    b.dataset.hours = String(hours);
    b.style.left = `${(1 - hours / 24) * 100}%`;
    b.addEventListener('click', () => selectByHours(hours));
    marks.append(b);
    return b;
  });

  chart.append(plot, slider, marks);
  panel.append(side, chart);
  container.append(panel);

  slider.addEventListener('input', () => select(Number(slider.value)));

  /* -------------------------------------------------------------- drawing */

  /**
   * A dot column per frame, with a soft trace drawn through the column tops.
   * With only one frame of history the trace collapses to a flat line rather
   * than breaking, which is what a freshly-deployed repository will show.
   */
  function drawWave() {
    columns.textContent = '';
    const sourceValues = ordered.map((f) => {
      const list = Object.values(f.countries ?? {});
      if (!list.length) return 0;
      const sum = list.reduce((acc, c) => acc + (Number(c.activityScore) || 0), 0);
      return sum / list.length;
    });
    /* The source has only a handful of selectable frames. Interpolate a dense,
       deterministic display series so the strip reads like the reference
       pulse monitor without inventing additional selectable timestamps. */
    const displayCount = Math.max(96, sourceValues.length);
    const values = Array.from({ length: displayCount }, (_, i) => {
      if (sourceValues.length < 2) return sourceValues[0] ?? 0;
      const t = i / (displayCount - 1);
      const at = t * (sourceValues.length - 1);
      const lo = Math.floor(at);
      const hi = Math.min(sourceValues.length - 1, lo + 1);
      const mix = at - lo;
      const base = sourceValues[lo] * (1 - mix) + sourceValues[hi] * mix;
      const texture = 0.86 + Math.abs(Math.sin(i * 1.71)) * 0.24
        + Math.sin(i * 0.37) * 0.08;
      return base * texture;
    });
    const peak = Math.max(40, ...values);
    const n = Math.max(1, values.length - 1);
    const pts = [];

    values.forEach((v, i) => {
      const x = values.length === 1 ? 1000 : (i / n) * 1000;
      const strength = Math.max(0.06, v / peak);
      const lit = Math.max(1, Math.round(strength * COLUMN_DOTS));
      pts.push([x, 78 - (lit - 1) * 10]);
      for (let k = 0; k < COLUMN_DOTS; k += 1) {
        const y = 78 - k * 10;
        const on = k < lit;
        columns.append(svgEl('circle', {
          class: `tl-dot${on ? ' is-on' : ''}`,
          cx: x.toFixed(1), cy: y, r: on ? 1.7 : 1.1,
          style: `--i:${Math.round((i / n) * Math.max(0, ordered.length - 1))};--k:${k}`,
        }));
      }
    });

    if (pts.length === 1) pts.unshift([0, pts[0][1]]);
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
    trace.setAttribute('d', line);
    area.setAttribute('d', `${line}L${pts[pts.length - 1][0].toFixed(1)} 78L${pts[0][0].toFixed(1)} 78Z`);
  }

  function selectByHours(hours) {
    let best = 0;
    ordered.forEach((f, i) => {
      if (Math.abs(f.offsetHours - hours) < Math.abs(ordered[best].offsetHours - hours)) best = i;
    });
    select(best);
  }

  function select(i, silent = false) {
    index = Math.max(0, Math.min(ordered.length - 1, i));
    slider.value = String(index);
    paint();
    if (!silent) onChange?.(ordered[index].offsetHours);
  }

  function paint() {
    const frame = ordered[index];
    title.textContent = t('time.title');
    sub.textContent = t('time.sub');
    slider.setAttribute('aria-label', t('time.label'));
    slider.setAttribute('aria-valuetext', pick(frame.label));

    const n = Math.max(1, ordered.length - 1);
    const x = (index / n) * 1000;
    cursorLine.setAttribute('x1', x.toFixed(1));
    cursorLine.setAttribute('x2', x.toFixed(1));
    cursorDot.setAttribute('cx', x.toFixed(1));

    columns.querySelectorAll('.tl-dot').forEach((dot) => {
      dot.classList.toggle('is-here', Number(dot.style.getPropertyValue('--i')) === index);
    });

    markButtons.forEach((b) => {
      const hours = Number(b.dataset.hours);
      b.textContent = hours === 0
        ? (getLang() === 'ja' ? t('time.now') : 'NOW')
        : `${hours}H`;
      const on = Math.abs(ordered[index].offsetHours - hours) < 1.5;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function setReadout(date) {
    const fmt = new Intl.DateTimeFormat(locale(), {
      month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    });
    readout.textContent = `${t('time.viewing')}  ${fmt.format(date)}`;
  }

  drawWave();
  paint();

  return {
    get offsetHours() { return ordered[index].offsetHours; },
    setReadout,
    refresh: paint,
    select,
  };
}
