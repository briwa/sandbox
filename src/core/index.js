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

// Who drives playback. The last two hand that job to the host page: `manual` waits for
// play/pause/reset messages, `hover` runs only while the host says the pointer is on it.
export const CONTROL_MODES = ['pausable', 'auto', 'none', 'manual', 'hover'];
export { DEFAULT_W, DEFAULT_H };

export function specToToolbar(spec = {}) {
  return {
    type: spec.lang === 'vue' ? 'vue' : (spec.preset || 'canvas'),
    w: spec.w || DEFAULT_W,
    h: spec.h || DEFAULT_H,
    bg: spec.bg || '',
    showCode: Boolean(spec.showCode),
    control: spec.control || 'pausable',
    preview: Boolean(spec.preview),
    label: spec.label || '',
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

// A URL already says what it is: prefer the `name@version` path segment npm CDNs
// put in front of the build, and fall back to the bare filename.
export function externalName(url) {
  let parts;
  try {
    parts = new URL(url).pathname.split('/').filter(Boolean);
  } catch {
    return url;
  }
  const at = parts.findIndex((p) => !p.startsWith('@') && /@[\w.-]+$/.test(p));
  if (at >= 0) {
    const scope = parts[at - 1];
    return scope && scope.startsWith('@') ? `${scope}/${parts[at]}` : parts[at];
  }
  const file = parts[parts.length - 1] || '';
  return file.replace(/\.min\.js$/i, '').replace(/\.js$/i, '') || url;
}

export function externalLabel(code) {
  const urls = (code || '').split(/\s+/).filter(Boolean);
  if (!urls.length) return 'external library';
  const first = externalName(urls[0]);
  return urls.length > 1 ? `${first} +${urls.length - 1}` : first;
}

const detailOf = (label, ...parts) => parts.filter((p) => p && p !== label).join(' · ');

export function describeSandboxBlock(spec = {}) {
  const named = firstDeclaration(spec.code);

  if (spec.kind === 'external') {
    const label = externalLabel(spec.code);
    return { kind: 'external', label, detail: detailOf(label, 'external library') };
  }
  if (spec.kind === 'source') {
    if (spec.lang === 'vue') {
      const label = spec.componentName || spec.label || 'vue component';
      return { kind: 'vue', label, detail: detailOf(label, 'vue component') };
    }
    const label = spec.label || named || 'shared source';
    return { kind: 'source', label, detail: detailOf(label, 'shared source') };
  }

  const type = spec.lang === 'vue' ? 'vue' : spec.preset || 'canvas';
  const size = `${type} ${spec.w || DEFAULT_W}×${spec.h || DEFAULT_H}`;
  const label = spec.label || named || size;
  return { kind: 'figure', label, detail: detailOf(label, size) };
}

const metaValue = (v) => (/[\s"]/.test(v) ? `"${escapeAttr(v)}"` : v);

export function serializeSandboxMeta({ kind = 'figure', type, w, h, bg, showCode, control, preview, label, componentName }) {
  if (kind === 'external') return { lang: 'sandbox=external', meta: '' };

  const isVue = type === 'vue';
  const lang = isVue ? 'sandbox=vue' : 'sandbox=js';

  if (kind === 'source') {
    const name = isVue ? componentName || label : label;
    return { lang, meta: name ? `label=${metaValue(name)}` : '' };
  }

  const tokens = [isVue || !type || type === 'canvas' ? 'viz' : `viz=${type}`];
  if (w && h && !(Number(w) === DEFAULT_W && Number(h) === DEFAULT_H)) tokens.push(`${w}x${h}`);
  if (bg) tokens.push(`bg=${metaValue(bg)}`);
  if (showCode) tokens.push('code');
  if (control && control !== 'pausable' && !isVue) tokens.push(`control=${control}`);
  if (preview) tokens.push('preview');
  if (label) tokens.push(`label=${metaValue(label)}`);
  return { lang, meta: tokens.join(' ') };
}

export function buildSandboxFence(state, code) {
  const { lang, meta } = serializeSandboxMeta(state);
  const head = meta ? `${lang} ${meta}` : lang;
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

const META_TOKEN = /([\w-]+)=(?:"([^"]*)"|([^\s"]*))|(\S+)/g;

function tokenizeMeta(meta) {
  const flags = new Set();
  const values = {};
  for (const m of (meta || '').matchAll(META_TOKEN)) {
    if (m[4] !== undefined) flags.add(m[4]);
    else values[m[1]] = (m[2] !== undefined ? unescapeAttr(m[2]) : m[3]).trim();
  }
  return { flags, values, has: (k) => flags.has(k) || k in values };
}

// ```sandbox=js              shared source, pooled into every figure in the document
// ```sandbox=js viz           a figure — `viz=svg` / `viz=root` pick the surface
// ```sandbox=vue label=Name   a component every vue figure can render
// ```sandbox=external         https .js URLs, one per line
// Anything else — plain ```js, ```vue — is an ordinary code block we never touch.
export function parseMeta(lang, meta) {
  const dialect = /^sandbox=(js|vue|external)$/.exec((lang || '').trim())?.[1];
  if (!dialect) return null;
  if (dialect === 'external') return { kind: 'external', lang: 'external' };

  const { flags, values, has } = tokenizeMeta(meta);
  const label = values.label || '';
  const isVue = dialect === 'vue';

  if (!has('viz')) {
    if (!isVue) return { kind: 'source', lang: 'js', label };
    // A Vue SFC carries no name of its own, so `label` doubles as the tag to register under.
    const componentName = /^[A-Z][\w-]*$/.test(label) ? label : '';
    return { kind: 'source', lang: 'vue', componentName, label };
  }

  const size = [...flags].find((t) => /^\d+x\d+$/.test(t));
  const [w, h] = size ? size.split('x').map(Number) : [DEFAULT_W, DEFAULT_H];
  const bg = /^[#\w(),.%\s-]+$/.test(values.bg || '') ? values.bg : '';
  const showCode = flags.has('code');
  const preview = flags.has('preview');

  if (isVue) return { kind: 'figure', lang: 'vue', preset: 'root', w, h, showCode, bg, label, preview };

  const preset = PRESETS.has(values.viz) ? values.viz : 'canvas';
  let control = values.control || (flags.has('auto') ? 'auto' : 'pausable');
  if (!CONTROL_MODES.includes(control)) control = 'pausable';

  return { kind: 'figure', lang: 'js', preset, w, h, showCode, bg, control, label, preview };
}

export function sandboxPrelude(blocks) {
  return (blocks || [])
    .filter((b) => b.kind === 'source' && b.lang === 'js')
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

export function sandboxExternals(blocks) {
  return (blocks || [])
    .filter((b) => b.kind === 'external')
    .flatMap((b) => (b.code || '').split(/\s+/))
    .map(safeUrl)
    .filter(Boolean);
}

export function sandboxVueComponents(blocks) {
  return (blocks || [])
    .filter((b) => b.kind === 'source' && b.lang === 'vue' && b.componentName)
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
        `const __loadExt=async()=>{for(const u of __fx){const r=await fetch(u);if(!r.ok)throw new Error('external '+u+' failed: HTTP '+r.status);const s=document.createElement('script');s.textContent=await r.text();document.head.appendChild(s)}};`
      : `const __loadExt=async()=>{};`) +
    `(async()=>{try{await __loadExt();const app=Vue.createApp(await loadModule('/__main__.vue',opts));${regs}app.mount(root)}catch(e){document.body.innerHTML='<pre class=err>'+(e&&e.stack||e)+'</pre>'}report()})();`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="root"></div>${ext}<script src="${VUE_SRC}"></script><script src="${SFC_LOADER_SRC}"></script><script>${script}</script></body></html>`;
}

export function buildSrcdoc({ preset, w, h, bg, hover, control }, code, prelude = '', externals = []) {
  const isCanvas = preset === 'canvas';

  const isRoot = preset === 'root';
  const mode = control || 'pausable';
  const isManual = mode === 'manual';
  const isHover = Boolean(hover) || mode === 'hover';

  const pausable = isCanvas && (mode === 'pausable' || mode === 'auto') && !isHover;
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

  const deferred = (isCanvas || isRoot) && mode === 'pausable' && !isHover;
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
    ? (isHover ? `#root{position:relative;width:100%;height:100%}` : `#root{position:relative;width:${w}px;height:${h}px;max-width:100%;margin-inline:auto}`)
    : '';

  const media = isHover
    ? `html,body{height:100%}canvas,svg{display:block;width:100%;height:100%}`
    : `canvas,svg{display:block;max-width:100%;height:auto;margin-inline:auto}`;

  const css = `html,body{margin:0;overflow:hidden}${bgCss}${rootCss}${media}.err{color:#c0392b;white-space:pre-wrap;font:12px/1.5 ui-monospace,monospace;padding:.75rem}${playCss}${ctlCss}`;

  const loadExt = fetched.length
    ? `const __fx=[${fetched.map((u) => JSON.stringify(u)).join(',')}];` +
      `const start=()=>__fx.reduce((p,u)=>p.then(()=>fetch(u)).then(r=>{if(!r.ok)throw new Error('external '+u+' failed: HTTP '+r.status);return r.text()}).then(t=>{const s=document.createElement('script');s.textContent=t;document.head.appendChild(s)}),Promise.resolve()).then(run,e=>{document.body.innerHTML='<pre class=err>'+(e&&e.stack||e)+'</pre>';report()});`
    : `const start=run;`;

  const resettable = (isCanvas || isRoot) && !isHover;

  const loopDef = isHover
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
    : isHover

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
      : isHover

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
