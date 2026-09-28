import { MSG_BG, MSG_HEIGHT, MSG_VISIBLE, MSG_PLAY, MSG_PAUSE, MSG_RESET, MSG_KNOBS, MSG_GOTO } from '../core/protocol.js';
import { iconSvg } from '../core/icons.js';
import { attachFigureKnobs, toggleFigureKnobs, closeFigureKnobs, knobMessage, knobResetMessage } from './knobs.js';

export { knobsPanel, knobsSignature, attachFigureKnobs, toggleFigureKnobs, closeFigureKnobs } from './knobs.js';

let bgVar = '--bg';

export function configureSandboxClient({ backgroundVar } = {}) {
  if (backgroundVar) bgVar = backgroundVar;
}

export const figureBg = () => getComputedStyle(document.documentElement).getPropertyValue(bgVar).trim();

export const pushFigureTheme = (win) => { if (win) win.postMessage({ [MSG_BG]: figureBg() }, '*'); };

export function watchFigureTheme(frames) {
  const push = () => { for (const f of frames()) pushFigureTheme(f.contentWindow); };
  const obs = new MutationObserver(push);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const mq = matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', push);
  return () => { obs.disconnect(); mq.removeEventListener('change', push); };
}

// Accepts an iframe, a figure element, or a window, so a caller can hand over whatever
// it already has in hand.
const figureWindow = (target) => {
  if (!target) return null;
  if (typeof target.postMessage === 'function') return target;
  const frame = target.tagName === 'IFRAME' ? target : target.querySelector?.('.sandbox-frame');
  return frame?.contentWindow ?? null;
};

const postToFigure = (target, msg) => figureWindow(target)?.postMessage(msg, '*');

// For `control=manual`: the host decides when the figure runs.
export const playFigure = (target) => postToFigure(target, { [MSG_PLAY]: true });
export const pauseFigure = (target) => postToFigure(target, { [MSG_PAUSE]: true });
export const resetFigure = (target) => postToFigure(target, { [MSG_RESET]: true });

// For `control=hover`: entering runs it, leaving rewinds it to the first frame. mountFigures
// wires these for you; call them directly to drive a figure from a larger region, like a card.
export const enterFigure = (target) => postToFigure(target, { [MSG_PLAY]: true });
export const leaveFigure = (target) => postToFigure(target, { [MSG_PLAY]: false });

// Sets a knob from the page, the way the panel does: the figure re-runs with the new value.
export const setFigureKnob = (target, key, value) => postToFigure(target, knobMessage(key, value));
export const resetFigureKnobs = (target) => postToFigure(target, knobResetMessage());

const HOVER_FIGURE = ".sandbox[data-control='hover']";

// A frame swallows the pointer, so neither document sees it cross the boundary. remark lays a
// .sandbox-hover surface over the frame for exactly this reason: with a host-document element
// as the hit target, enter and leave fire on the figure normally.
export function watchFigureHover(root = document) {
  const scope = () => (typeof root === 'function' ? root() : root);
  const wired = new WeakSet();
  return function sync() {
    for (const fig of scope()?.querySelectorAll(HOVER_FIGURE) ?? []) {
      if (wired.has(fig)) continue;
      wired.add(fig);
      fig.addEventListener('pointerenter', () => enterFigure(fig));
      fig.addEventListener('pointerleave', () => leaveFigure(fig));
    }
  };
}

export function watchFigureVisibility(frames) {
  const onScreen = new WeakMap();
  const pageAwake = () => document.visibilityState === 'visible' && document.hasFocus();
  const send = (f) => f.contentWindow?.postMessage({ [MSG_VISIBLE]: (onScreen.get(f) ?? true) && pageAwake() }, '*');
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) { onScreen.set(e.target, e.isIntersecting); send(e.target); }
  });
  const sync = () => { for (const f of frames()) { io.observe(f); send(f); } };
  const onPage = () => { for (const f of frames()) send(f); };
  document.addEventListener('visibilitychange', onPage);
  window.addEventListener('focus', onPage);
  window.addEventListener('blur', onPage);
  sync();
  return {
    sync,
    stop() {
      io.disconnect();
      document.removeEventListener('visibilitychange', onPage);
      window.removeEventListener('focus', onPage);
      window.removeEventListener('blur', onPage);
    },
  };
}

// The text of line `n` of a highlighted code block as a Range, whatever markup the
// highlighter wrapped it in: the walk counts newlines across every text node.
function lineRange(root, n) {
  if (!root || !(n >= 1)) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let line = 1;
  let started = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue;
    for (let i = 0; i < text.length; i++) {
      if (!started && line === n) { range.setStart(node, i); started = true; }
      if (text[i] !== '\n') continue;
      if (started) { range.setEnd(node, i); return range; }
      line++;
    }
    if (!started && line === n) { range.setStart(node, text.length); started = true; }
  }
  if (!started) return null;
  const last = root.lastChild;
  if (last) range.setEndAfter(last);
  return range;
}

const HIT = 'sandbox-goto';
const clearHit = () => { if (typeof CSS !== 'undefined' && CSS.highlights) CSS.highlights.delete(HIT); };

// A frame's error names the shared block it came from; this brings that block on screen
// with its code open and the line marked. Marking uses the CSS Custom Highlight API, so
// browsers without it still scroll there. The mark clears on the next press anywhere.
function gotoSource(scope, fromFrame, { source, line }) {
  const libs = [...(scope?.querySelectorAll(`.sandbox-lib[data-source="${Number(source)}"]`) ?? [])];
  if (!libs.length) return;
  // Several documents on one page each count their blocks from zero: take the nearest.
  const all = [...scope.querySelectorAll('.sandbox')];
  const fromAt = all.indexOf(fromFrame?.closest('.sandbox'));
  const away = (el) => (fromAt < 0 ? 0 : Math.abs(all.indexOf(el) - fromAt));
  const lib = libs.reduce((best, el) => (away(el) < away(best) ? el : best));

  if (lib.getAttribute('data-mode') !== 'code') {
    lib.setAttribute('data-mode', 'code');
    const btn = lib.querySelector('.sandbox-toggle');
    if (btn) setBtn(btn, 'codeOff', 'Hide code');
  }

  clearHit();
  const range = lineRange(lib.querySelector('.sandbox-code code, .sandbox-code pre'), line);
  if (range && typeof CSS !== 'undefined' && CSS.highlights) CSS.highlights.set(HIT, new Highlight(range));

  const box = range?.getClientRects()[0] || range?.getBoundingClientRect();
  const target = box && box.height ? box : lib.getBoundingClientRect();
  window.scrollTo({ top: window.scrollY + target.top - window.innerHeight / 2, behavior: 'smooth' });
}

const setBtn = (btn, icon, label) => {
  btn.innerHTML = iconSvg(icon);
  btn.title = label;
  btn.setAttribute('aria-label', label);
};

export function mountFigures({
  root = document,
  selector = '.sandbox-frame',
  sizeCode = true,
  toggle = true,
  prime = true,
  hover = true,
  knobs = true,
  onResize,
} = {}) {
  const scope = () => (typeof root === 'function' ? root() : root);
  const frames = () => scope()?.querySelectorAll(selector) ?? [];

  const vis = watchFigureVisibility(frames);
  const stopTheme = watchFigureTheme(frames);
  const syncHover = hover ? watchFigureHover(scope) : null;
  syncHover?.();

  const onMessage = (e) => {
    const defs = e.data && e.data[MSG_KNOBS];
    if (Array.isArray(defs)) {
      if (!knobs) return;
      for (const f of frames()) {
        if (f.contentWindow !== e.source) continue;
        const fig = f.closest('.sandbox');
        if (fig) attachFigureKnobs(fig, defs, (msg) => f.contentWindow?.postMessage(msg, '*'));
        break;
      }
      return;
    }

    const goto = e.data && e.data[MSG_GOTO];
    if (goto) {
      const from = [...frames()].find((f) => f.contentWindow === e.source);
      if (from) gotoSource(scope(), from, goto);
      return;
    }

    const h = e.data && e.data[MSG_HEIGHT];
    if (typeof h !== 'number') return;

    for (const f of frames()) {
      if (f.contentWindow !== e.source) continue;
      pushFigureTheme(f.contentWindow);
      vis.sync();
      syncHover?.();

      // A hover figure is sized by its host, and the height it reports is just that box
      // measured back — taking it would pin the frame to whatever it happened to start at.
      const fig = f.closest('.sandbox');
      if (h > 0 && fig?.dataset.control !== 'hover') {
        f.style.height = h + 'px';
        if (sizeCode) fig?.style.setProperty('--sandbox-h', h + 'px');
        onResize?.(f, h);
      }
      break;
    }
  };
  window.addEventListener('message', onMessage);

  const primeFigures = () => { for (const f of frames()) pushFigureTheme(f.contentWindow); };
  if (prime) {
    if (document.readyState === 'complete') primeFigures();
    else window.addEventListener('load', primeFigures);
  }

  const onToggle = (e) => {
    const copyBtn = e.target.closest('.sandbox-copy');
    if (copyBtn) {
      const code = copyBtn.closest('.sandbox')?.querySelector('.sandbox-code, pre');
      if (!code || !navigator.clipboard) return;
      navigator.clipboard.writeText(code.textContent).then(() => {
        clearTimeout(copyBtn.copyTimer);
        setBtn(copyBtn, 'check', 'Copied');
        copyBtn.copyTimer = setTimeout(() => setBtn(copyBtn, 'copy', 'Copy code'), 1200);
      }, () => {});
      return;
    }
    const knobBtn = e.target.closest('.sandbox-knobs-btn');
    if (knobBtn) {
      toggleFigureKnobs(knobBtn.closest('.sandbox'));
      return;
    }
    const btn = e.target.closest('.sandbox-toggle');
    if (!btn) return;
    const fig = btn.closest('.sandbox');
    if (!fig) return;
    const showingCode = fig.getAttribute('data-mode') === 'code';
    fig.setAttribute('data-mode', showingCode ? 'preview' : 'code');
    // The stage goes away with the code in front, and the panel belongs to the stage.
    toggleFigureKnobs(fig, false);
    // A figure swaps its code for the preview; a shared block has nothing to swap it for,
    // so its button only ever shows or hides the code.
    if (fig.classList.contains('sandbox-lib')) setBtn(btn, showingCode ? 'code' : 'codeOff', showingCode ? 'Show code' : 'Hide code');
    else setBtn(btn, showingCode ? 'code' : 'eye', showingCode ? 'Show code' : 'Show preview');
  };
  if (toggle) document.addEventListener('click', onToggle);
  document.addEventListener('pointerdown', clearHit);

  // A panel closes on a press anywhere else, or on Escape. A press on the frame itself never
  // reaches this document, so the panel stays put while the figure is poked at.
  const onDown = (e) => closeFigureKnobs(e.target);
  const onKey = (e) => { if (e.key === 'Escape') closeFigureKnobs(null); };
  if (knobs) {
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
  }

  return function stop() {
    window.removeEventListener('message', onMessage);
    window.removeEventListener('load', primeFigures);
    if (toggle) document.removeEventListener('click', onToggle);
    if (knobs) {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    }
    document.removeEventListener('pointerdown', clearHit);
    clearHit();
    stopTheme();
    vis.stop();
  };
}
