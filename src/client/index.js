import { MSG_BG, MSG_HEIGHT, MSG_VISIBLE, MSG_PLAY, MSG_PAUSE, MSG_RESET } from '../core/protocol.js';
import { iconSvg } from '../core/icons.js';

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

export function mountFigures({
  root = document,
  selector = '.sandbox-frame',
  sizeCode = true,
  toggle = true,
  prime = true,
  hover = true,
  onResize,
} = {}) {
  const scope = () => (typeof root === 'function' ? root() : root);
  const frames = () => scope()?.querySelectorAll(selector) ?? [];

  const vis = watchFigureVisibility(frames);
  const stopTheme = watchFigureTheme(frames);
  const syncHover = hover ? watchFigureHover(scope) : null;
  syncHover?.();

  const onMessage = (e) => {
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

  const setBtn = (btn, icon, label) => {
    btn.innerHTML = iconSvg(icon);
    btn.title = label;
    btn.setAttribute('aria-label', label);
  };

  const onToggle = (e) => {
    const copyBtn = e.target.closest('.sandbox-copy');
    if (copyBtn) {
      // Inside a <summary>, a click would otherwise fold the block shut.
      e.preventDefault();
      const code = copyBtn.closest('.sandbox')?.querySelector('.sandbox-code, pre');
      if (!code || !navigator.clipboard) return;
      navigator.clipboard.writeText(code.textContent).then(() => {
        clearTimeout(copyBtn.copyTimer);
        setBtn(copyBtn, 'check', 'Copied');
        copyBtn.copyTimer = setTimeout(() => setBtn(copyBtn, 'copy', 'Copy code'), 1200);
      }, () => {});
      return;
    }
    const btn = e.target.closest('.sandbox-toggle');
    if (!btn) return;
    const fig = btn.closest('.sandbox');
    if (!fig) return;
    const showingCode = fig.getAttribute('data-mode') === 'code';
    fig.setAttribute('data-mode', showingCode ? 'preview' : 'code');
    setBtn(btn, showingCode ? 'code' : 'eye', showingCode ? 'Show code' : 'Show preview');
  };
  if (toggle) document.addEventListener('click', onToggle);

  return function stop() {
    window.removeEventListener('message', onMessage);
    window.removeEventListener('load', primeFigures);
    if (toggle) document.removeEventListener('click', onToggle);
    stopTheme();
    vis.stop();
  };
}
