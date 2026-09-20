export * from './protocol.js';

const PRESETS = new Set(['canvas', 'svg', 'root']);
const DEFAULT_W = 640;
const DEFAULT_H = 360;

const FIG_BG_LIGHT = '#fbfbf9';
const FIG_BG_DARK = '#17171a';
const themeBgCss = `:root{--sbx-bg:${FIG_BG_LIGHT}}@media(prefers-color-scheme:dark){:root{--sbx-bg:${FIG_BG_DARK}}}body{background:var(--sbx-bg)}`;
const themeBgListener = `addEventListener('message',function(e){if(e.data&&e.data.__sbxBg)document.documentElement.style.setProperty('--sbx-bg',e.data.__sbxBg)});`;

const VIS_GATE =
  `const __RAF=window.requestAnimationFrame,__CAF=window.cancelAnimationFrame;` +
  `let __rq=new Map(),__rk=0,__gVis=!document.hidden,__gHost=true;const __ok=()=>__gVis&&__gHost;` +
  `window.requestAnimationFrame=(cb)=>{if(__ok())return __RAF(cb);const k=--__rk;__rq.set(k,cb);return k};` +
  `window.cancelAnimationFrame=(id)=>{if(id<0)__rq.delete(id);else __CAF(id)};` +
  `const __wake=()=>{if(__ok()&&__rq.size){const q=__rq;__rq=new Map();q.forEach(cb=>__RAF(cb))}};` +
  `addEventListener('visibilitychange',()=>{__gVis=!document.hidden;__wake()});` +
  `addEventListener('message',(e)=>{if(e.data&&'__figvis'in e.data){__gHost=!!e.data.__figvis;__wake()}});`;

export const SANDBOX_TYPES = ['canvas', 'svg', 'root', 'vue'];

export const CONTROL_MODES = ['pausable', 'auto', 'none'];
export { DEFAULT_W, DEFAULT_H };

export function specToToolbar(spec = {}) {
  return {
    type: spec.vue ? 'vue' : (spec.preset || 'canvas'),
    w: spec.w || DEFAULT_W,
    h: spec.h || DEFAULT_H,
    bg: spec.bg || '',
    showCode: Boolean(spec.showCode),
    control: spec.control || 'pausable',
    preview: Boolean(spec.preview),
    label: spec.label || '',
    id: spec.id || '',
  };
}

const DECLARATIONS = [
  /^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/,
  /^(?:export\s+(?:default\s+)?)?class\s+([A-Za-z_$][\w$]*)/,
  /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/,
];

const firstDeclaration = (code) => {
  for (const line of (code || '').split('\n')) {
    if (/^\s*(?:\/\/|\/\*|\*)/.test(line)) continue;
    for (const re of DECLARATIONS) {
      const m = re.exec(line);
      if (m) return m[1];
    }
  }
  return '';
};

const trimUrl = (s) => {
  if (!/^https?:\/\//i.test(s)) return s;
  const parts = s.split(/[?#]/)[0].replace(/\/+$/, '').split('/').filter(Boolean);
  const last = parts[parts.length - 1] || '';
  return /^[0-9a-f]{7,}$/i.test(last) ? parts[parts.length - 2] || last : last;
};

const detailOf = (label, ...parts) => parts.filter((p) => p && p !== label).join(' · ');

export function describeSandboxBlock(spec = {}) {
  const group = spec.id ? `#${spec.id}` : '';
  const named = firstDeclaration(spec.code);

  if (spec.vueLib) {
    const label = spec.label || spec.componentName || named || spec.id || 'vue component';
    return { kind: 'vue-lib', label, detail: detailOf(label, 'vue component', group) };
  }
  if (spec.external) {
    const first = (spec.code || '').split(/\s+/).filter(Boolean)[0] || '';
    const label = trimUrl(spec.label || '') || trimUrl(first) || spec.id || 'external library';
    return { kind: 'external', label, detail: detailOf(label, 'external library', group) };
  }
  if (spec.snippet) {
    const label = spec.label || named || spec.id || 'shared source';
    return { kind: 'snippet', label, detail: detailOf(label, 'shared source', group) };
  }

  const type = spec.vue ? 'vue' : spec.preset || 'canvas';
  const size = `${type} ${spec.w || DEFAULT_W}×${spec.h || DEFAULT_H}`;
  const label = spec.label || named || size;
  return { kind: 'figure', label, detail: detailOf(label, size, group) };
}

export function serializeSandboxMeta({ type, w, h, bg, showCode, control, preview, label, id }) {
  const lang = type === 'vue' ? 'vue' : 'js';
  const tokens = [];
  if (type !== 'vue') tokens.push(type);
  if (w && h && !(Number(w) === DEFAULT_W && Number(h) === DEFAULT_H)) tokens.push(`${w}x${h}`);
  if (bg) tokens.push(`bg="${bg}"`);
  if (showCode) tokens.push('code');
  if (control && control !== 'pausable' && type !== 'vue') tokens.push(`control=${control}`);
  if (preview) tokens.push('preview');
  if (label) tokens.push(`label="${escapeAttr(label)}"`);
  if (id) tokens.push(`id="${id}"`);
  return { lang, meta: tokens.join(' ') };
}

export function buildSandboxFence(state, code) {
  const { lang, meta } = serializeSandboxMeta(state);
  const head = meta ? `${lang} ${meta}` : lang;
  return '```' + head + '\n' + (code || '') + '\n```';
}

export function buildLibFence({ kind, label = '', name = '', id = '' }, code = '') {
  let head;
  if (kind === 'external') head = 'js external-lib' + (label ? `="${label}"` : '');
  else if (kind === 'vue') head = `vue lib="${name}"`;
  else head = 'js lib' + (label ? `="${label}"` : '');
  if (id) head += ` id="${id}"`;
  return '```' + head + '\n' + (code || '') + '\n```';
}

let VUE_SRC = 'https://cdn.jsdelivr.net/npm/vue@3/dist/vue.runtime.global.prod.js';
let SFC_LOADER_SRC = 'https://cdn.jsdelivr.net/npm/vue3-sfc-loader@0.9/dist/vue3-sfc-loader.js';

export function configureVueRuntime({ vue, sfcLoader } = {}) {
  if (vue) VUE_SRC = vue;
  if (sfcLoader) SFC_LOADER_SRC = sfcLoader;
}

export const escapeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

export const unescapeAttr = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&');

export const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function parseMeta(lang, meta) {
  const isVue = lang === 'vue';
  if (lang !== 'js' && lang !== 'javascript' && !isVue) return null;
  const raw = (meta || '').trim();
  const tokens = raw.replace(/([\w-]+)="[^"]*"/g, '$1').split(/\s+/).filter(Boolean);
  const preset = tokens.find((t) => PRESETS.has(t));

  const idMatch = /(?:^|\s)id="([^"]*)"/.exec(raw);
  let id = idMatch ? idMatch[1] : '';
  if (id && !/^[\w-]+$/.test(id)) id = '';

  const labelMatch = /(?:^|\s)label="([^"]*)"/.exec(raw);
  const label = labelMatch ? unescapeAttr(labelMatch[1]).trim() : '';

  if (isVue) {

    const libMatch = /(?:^|\s)lib="([^"]*)"/.exec(raw);
    if (libMatch || tokens.some((t) => t === 'lib' || t.startsWith('lib='))) {
      const name = libMatch ? libMatch[1].trim() : '';
      const component = /^[A-Za-z][\w-]*$/.test(name) ? name : '';
      return { vue: true, vueLib: true, componentName: component, label: name, id };
    }

    const vsize = tokens.find((t) => /^\d+x\d+$/.test(t));
    const [vw, vh] = vsize ? vsize.split('x').map(Number) : [DEFAULT_W, DEFAULT_H];
    const vbgMatch = /(?:^|\s)bg="([^"]*)"/.exec(raw);
    let vbg = vbgMatch ? vbgMatch[1] : '';
    if (vbg && !/^[#\w(),.%\s-]+$/.test(vbg)) vbg = '';
    return { vue: true, preset: 'root', w: vw, h: vh, showCode: tokens.includes('code'), bg: vbg, label, id, preview: tokens.includes('preview') };
  }

  if (!preset && tokens.some((t) => t === 'external-lib' || t.startsWith('external-lib='))) {
    const m = /(?:^|\s)external-lib="([^"]*)"/.exec(raw);
    return { external: true, label: m ? m[1].trim() : '', id };
  }

  if (!preset && tokens.some((t) => t === 'lib' || t.startsWith('lib='))) {
    const m = /(?:^|\s)lib="([^"]*)"/.exec(raw);
    return { snippet: true, label: m ? m[1].trim() : '', id };
  }
  if (!preset) return null;
  const size = tokens.find((t) => /^\d+x\d+$/.test(t));
  const [w, h] = size ? size.split('x').map(Number) : [DEFAULT_W, DEFAULT_H];

  const showCode = tokens.includes('code');

  const cm = /(?:^|\s)control="?([a-z]+)"?/.exec(raw);
  let control = cm ? cm[1] : (tokens.includes('auto') ? 'auto' : 'pausable');
  if (!CONTROL_MODES.includes(control)) control = 'pausable';

  const bgMatch = /(?:^|\s)bg="([^"]*)"/.exec(raw);
  let bg = bgMatch ? bgMatch[1] : '';
  if (bg && !/^[#\w(),.%\s-]+$/.test(bg)) bg = '';

  return { preset, w, h, showCode, bg, control, label, id, preview: tokens.includes('preview') };
}

export function sandboxPrelude(blocks, groupId = '') {
  return (blocks || [])
    .filter((b) => b.snippet && (b.id || '') === (groupId || ''))
    .map((b) => b.code)
    .join('\n\n');
}

export function safeUrl(u) {
  const s = (u || '').trim();
  if (!s.startsWith('https://')) return '';
  if (/["'<>\s]/.test(s)) return '';
  let url;
  try { url = new URL(s); } catch { return ''; }
  if (url.username || url.password) return '';
  if (url.search || url.hash) return '';
  if (!/\.js$/i.test(url.pathname)) return '';
  return s;
}

export function isRawGistUrl(u) {
  try {
    const { hostname } = new URL(u);
    return hostname === 'gist.githubusercontent.com' || hostname === 'raw.githubusercontent.com';
  } catch {
    return false;
  }
}

export function sandboxExternals(blocks, groupId = '') {
  return (blocks || [])
    .filter((b) => b.external && (b.id || '') === (groupId || ''))
    .flatMap((b) => (b.code || '').split(/\s+/))
    .map(safeUrl)
    .filter(Boolean);
}

export function sandboxVueComponents(blocks, groupId = '') {
  return (blocks || [])
    .filter((b) => b.vueLib && b.componentName && (b.id || '') === (groupId || ''))
    .map((b) => ({ name: b.componentName, code: b.code }));
}

export const escapeTemplate = (s) =>
  '`' +
  String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
    .replace(/<\/script>/gi, '<\\/script>') +
  '`';

export function buildVueSrcdoc({ w, h, bg }, code, { externals = [], components = [] } = {}) {

  const fetched = (externals || []).filter(isRawGistUrl);
  const ext = (externals || [])
    .filter((u) => !isRawGistUrl(u))
    .map((u) => `<script src="${u}"></script>`)
    .join('');
  const bgCss = bg ? `body{background:${bg}}` : themeBgCss;
  const rootCss = `#root{position:relative;width:${w}px;height:${h}px;max-width:100%;margin-inline:auto}`;

  const css = `html,body{margin:0;overflow:hidden}${bgCss}${rootCss}canvas,svg{display:block;max-width:100%;height:auto;margin-inline:auto}.err{color:#c0392b;white-space:pre-wrap;font:12px/1.5 ui-monospace,monospace;padding:.75rem}`;

  const files = [
    ...components.map((c) => `${JSON.stringify('/' + c.name + '.vue')}:${escapeTemplate(c.code)}`),
    `${JSON.stringify('/__main__.vue')}:${escapeTemplate(code)}`,
  ].join(',');

  const regs = components
    .map((c) => `app.component(${JSON.stringify(c.name)},await loadModule(${JSON.stringify('/' + c.name + '.vue')},opts));`)
    .join('');

  const script =
    VIS_GATE +
    `const root=document.querySelector('#root');` +
    `const report=()=>parent.postMessage({__sandboxHeight:document.body.scrollHeight},'*');` +
    `new ResizeObserver(report).observe(document.documentElement);` +
    (bg ? '' : themeBgListener) +
    `const __files={${files}};` +
    `const opts={moduleCache:{vue:Vue},getFile(u){const f=__files[u];if(f==null)throw new Error('file not found: '+u);return Promise.resolve(f)},addStyle(t){const s=document.createElement('style');s.textContent=t;document.head.appendChild(s)}};` +
    `const {loadModule}=window['vue3-sfc-loader'];` +
    (fetched.length
      ? `const __fx=[${fetched.map((u) => JSON.stringify(u)).join(',')}];` +
        `const __loadExt=async()=>{for(const u of __fx){const r=await fetch(u);if(!r.ok)throw new Error('external-lib '+u+' failed: HTTP '+r.status);const s=document.createElement('script');s.textContent=await r.text();document.head.appendChild(s)}};`
      : `const __loadExt=async()=>{};`) +
    `(async()=>{try{await __loadExt();const app=Vue.createApp(await loadModule('/__main__.vue',opts));${regs}app.mount(root)}catch(e){document.body.innerHTML='<pre class=err>'+(e&&e.stack||e)+'</pre>'}report()})();`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="root"></div>${ext}<script src="${VUE_SRC}"></script><script src="${SFC_LOADER_SRC}"></script><script>${script}</script></body></html>`;
}

export function buildSrcdoc({ preset, w, h, bg, hover, control }, code, prelude = '', externals = []) {
  const isCanvas = preset === 'canvas';

  const isRoot = preset === 'root';
  const mode = control || 'pausable';
  const isManual = mode === 'manual';

  const pausable = isCanvas && (mode === 'pausable' || mode === 'auto') && !hover;
  const surface = isCanvas
    ? '<canvas></canvas>'
    : isRoot
      ? '<div id="root"></div>'
      : `<svg viewBox="0 0 ${w} ${h}"></svg>`;
  const setup = isCanvas
    ? `const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d'),width=canvas.width=${w},height=canvas.height=${h};`
    : isRoot
      ? `const root=document.querySelector('#root'),width=${w},height=${h};`
      : `const svg=document.querySelector('svg'),width=${w},height=${h};`;

  const fetched = (externals || []).filter(isRawGistUrl);
  const ext = (externals || [])
    .filter((u) => !isRawGistUrl(u))
    .map((u) => `<script src="${u}"></script>`)
    .join('');

  const deferred = (isCanvas || isRoot) && mode === 'pausable' && !hover;
  const playBtn = deferred
    ? `<button id="__play" type="button" aria-label="Run figure"><svg viewBox="0 0 100 100" width="30" height="30" aria-hidden="true"><polygon points="38,28 38,72 74,50" fill="currentColor"/></svg></button>`
    : '';

  const ctlOverlay = pausable
    ? `<div id="__ctl" hidden><button id="__resume" type="button" aria-label="Resume figure"><svg viewBox="0 0 100 100" width="30" height="30" aria-hidden="true"><polygon points="38,28 38,72 74,50" fill="currentColor"/></svg></button><button id="__rst" type="button" aria-label="Reset figure"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button></div>`
    : '';

  const playCss = deferred
    ? `#__play{position:absolute;inset:0;margin:auto;width:64px;height:64px;border:0;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;background:rgba(20,20,20,.55);transition:background .15s,transform .15s}#__play:hover{background:rgba(20,20,20,.8);transform:scale(1.06)}#__play.on-dark{color:#111;background:rgba(245,245,245,.6)}#__play.on-dark:hover{background:rgba(245,245,245,.85)}`
    : '';

  const ctlCss = pausable
    ? `#__ctl{position:absolute;inset:0;pointer-events:none}#__ctl[hidden]{display:none}#__ctl button{position:absolute;pointer-events:auto;border:0;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;background:rgba(20,20,20,.55);transition:background .15s,transform .15s}#__ctl button:hover{background:rgba(20,20,20,.8)}#__resume{inset:0;margin:auto;width:64px;height:64px}#__resume:hover{transform:scale(1.06)}#__rst{left:50%;top:50%;transform:translate(-50%,42px);width:34px;height:34px}#__rst:hover{transform:translate(-50%,42px) scale(1.06)}#__ctl.on-dark button{color:#111;background:rgba(245,245,245,.6)}#__ctl.on-dark button:hover{background:rgba(245,245,245,.85)}`
    : '';

  const bgCss = bg ? `body{background:${bg}}` : themeBgCss;

  const themeSync = `let __bgSeen;addEventListener('message',function(e){if(e.data&&e.data.__sbxBg&&e.data.__sbxBg!==__bgSeen){__bgSeen=e.data.__sbxBg;${bg ? '' : `document.documentElement.style.setProperty('--sbx-bg',e.data.__sbxBg);`}report()}});`;

  const rootCss = isRoot
    ? (hover ? `#root{position:relative;width:100%;height:100%}` : `#root{position:relative;width:${w}px;height:${h}px;max-width:100%;margin-inline:auto}`)
    : '';

  const media = hover
    ? `html,body{height:100%}canvas,svg{display:block;width:100%;height:100%}`
    : `canvas,svg{display:block;max-width:100%;height:auto;margin-inline:auto}`;

  const css = `html,body{margin:0;overflow:hidden}${bgCss}${rootCss}${media}.err{color:#c0392b;white-space:pre-wrap;font:12px/1.5 ui-monospace,monospace;padding:.75rem}${playCss}${ctlCss}`;

  const loadExt = fetched.length
    ? `const __fx=[${fetched.map((u) => JSON.stringify(u)).join(',')}];` +
      `const start=()=>__fx.reduce((p,u)=>p.then(()=>fetch(u)).then(r=>{if(!r.ok)throw new Error('external-lib '+u+' failed: HTTP '+r.status);return r.text()}).then(t=>{const s=document.createElement('script');s.textContent=t;document.head.appendChild(s)}),Promise.resolve()).then(run,e=>{document.body.innerHTML='<pre class=err>'+(e&&e.stack||e)+'</pre>';report()});`
    : `const start=run;`;

  const resettable = (isCanvas || isRoot) && !hover;

  const loopDef = hover
    ? `let __fn=null,__raf=null,__el=0,__t0=null,__now=0;const __tick=(ts)=>{if(__t0==null)__t0=ts;__now=__el+(ts-__t0);__fn(__now);if(__raf!=null)__raf=requestAnimationFrame(__tick)};const loop=(fn)=>{__fn=fn;fn(0)};`
    : isManual

      ? `let __fn=null,__raf=null,__el=0,__t0=null,__now=0;const __tick=(ts)=>{if(__t0==null)__t0=ts;__now=__el+(ts-__t0);__fn(__now);if(__raf!=null)__raf=requestAnimationFrame(__tick)};const loop=(fn)=>{__fn=fn;fn(0);${resettable ? `__stop=()=>{if(__raf!=null){cancelAnimationFrame(__raf);__raf=null}};return __stop` : `return ()=>{if(__raf!=null){cancelAnimationFrame(__raf);__raf=null}}`}};`
      : pausable

        ? `let __fn=null,__raf=null,__el=0,__t0=null,__now=0;const __tick=(ts)=>{if(__t0==null)__t0=ts;__now=__el+(ts-__t0);__fn(__now);if(__raf!=null)__raf=requestAnimationFrame(__tick)};const loop=(fn)=>{if(__stop)__stop();__fn=fn;fn(0);return (__stop=()=>{if(__raf!=null){cancelAnimationFrame(__raf);__raf=null}})};`
      : resettable

        ? `const loop=(fn)=>{if(__stop)__stop();let id,live=true,t0=null;const t=(ts)=>{if(t0==null)t0=ts;fn(ts-t0);if(live)id=requestAnimationFrame(t)};id=requestAnimationFrame(t);return (__stop=()=>{live=false;cancelAnimationFrame(id)})};`
        : `const loop=(fn)=>{let id;const t=(ts)=>{fn(ts);id=requestAnimationFrame(t)};id=requestAnimationFrame(t);return ()=>cancelAnimationFrame(id)};`;

  const resetVars = resettable ? `let __stop=null,__cleanups=[];` : '';

  const resetHome = isManual
    ? `__el=0;__t0=null;__now=0;__fn=null;run()`
    : pausable

      ? `__el=0;__t0=null;__now=0;__fn=null;__ctl.hidden=true;run();` + (deferred ? `__play.style.display='flex'` : `__resumeFig()`)
      : deferred
        ? `__play.style.display='flex'`
        : `run()`;

  const resetApi = resettable
    ? `const onCleanup=(fn)=>{__cleanups.push(fn)};` +
      `const __teardown=()=>{if(__stop){__stop();__stop=null}__cleanups.forEach(function(fn){try{fn()}catch(_){}});__cleanups=[];${isCanvas ? 'canvas.width=width' : "root.innerHTML=''"}};` +
      `const reset=()=>{__teardown();${resetHome};parent.postMessage({__sandboxReset:1},'*')};`
    : hover

      ? `const onCleanup=()=>{};const reset=()=>{if(__raf!=null){cancelAnimationFrame(__raf);__raf=null}__el=0;__t0=null;__now=0;__fn=null;run()};`
      : `const onCleanup=()=>{};const reset=()=>{};`;

  const pauseControls = pausable
    ? `const __ctl=document.getElementById('__ctl');` +
      `const __ctlContrast=()=>{const c=getComputedStyle(document.body).backgroundColor.match(/[\\d.]+/g);__ctl.classList.toggle('on-dark',!!(c&&(c.length<4||+c[3]>0)&&(0.299*c[0]+0.587*c[1]+0.114*c[2])<128))};__ctlContrast();${bg ? '' : `addEventListener('message',function(e){if(e.data&&e.data.__sbxBg)requestAnimationFrame(__ctlContrast)});`}` +
      `const __pause=()=>{if(__raf!=null){cancelAnimationFrame(__raf);__raf=null;__el=__now;__ctl.hidden=false}};` +

      `const __resumeFig=()=>{__ctl.hidden=true;${deferred ? `__play.style.display='none';` : ''}if(__raf==null&&__fn){__t0=null;__raf=requestAnimationFrame(__tick)}};` +
      `canvas.addEventListener('click',()=>{if(__raf!=null)__pause();else if(__fn)__resumeFig()});` +
      `document.getElementById('__resume').addEventListener('click',e=>{e.stopPropagation();__resumeFig()});` +
      `document.getElementById('__rst').addEventListener('click',e=>{e.stopPropagation();reset()});`
    : '';

  const playSetup = `const __play=document.getElementById('__play');const __contrast=()=>{const c=getComputedStyle(document.body).backgroundColor.match(/[\\d.]+/g);__play.classList.toggle('on-dark',!!(c&&(c.length<4||+c[3]>0)&&(0.299*c[0]+0.587*c[1]+0.114*c[2])<128))};__contrast();${bg ? '' : `addEventListener('message',function(e){if(e.data&&e.data.__sbxBg)requestAnimationFrame(__contrast)});`}`;
  const tail = deferred

    ? pausable

      ? playSetup + pauseControls + `__play.addEventListener('click',()=>__resumeFig());start();report();`
      : playSetup + `__play.addEventListener('click',()=>{__play.style.display='none';start()});report();`
    : isManual

      ? `start();addEventListener('message',function(e){if(!e.data)return;if(e.data.__figpause){if(__raf!=null){cancelAnimationFrame(__raf);__raf=null;__el=__now}}else if(e.data.__figplay){if(__raf==null&&__fn){__t0=null;__raf=requestAnimationFrame(__tick)}}${resettable ? `else if(e.data.__figreset){reset()}` : ''}});`
      : hover

        ? `start();addEventListener('message',function(e){if(!__fn||!e.data)return;if(e.data.__figplay){if(__raf==null){__t0=null;__raf=requestAnimationFrame(__tick)}}else if('__figplay' in e.data){reset()}});`

        : pauseControls + `start();` + (pausable ? `__resumeFig();` : ``);
  const script =
    VIS_GATE +
    setup +
    resetVars +
    loopDef +
    resetApi +
    `const report=()=>parent.postMessage({__sandboxHeight:document.body.scrollHeight},'*');` +
    `new ResizeObserver(report).observe(document.documentElement);` +
    themeSync +

    `const showErr=(m)=>{document.body.innerHTML='<pre class=err>'+m+'</pre>';report()};` +
    `addEventListener('error',e=>showErr((e.error&&e.error.stack)||e.message));` +
    `addEventListener('unhandledrejection',e=>showErr((e.reason&&e.reason.stack)||e.reason));` +
    `const run=()=>{try{\n${prelude}\n${code}\n}catch(e){showErr(e&&e.stack||e);return}report()};` +
    loadExt +
    tail;

  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${surface}${playBtn}${ctlOverlay}${ext}<script>${script}</script></body></html>`;
}

export function findSandboxBlocks(src) {
  const text = src || '';
  const lines = text.split('\n');

  const starts = [];
  for (let p = 0, k = 0; k < lines.length; k++) { starts.push(p); p += lines[k].length + 1; }

  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const open = /^\s*(`{3,}|~{3,})\s*([^\s]+)?\s*(.*)$/.exec(lines[i]);
    if (!open) continue;
    const fence = open[1][0];
    const spec = parseMeta(open[2] || '', open[3] || '');

    const body = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      if (new RegExp(`^\\s*\\${fence}{3,}\\s*$`).test(lines[j])) break;
      body.push(lines[j]);
    }
    const closed = j < lines.length;
    if (spec) {
      const endLine = closed ? j : lines.length - 1;
      const to = Math.min(text.length, starts[endLine] + lines[endLine].length);
      blocks.push({ ...spec, code: body.join('\n'), from: starts[i], to, closed });
    }
    i = j;
  }
  return blocks;
}
