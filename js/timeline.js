/**
 * timeline.js — the 24-hour scrubber under the map.
 * Emits an offset in hours (0 = now); it never re-renders anything itself.
 */
import { t, pick, locale, getLang } from './i18n.js';

export function renderTimeline({ container, frames, onChange }) {
  // oldest on the left, now on the right
  const ordered = [...frames].sort((a, b) => b.offsetHours - a.offsetHours);
  let index = ordered.length - 1;

  container.textContent = '';

  const head = document.createElement('div');
  head.className = 'tl-head';
  const label = document.createElement('span');
  label.className = 'tl-label';
  const readout = document.createElement('span');
  readout.className = 'tl-readout mono';
  head.append(label, readout);

  const row = document.createElement('div');
  row.className = 'tl-row';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = String(ordered.length - 1);
  slider.step = '1';
  slider.value = String(index);
  slider.className = 'tl-slider';

  const marks = document.createElement('div');
  marks.className = 'tl-marks';
  const buttons = ordered.map((frame, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tl-mark';
    b.dataset.index = String(i);
    b.addEventListener('click', () => select(i));
    marks.append(b);
    return b;
  });

  row.append(slider, marks);
  container.append(head, row);

  slider.addEventListener('input', () => select(Number(slider.value)));

  function select(i, silent = false) {
    index = Math.max(0, Math.min(ordered.length - 1, i));
    slider.value = String(index);
    paint();
    if (!silent) onChange?.(ordered[index].offsetHours);
  }

  function paint() {
    const frame = ordered[index];
    label.textContent = t('time.label');
    slider.setAttribute('aria-label', t('time.label'));
    slider.setAttribute('aria-valuetext', pick(frame.label));
    buttons.forEach((b, i) => {
      const f = ordered[i];
      b.textContent = getLang() === 'ja' && f.offsetHours === 0 ? t('time.now') : f.shortLabel;
      const on = i === index;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', pick(f.label));
    });
  }

  function setReadout(date) {
    const fmt = new Intl.DateTimeFormat(locale(), {
      month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    });
    readout.textContent = `${t('time.viewing')}  ${fmt.format(date)}`;
  }

  paint();

  return {
    get offsetHours() { return ordered[index].offsetHours; },
    setReadout,
    refresh: paint,
    select,
  };
}
