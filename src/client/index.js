import { MSG_BG, MSG_HEIGHT, MSG_VISIBLE } from '../core/protocol.js';

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
  onResize,
} = {}) {
  const scope = () => (typeof root === 'function' ? root() : root);
  const frames = () => scope()?.querySelectorAll(selector) ?? [];

  const vis = watchFigureVisibility(frames);
  const stopTheme = watchFigureTheme(frames);

  const onMessage = (e) => {
    const h = e.data && e.data[MSG_HEIGHT];
    if (typeof h !== 'number') return;

    for (const f of frames()) {
      if (f.contentWindow !== e.source) continue;
      pushFigureTheme(f.contentWindow);
      vis.sync();

      if (h > 0) {
        f.style.height = h + 'px';
        if (sizeCode) f.closest('.sandbox')?.style.setProperty('--sandbox-h', h + 'px');
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
    const btn = e.target.closest('.sandbox-toggle');
    if (!btn) return;
    const fig = btn.closest('.sandbox');
    if (!fig) return;
    const showingCode = fig.getAttribute('data-mode') === 'code';
    fig.setAttribute('data-mode', showingCode ? 'preview' : 'code');
    btn.textContent = showingCode ? 'Show code' : 'Show preview';
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
