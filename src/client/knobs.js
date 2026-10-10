import { iconSvg } from '../core/icons.js';
import { MSG_KNOB } from '../core/protocol.js';

// The panel a figure's knobs are dialled from. Plain DOM, so the same panel serves the
// figures a page renders and the preview inside the editor.

const ranged = (d) => typeof d.min === 'number' && typeof d.max === 'number' && d.max > d.min;
const isInt = (n) => n == null || Number.isInteger(n);

// Integers step by one. A float slider steps by a round fraction of its range, so the
// readout never shows 2.53 for a knob whose author meant tenths.
const stepOf = (d) => {
  if (d.step) return d.step;
  if (isInt(d.value) && isInt(d.min) && isInt(d.max)) return 1;
  return ranged(d) ? Math.pow(10, Math.floor(Math.log10((d.max - d.min) / 100))) : 'any';
};

const fmt = (n) => (Number.isInteger(n) ? String(n) : String(+Number(n).toFixed(3)));

// The widest readout a slider can show, so the value beside it never nudges the track.
const readoutWidth = (d) => {
  const nums = [d.min, d.max, d.value, stepOf(d)];
  const decimals = Math.max(...nums.map((n) => (fmt(n).split('.')[1] || '').length));
  const digits = Math.max(...[d.min, d.max].map((n) => String(Math.floor(Math.abs(n))).length));
  return (d.min < 0 ? 1 : 0) + digits + (decimals ? decimals + 1 : 0);
};

// A colour input only speaks six-digit hex.
const hex6 = (c) => (/^#[0-9a-f]{3}$/i.test(c) ? '#' + c.slice(1).split('').map((x) => x + x).join('') : c);

const RGB = ['r', 'g', 'b'];
const isRgb = (c) => c != null && typeof c === 'object' && RGB.every((k) => typeof c[k] === 'number');
const rgbRanged = (d) => isRgb(d.min) && isRgb(d.max) && RGB.some((k) => d.min[k] !== d.max[k]);
const byte = (n) => Math.max(0, Math.min(255, Math.round(n)));
const rgbHex = (c) => '#' + RGB.map((k) => byte(c[k]).toString(16).padStart(2, '0')).join('');
const hexRgb = (h) => Object.fromEntries(RGB.map((k, i) => [k, parseInt(h.slice(1 + i * 2, 3 + i * 2), 16)]));
const rgbCss = (c) => `rgb(${RGB.map((k) => byte(c[k])).join(' ')})`;

const mixRgb = (d, t) =>
  Object.fromEntries(RGB.map((k) => {
    const v = d.min[k] + (d.max[k] - d.min[k]) * t;
    return [k, isInt(d.min[k]) && isInt(d.max[k]) ? Math.round(v) : v];
  }));

// Where a colour sits along min→max: its projection onto that line, so a value off the line still lands somewhere sensible.
const rgbPosition = (d, c) => {
  let along = 0;
  let span = 0;
  for (const k of RGB) {
    const dk = d.max[k] - d.min[k];
    along += (c[k] - d.min[k]) * dk;
    span += dk * dk;
  }
  return Math.max(0, Math.min(1, along / span));
};

// The shape of a panel: everything about its knobs except the values they hold. A host
// rebuilds the panel only when this changes, so a report that merely carries fresh values
// leaves the inputs — and a drag in progress — alone.
export const knobsSignature = (defs) =>
  JSON.stringify((defs || []).map((d) => [d.key, d.label, d.type, d.min, d.max, d.step, d.options]));

const el = (tag, className, attrs = {}) => {
  const n = document.createElement(tag);
  if (className) n.className = className;
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  return n;
};

// A press anywhere on a slider drags from its current value rather than jumping to the pointer.
function relativeDrag(input) {
  input.style.touchAction = 'pan-y';
  input.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || input.disabled) return;
    e.preventDefault();
    input.focus({ preventScroll: true });
    input.setPointerCapture(e.pointerId);
    const min = Number(input.min);
    const max = Number(input.max);
    const start = Number(input.value);
    const startX = e.clientX;
    const perPx = (max - min) / Math.max(1, input.getBoundingClientRect().width - 16);
    let moved = false;
    const move = (ev) => {
      const prev = input.value;
      input.value = String(Math.max(min, Math.min(max, start + (ev.clientX - startX) * perPx)));
      if (input.value === prev) return;
      moved = true;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const end = () => {
      input.removeEventListener('pointermove', move);
      input.removeEventListener('pointerup', end);
      input.removeEventListener('pointercancel', end);
      if (moved) input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    input.addEventListener('pointermove', move);
    input.addEventListener('pointerup', end);
    input.addEventListener('pointercancel', end);
  });
}

function knobRow(d, onChange) {
  const row = el('label', 'sandbox-knob');
  row.dataset.type = d.type;
  const name = el('span', 'sandbox-knob-name');
  name.textContent = d.label;
  name.title = d.label;
  const ctl = el('span', 'sandbox-knob-ctl');
  const cur = d.cur === undefined ? d.value : d.cur;
  let input;
  let reset;

  if (d.type === 'boolean') {
    input = el('input', '', { type: 'checkbox' });
    input.checked = Boolean(cur);
    input.addEventListener('change', () => onChange(d.key, input.checked));
    row.append(input, name);
    return { el: row, reset: () => { input.checked = Boolean(d.value); } };
  }

  if (d.type === 'select') {
    const options = d.options || [];
    input = el('select');
    options.forEach((o, i) => {
      const opt = el('option', '', { value: i });
      opt.textContent = String(o);
      input.append(opt);
    });
    input.value = String(Math.max(0, options.indexOf(cur)));
    input.addEventListener('change', () => onChange(d.key, options[Number(input.value)]));
    reset = () => { input.value = String(Math.max(0, options.indexOf(d.value))); };
  } else if (d.type === 'number') {
    const slider = ranged(d);
    input = el('input', '', { type: slider ? 'range' : 'number', min: d.min, max: d.max, step: stepOf(d) });
    input.value = String(cur);
    if (slider) relativeDrag(input);
    const out = slider ? el('output') : null;
    if (out) {
      out.style.minWidth = `${readoutWidth(d)}ch`;
      out.textContent = fmt(cur);
    }
    input.addEventListener('input', () => {
      if (input.value === '') return;
      const v = Number(input.value);
      if (Number.isNaN(v)) return;
      if (out) out.textContent = fmt(v);
      onChange(d.key, v);
    });
    ctl.append(input);
    if (out) ctl.append(out);
    reset = () => { input.value = String(d.value); if (out) out.textContent = fmt(d.value); };
  } else if (d.type === 'color') {
    input = el('input', '', { type: 'color' });
    input.value = hex6(String(cur));
    input.addEventListener('input', () => onChange(d.key, input.value));
    reset = () => { input.value = hex6(String(d.value)); };
  } else if (d.type === 'rgb' && rgbRanged(d)) {
    input = el('input', '', { type: 'range', min: 0, max: 1, step: 0.001 });
    input.style.setProperty('--sbx-knob-track', `linear-gradient(to right, ${rgbCss(d.min)}, ${rgbCss(d.max)})`);
    const swatch = el('output', 'sandbox-knob-swatch');
    const show = (c) => { swatch.style.background = rgbCss(c); swatch.title = rgbHex(c); };
    const place = (c) => { input.value = String(rgbPosition(d, c)); show(c); };
    place(cur);
    relativeDrag(input);
    input.addEventListener('input', () => {
      const c = mixRgb(d, Number(input.value));
      show(c);
      onChange(d.key, c);
    });
    ctl.append(input, swatch);
    reset = () => place(d.value);
  } else if (d.type === 'rgb') {
    input = el('input', '', { type: 'color' });
    input.value = rgbHex(cur);
    input.addEventListener('input', () => onChange(d.key, hexRgb(input.value)));
    reset = () => { input.value = rgbHex(d.value); };
  } else {
    input = el('input', '', { type: 'text' });
    input.value = String(cur);
    input.addEventListener('input', () => onChange(d.key, input.value));
    reset = () => { input.value = String(d.value); };
  }

  if (!ctl.childNodes.length) ctl.append(input);
  row.append(name, ctl);
  return { el: row, reset };
}

export function knobsPanel(defs, { onChange, onReset } = {}) {
  const panel = el('div', 'sandbox-knobs', { role: 'group', 'aria-label': 'Figure settings' });

  const rows = (defs || []).map((d) => knobRow(d, (key, value) => onChange?.(key, value)));
  for (const r of rows) panel.append(r.el);

  const foot = el('div', 'sandbox-knobs-foot');
  const resetBtn = el('button', 'sandbox-knobs-reset', { type: 'button', title: 'Reset to default', 'aria-label': 'Reset to default' });
  resetBtn.innerHTML = iconSvg('reset', 13);
  resetBtn.addEventListener('click', () => {
    for (const r of rows) r.reset();
    onReset?.();
  });
  foot.append(resetBtn);
  panel.append(foot);
  return panel;
}

export const knobMessage = (key, value) => ({ [MSG_KNOB]: { key, value } });
export const knobResetMessage = () => ({ [MSG_KNOB]: { reset: true } });

const panels = new WeakMap();

// Puts a settings button in the figure's tool corner and hangs the panel off it. Called with
// each report a frame sends; a report with no knobs takes both away again.
export function attachFigureKnobs(fig, defs, post) {
  const prev = panels.get(fig);
  if (!defs.length) {
    prev?.btn.remove();
    prev?.panel.remove();
    panels.delete(fig);
    return;
  }
  const sig = knobsSignature(defs);
  if (prev && prev.sig === sig) return;
  prev?.panel.remove();

  let tools = fig.querySelector(':scope > .sandbox-tools');
  if (!tools) {
    tools = el('div', 'sandbox-tools');
    fig.append(tools);
  }
  let btn = prev?.btn;
  if (!btn) {
    btn = el('button', 'sandbox-knobs-btn', { type: 'button', title: 'Settings', 'aria-label': 'Figure settings', 'aria-haspopup': 'true' });
    btn.innerHTML = iconSvg('settings');
    tools.prepend(btn);
  }
  const panel = knobsPanel(defs, {
    onChange: (key, value) => post(knobMessage(key, value)),
    onReset: () => post(knobResetMessage()),
  });
  panel.hidden = prev ? prev.panel.hidden : true;
  btn.setAttribute('aria-expanded', String(!panel.hidden));
  fig.append(panel);
  panels.set(fig, { sig, btn, panel });
}

export function toggleFigureKnobs(fig, open) {
  const p = panels.get(fig);
  if (!p) return;
  const next = open === undefined ? p.panel.hidden : Boolean(open);
  p.panel.hidden = !next;
  p.btn.setAttribute('aria-expanded', String(next));
}

// Closes every open panel the pointer did not land in — its button counts as in, so a click
// there toggles rather than closing and reopening.
export function closeFigureKnobs(target, root = document) {
  for (const panel of root.querySelectorAll('.sandbox-knobs:not([hidden])')) {
    const fig = panel.closest('.sandbox');
    if (!fig) continue;
    if (target && (panel.contains(target) || target.closest?.('.sandbox-knobs-btn')?.closest('.sandbox') === fig)) continue;
    toggleFigureKnobs(fig, false);
  }
}
