export * from './protocol.js';
export * from './icons.js';

const PRESETS = new Set(['canvas', 'root']);
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

const CONSOLE_HOOK =
  `(()=>{const __c=window.console,__q=[];let __qd=false;` +
  `const __flush=()=>{__qd=false;if(__q.length)parent.postMessage({__sandboxConsole:__q.splice(0)},'*')};` +
  `window.__sbxFlushConsole=__flush;` +
  `const __str=(v,d,seen)=>{const t=typeof v;` +
    `if(t==='string')return d?JSON.stringify(v):v;` +
    `if(t==='function')return 'ƒ '+(v.name||'anonymous')+'()';` +
    `if(t==='symbol'||t==='bigint'||v==null||t!=='object')return String(v)+(t==='bigint'?'n':'');` +
    `if(v instanceof Error)return v.stack||String(v);` +
    `if(typeof Node!=='undefined'&&v instanceof Node)return v.nodeType===1?'<'+v.tagName.toLowerCase()+(v.id?'#'+v.id:'')+'>':v.nodeName;` +
    `if(seen.has(v))return '[Circular]';if(d>2)return Array.isArray(v)?'[…]':'{…}';seen.add(v);` +
    `try{if(Array.isArray(v)||ArrayBuffer.isView(v)){const a=Array.from(v.length>100?Array.prototype.slice.call(v,0,100):v,x=>__str(x,d+1,seen));if(v.length>100)a.push('… '+(v.length-100)+' more');return (Array.isArray(v)?'':v.constructor.name+' ')+'['+a.join(', ')+']'}` +
    `if(v instanceof Map)return 'Map('+v.size+') {'+Array.from(v,([k,x])=>__str(k,d+1,seen)+' => '+__str(x,d+1,seen)).join(', ')+'}';` +
    `if(v instanceof Set)return 'Set('+v.size+') {'+Array.from(v,x=>__str(x,d+1,seen)).join(', ')+'}';` +
    `if(v instanceof Date)return v.toISOString();if(v instanceof RegExp)return String(v);` +
    `const ks=Object.keys(v),n=v.constructor&&v.constructor!==Object?v.constructor.name+' ':'';` +
    `return n+'{'+ks.slice(0,50).map(k=>(/^[A-Za-z_$][\\w$]*$/.test(k)?k:JSON.stringify(k))+': '+__str(v[k],d+1,seen)).concat(ks.length>50?['…']:[]).join(', ')+'}'}` +
    `finally{seen.delete(v)}};` +
  `const __push=(level,args)=>{let text=Array.from(args,a=>{try{return __str(a,0,new Set())}catch(_){return String(a)}}).join(' ');` +
    `if(text.length>4000)text=text.slice(0,4000)+'…';__q.push({level,text});if(!__qd){__qd=true;queueMicrotask(__flush)}};` +
  `Object.keys(__c).forEach(level=>{const orig=__c[level];if(typeof orig!=='function'||level==='clear')return;` +
    `__c[level]=function(){if(level==='assert'){if(arguments[0])return;__push(level,Array.prototype.slice.call(arguments,1))}else __push(level,arguments);return orig.apply(__c,arguments)}});` +
  `const __clear=__c.clear;__c.clear=function(){__q.length=0;__push('clear',[]);return __clear&&__clear.apply(__c,arguments)};` +
  `})();`;

const consoleScript = (on) => (on ? `<script>${CONSOLE_HOOK}</script>` : '');

// `knob(value, opts)` marks a value the reader can change from the figure's settings panel.
// `const speed = knob(10)` is keyed by its variable name — the frame is handed the code with
// that name spliced in, so the call itself stays short. A knob's shape is read off its default
// (a number, a boolean, a `#hex` colour, an `{ r, g, b }` colour, a string, or one of `opts.options`)
// unless `opts.type` says otherwise; `min`/`max` turn a number into a slider — or, given as
// `{ r, g, b }`, an rgb colour into a slider between them — and `label` renames it on the panel.
// Changing one re-runs the figure with the new value, keeping its clock and playback state.
const KNOB_DECL = /\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*knob\s*\(/g;
export const nameKnobs = (code) => String(code == null ? '' : code).replace(KNOB_DECL, '$1 $2 = __knob("$2",');

// `values` seeds the knobs before the first run — how the editor keeps what was dialled in
// across preview rebuilds. A value that no longer fits its knob's type falls back to the default.
const knobRuntime = (values) =>
  `let __ran=false,__knobVals=${JSON.stringify(values || {})},__knobDefs=[],__knobN=0,__knobSent=false,__rrq=false;` +
  `const __isRgb=c=>c!=null&&typeof c==='object'&&['r','g','b'].every(k=>typeof c[k]==='number');` +
  `const __knobType=(v,o)=>o.type||(typeof v==='boolean'?'boolean':typeof v==='number'?'number':__isRgb(v)?'rgb':Array.isArray(o.options)?'select':/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)?'color':'string');` +
  `const __knob=(key,value,opts)=>{opts=opts||{};if(key==null)key=opts.label||'knob '+(++__knobN);` +
    `const type=__knobType(value,opts),options=Array.isArray(opts.options)?opts.options.filter(x=>typeof x==='string'||typeof x==='number'):undefined;` +
    `let cur=key in __knobVals?__knobVals[key]:value;` +
    `if(type==='number'&&typeof cur!=='number'||type==='boolean'&&typeof cur!=='boolean'||type==='select'&&!(options||[]).includes(cur)||(type==='string'||type==='color')&&typeof cur!=='string'||type==='rgb'&&!__isRgb(cur))cur=value;` +
    `__knobDefs.push({key,label:String(opts.label||key),type,value,cur,min:opts.min,max:opts.max,step:opts.step,options});return cur};` +
  `const knob=(value,opts)=>__knob(null,value,opts);window.knob=knob;window.__knob=__knob;` +
  `const __knobReport=()=>{if(!__knobDefs.length&&!__knobSent)return;__knobSent=true;parent.postMessage({__sandboxKnobs:__knobDefs},'*')};` +
  `const __rerunSoon=()=>{if(__rrq)return;__rrq=true;requestAnimationFrame(()=>{__rrq=false;__rerun()})};` +
  `addEventListener('message',e=>{const k=e.data&&e.data.__sbxKnob;if(!k)return;if(k.reset)__knobVals={};else __knobVals[k.key]=k.value;__rerunSoon()});` +
  `addEventListener('pointerdown',()=>parent.postMessage({__sbxPress:true},'*'),true);`;

// Answers the page's hello with every report the frame has made so far. `report` and the error
// each builder defines are looked up when the hello comes, so the order they are declared in is free.
const HELLO =
  `addEventListener('message',e=>{if(!e.data||!e.data.__sbxHello)return;report();if(!window.__sbxDead)__knobReport();if(window.__sbxErr)parent.postMessage({__sandboxError:window.__sbxErr},'*')});`;

// Who drives playback. The last two hand that job to the host page: `manual` waits for
// play/pause/reset messages, `hover` runs only while the host says the pointer is on it.
export const CONTROL_MODES = ['default', 'autoplay', 'none', 'manual', 'hover'];
export const normalizeControl = (c) => (CONTROL_MODES.includes(c) ? c : 'default');
export { DEFAULT_W, DEFAULT_H };

// The two axes an author actually picks: the language, and whether it is visualized.
// `viz: ''` is a shared-source block; anything else is a figure on that surface.
export function specToToolbar(spec = {}) {
  return {
    lang: spec.lang || 'js',
    viz: spec.kind === 'figure' ? spec.preset || 'canvas' : '',
    w: spec.w || DEFAULT_W,
    h: spec.h || DEFAULT_H,
    bg: spec.bg || '',
    showCode: Boolean(spec.showCode),
    open: Boolean(spec.open),
    control: normalizeControl(spec.control),
    idle: spec.idle || 0,
    meta: spec.meta || '',
    label: spec.label || '',
  };
}

// The surfaces a figure can draw on.
export const VIZ_SURFACES = ['canvas', 'root'];

// The toolbar state a fresh block opens with: a shared js block, sized like a figure would
// be. Pass whatever should differ — `{ viz: 'canvas', w: 800, h: 400 }` opens on a canvas
// of that size — and the rest fills in, so a host never has to spell out the whole shape.
export function defaultToolbar(overrides = {}) {
  const state = {
    lang: 'js',
    viz: '',
    w: DEFAULT_W,
    h: DEFAULT_H,
    bg: '',
    showCode: false,
    open: false,
    control: 'default',
    idle: 0,
    meta: '',
    label: '',
    code: '',
    ...overrides,
  };
  // `viz: true` is the shorthand for "visualize it", on the first surface.
  if (state.viz === true || (state.viz && !VIZ_SURFACES.includes(state.viz))) state.viz = VIZ_SURFACES[0];
  return state;
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
    const label = spec.label || externalLabel(spec.code);
    return { kind: 'external', label, detail: detailOf(label, 'external library') };
  }
  if (spec.kind === 'source') {
    const label = spec.label || named || 'shared source';
    return { kind: 'source', label, detail: detailOf(label, 'shared source') };
  }

  const type = spec.preset || 'canvas';
  const size = `${type} ${spec.w || DEFAULT_W}×${spec.h || DEFAULT_H}`;
  const label = spec.label || named || size;
  return { kind: 'figure', label, detail: detailOf(label, size) };
}

const metaValue = (v) => (/[\s"]/.test(v) ? `"${escapeAttr(v)}"` : v);

export function serializeSandboxMeta({ kind = 'figure', lang: language, type, w, h, bg, showCode, open, control, idle, meta, label }) {
  if (kind === 'external') return { lang: language || 'text', meta: ['sandbox=external', label && `label=${metaValue(label)}`].filter(Boolean).join(' ') };

  const lang = language || 'js';

  if (kind === 'source') {
    const tokens = ['sandbox', open && 'open', label && `label=${metaValue(label)}`].filter(Boolean);
    return { lang, meta: tokens.join(' ') };
  }

  const tokens = [`sandbox=${VIZ_SURFACES.includes(type) ? type : 'canvas'}`];
  if (w && h && !(Number(w) === DEFAULT_W && Number(h) === DEFAULT_H)) tokens.push(`${w}x${h}`);
  if (bg) tokens.push(`bg=${metaValue(bg)}`);
  if (open) tokens.push('open');
  else if (showCode) tokens.push('code');
  if (control && control !== 'default') tokens.push(`control=${control}`);
  if (idle) tokens.push(`idle=${Math.max(0, Number(idle) || 0)}`);
  if (meta) tokens.push(`meta=${metaValue(meta)}`);
  if (label) tokens.push(`label=${metaValue(label)}`);
  return { lang, meta: tokens.join(' ') };
}

export function buildSandboxFence(state, code) {
  const { lang, meta } = serializeSandboxMeta(state);
  const head = meta ? `${lang} ${meta}` : lang;
  return '```' + head + '\n' + (code || '') + '\n```';
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

// ```js sandbox                shared source, pooled into every figure in the document
// ```js sandbox=canvas         a figure — `sandbox=root` swaps the canvas for a div
// ```vue sandbox=root          the fence's language only picks the highlighting; the code runs as JS
// ```js sandbox=canvas idle=2000  a figure that sits at 2s in until it is played
// ```js sandbox=canvas open    a figure that starts on its code — `open` also unfolds a shared source
// ```text sandbox=external     https .js URLs, one per line — `label=Name` overrides the derived name
// Anything else — plain ```js, ```vue — is an ordinary code block we never touch.
const ROLES = new Set(['source', 'external', ...PRESETS]);

export function parseMeta(lang, meta) {
  let fence = (lang || '').trim();
  let info = meta || '';
  // A fence with no language in front: the sandbox token is all there is, and it runs as js.
  if (/^sandbox(=|$)/.test(fence)) {
    info = `${fence} ${info}`;
    fence = '';
  }

  const { flags, values, has } = tokenizeMeta(info);
  if (!has('sandbox')) return null;
  const role = values.sandbox || 'source';
  if (!ROLES.has(role)) return null;

  const label = values.label || '';
  // A CDN URL usually names itself, but a raw gist is a hash: `label` is the way out.
  if (role === 'external') return { kind: 'external', lang: fence || 'text', label };

  const language = fence.toLowerCase() || 'js';
  const open = flags.has('open');

  if (role === 'source') return { kind: 'source', lang: language, label, open };

  const size = [...flags].find((t) => /^\d+x\d+$/.test(t));
  const [w, h] = size ? size.split('x').map(Number) : [DEFAULT_W, DEFAULT_H];
  const bg = /^[#\w(),.%\s-]+$/.test(values.bg || '') ? values.bg : '';
  const showCode = open || flags.has('code');
  const metaText = values.meta || '';

  const preset = role;
  const control = normalizeControl(values.control);
  const idle = Math.max(0, Number(values.idle) || 0);

  return { kind: 'figure', lang: language, preset, w, h, showCode, open, bg, control, idle, label, meta: metaText };
}

// The shared js blocks in page order, each with the name the page shows it under, so an
// error thrown inside the prelude can be pinned to a block instead of "somewhere shared".
export function sandboxPreludeBlocks(blocks) {
  const shared = (blocks || []).filter((b) => b.kind === 'source');
  return shared.map((b, i) => {
    const { label } = describeSandboxBlock(b);
    return {
      label: label === 'shared source' && shared.length > 1 ? `shared source #${i + 1}` : label,
      code: b.code || '',
    };
  });
}

export function sandboxPrelude(blocks) {
  return sandboxPreludeBlocks(blocks).map((b) => b.code).join('\n\n');
}

// Chrome puts `Name: message` on the first line of a stack; Safari's stack is frames only,
// so the message has to be put back in front or the reader sees nothing but `run@`.
const FMT_ERR =
  `const __fmt=(e)=>{if(!e||typeof e!=='object')return String(e);` +
  `const s=e.stack?String(e.stack):'',m=e.message==null?'':String(e.message);` +
  `return m&&s.indexOf(m)<0?(e.name||'Error')+': '+m+(s?'\\n'+s:''):s||String(e)};` +
  `const __esc=(s)=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');`;

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

// `prelude` is the array `sandboxPreludeBlocks` gives, or a plain string for callers that
// pooled the source themselves; the string form loses the per-block names in errors.
export function buildSrcdoc({ preset, w, h, bg, hover, control, idle, console: captureConsole, knobs }, code, prelude = '', externals = []) {
  const isCanvas = preset === 'canvas';
  const preludeBlocks = Array.isArray(prelude)
    ? prelude
    : prelude ? [{ label: 'shared source', code: String(prelude) }] : [];
  const preludeCode = preludeBlocks.map((b) => b.code).join('\n\n');
  // Where each block sits in the joined prelude, as 1-based line ranges.
  let preludeAt = 1;
  const preludeMap = preludeBlocks.map((b) => {
    const n = b.code.split('\n').length;
    const row = [b.label, preludeAt, preludeAt + n - 1];
    preludeAt += n + 1;
    return row;
  });
  const preludeJson = JSON.stringify(preludeMap).replace(/<\//g, '<\\/');

  const isRoot = preset === 'root';
  const mode = normalizeControl(control);
  const isManual = mode === 'manual';
  const isHover = Boolean(hover) || mode === 'hover';
  const idleT = Math.max(0, Number(idle) || 0);
  // The frame a fresh `loop` draws first: the idle frame while parked there, otherwise the
  // clock as it stands — zero on a first run, and wherever it got to when a knob re-runs it.
  const startT = idleT ? `__idle?${idleT}:__now` : '__now';
  const idleVar = idleT ? ',__idle=true' : '';
  const body = nameKnobs(code);
  const pre = nameKnobs(preludeCode);
  const idleHome = idleT ? '__idle=true;' : '';
  const leaveIdle = (teardown) =>
    idleT ? `const __leaveIdle=()=>{if(__idle){__idle=false;${teardown}run()}};` : `const __leaveIdle=()=>{};`;

  const canPause = isCanvas && (mode === 'default' || mode === 'autoplay') && !isHover;
  const surface = isCanvas
    ? '<canvas></canvas>'
    : '<div id="root"></div>';
  const setup = isCanvas
    ? `const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d'),width=canvas.width=${w},height=canvas.height=${h};`
    : `const root=document.querySelector('#root'),width=${w},height=${h};`;

  const fetched = (externals || []).filter(isRawGistUrl);
  const ext = (externals || [])
    .filter((u) => !isRawGistUrl(u))
    .map((u) => `<script src="${u}"></script>`)
    .join('');

  const deferred = mode === 'default' && !isHover;
  const playBtn = deferred
    ? `<button id="__play" type="button" aria-label="Run figure"><svg viewBox="0 0 100 100" width="30" height="30" aria-hidden="true"><polygon points="38,28 38,72 74,50" fill="currentColor"/></svg></button>`
    : '';

  const ctlOverlay = canPause
    ? `<div id="__ctl" hidden><button id="__resume" type="button" aria-label="Resume figure"><svg viewBox="0 0 100 100" width="30" height="30" aria-hidden="true"><polygon points="38,28 38,72 74,50" fill="currentColor"/></svg></button><button id="__rst" type="button" aria-label="Reset figure"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button></div>`
    : '';

  const playCss = deferred
    ? `#__play{position:absolute;inset:0;margin:auto;width:64px;height:64px;border:0;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;background:rgba(20,20,20,.55);transition:background .15s,transform .15s}#__play:hover{background:rgba(20,20,20,.8);transform:scale(1.06)}#__play.on-dark{color:#111;background:rgba(245,245,245,.6)}#__play.on-dark:hover{background:rgba(245,245,245,.85)}`
    : '';

  const ctlCss = canPause
    ? `#__ctl{position:absolute;inset:0;pointer-events:none}#__ctl[hidden]{display:none}#__ctl button{position:absolute;pointer-events:auto;border:0;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;background:rgba(20,20,20,.55);transition:background .15s,transform .15s}#__ctl button:hover{background:rgba(20,20,20,.8)}#__resume{inset:0;margin:auto;width:64px;height:64px}#__resume:hover{transform:scale(1.06)}#__rst{left:50%;top:50%;transform:translate(-50%,42px);width:34px;height:34px}#__rst:hover{transform:translate(-50%,42px) scale(1.06)}#__ctl.on-dark button{color:#111;background:rgba(245,245,245,.6)}#__ctl.on-dark button:hover{background:rgba(245,245,245,.85)}`
    : '';

  const bgCss = bg ? `body{background:${bg}}` : themeBgCss;

  const themeSync = `let __bgSeen;addEventListener('message',function(e){if(e.data&&e.data.__sbxBg&&e.data.__sbxBg!==__bgSeen){__bgSeen=e.data.__sbxBg;${bg ? '' : `document.documentElement.style.setProperty('--sbx-bg',e.data.__sbxBg);`}report()}});`;

  const rootCss = isRoot
    ? (isHover ? `#root{position:relative;width:100%;height:100%}` : `#root{position:relative;width:${w}px;height:${h}px;max-width:100%;margin-inline:auto}`)
    : '';

  const media = isHover
    ? `html,body{height:100%}canvas{display:block;width:100%;height:100%}`
    : `canvas{display:block;max-width:100%;height:auto;margin-inline:auto}`;

  const css = `html,body{margin:0;overflow:hidden}${bgCss}${rootCss}${media}.err{color:#c0392b;white-space:pre-wrap;font:12px/1.5 ui-monospace,monospace;padding:.75rem}.err a{color:inherit;text-decoration:underline}${playCss}${ctlCss}`;

  const loadExt = fetched.length
    ? `const __fx=[${fetched.map((u) => JSON.stringify(u)).join(',')}];` +
      `const start=()=>__fx.reduce((p,u)=>p.then(()=>fetch(u)).then(r=>{if(!r.ok)throw new Error('external '+u+' failed: HTTP '+r.status);return r.text()}).then(t=>{const s=document.createElement('script');s.textContent=t;document.head.appendChild(s)}),Promise.resolve()).then(run,e=>{document.body.innerHTML='<pre class=err>'+(e&&e.stack||e)+'</pre>';report()});`
    : `const start=run;`;

  // Everything but a hover figure can be torn down and run again: that is what reset, and a
  // knob change, do. A root has no loop to stop, but what it drew still has to be cleared.
  const resettable = !isHover;
  const clearSurface = isCanvas ? 'canvas.width=width' : "root.innerHTML=''";
  // The loops that keep their own clock, so a re-run can pick up where they were.
  const timed = canPause || isManual;

  const loopDef = isHover
    ? `let __fn=null,__raf=null,__el=0,__t0=null,__now=0${idleVar};const __tick=(ts)=>{if(__t0==null)__t0=ts;__now=__el+(ts-__t0);__fn(__now);if(__raf!=null)__raf=requestAnimationFrame(__tick)};const loop=(fn)=>{__fn=fn;fn(${startT})};`
    : isManual

      ? `let __fn=null,__raf=null,__el=0,__t0=null,__now=0${idleVar};const __tick=(ts)=>{if(__t0==null)__t0=ts;__now=__el+(ts-__t0);__fn(__now);if(__raf!=null)__raf=requestAnimationFrame(__tick)};const loop=(fn)=>{__fn=fn;fn(${startT});__stop=()=>{if(__raf!=null){cancelAnimationFrame(__raf);__raf=null}};return __stop};`
      : canPause

        ? `let __fn=null,__raf=null,__el=0,__t0=null,__now=0${idleVar};const __tick=(ts)=>{if(__t0==null)__t0=ts;__now=__el+(ts-__t0);__fn(__now);if(__raf!=null)__raf=requestAnimationFrame(__tick)};const loop=(fn)=>{if(__stop)__stop();__fn=fn;fn(${startT});return (__stop=()=>{if(__raf!=null){cancelAnimationFrame(__raf);__raf=null}})};`
        : `const loop=(fn)=>{if(__stop)__stop();let id,live=true,t0=null;const t=(ts)=>{if(t0==null)t0=ts;fn(ts-t0);if(live)id=requestAnimationFrame(t)};id=requestAnimationFrame(t);return (__stop=()=>{live=false;cancelAnimationFrame(id)})};`;

  const resetVars = resettable ? `let __stop=null,__cleanups=[];` : '';

  const resetHome = isManual
    ? `${idleHome}__el=0;__t0=null;__now=0;__fn=null;run()`
    : canPause

      ? `${idleHome}__el=0;__t0=null;__now=0;__fn=null;__ctl.hidden=true;run();` + (deferred ? `__play.style.display='flex'` : `__resumeFig()`)
      : deferred
        ? `__play.style.display='flex'`
        : `run()`;

  const resetApi = resettable
    ? `const onCleanup=(fn)=>{__cleanups.push(fn)};` +
      `const __teardown=()=>{if(__stop){__stop();__stop=null}__cleanups.forEach(function(fn){try{fn()}catch(_){}});__cleanups=[];${clearSurface}};` +
      `const reset=()=>{__teardown();${resetHome};parent.postMessage({__sandboxReset:1},'*')};` +
      leaveIdle('__teardown();')
    : `const onCleanup=()=>{};const reset=()=>{if(__raf!=null){cancelAnimationFrame(__raf);__raf=null}${idleHome}__el=0;__t0=null;__now=0;__fn=null;run()};` +
      leaveIdle('');

  // A knob change runs the code again in place. Unlike reset it keeps the clock and whether
  // the figure was going, so dragging a slider tunes the animation instead of restarting it.
  // Nothing to re-run until the first run has happened, or once an error has replaced the page.
  const rerun = resettable
    ? `const __rerun=()=>{if(!__ran||window.__sbxDead)return;${timed ? 'const on=__raf!=null;if(on)__el=__now;' : ''}__teardown();${timed ? '__fn=null;' : ''}run();${timed ? 'if(on&&__fn&&__raf==null){__t0=null;__raf=requestAnimationFrame(__tick)}' : ''}};`
    : `const __rerun=()=>{if(!__ran||window.__sbxDead)return;const on=__raf!=null;if(on){cancelAnimationFrame(__raf);__raf=null;__el=__now}__fn=null;${clearSurface};run();if(on&&__fn){__t0=null;__raf=requestAnimationFrame(__tick)}};`;

  const pauseControls = canPause
    ? `const __ctl=document.getElementById('__ctl');` +
      `const __ctlContrast=()=>{const c=getComputedStyle(document.body).backgroundColor.match(/[\\d.]+/g);__ctl.classList.toggle('on-dark',!!(c&&(c.length<4||+c[3]>0)&&(0.299*c[0]+0.587*c[1]+0.114*c[2])<128))};__ctlContrast();${bg ? '' : `addEventListener('message',function(e){if(e.data&&e.data.__sbxBg)requestAnimationFrame(__ctlContrast)});`}` +
      `const __pause=()=>{if(__raf!=null){cancelAnimationFrame(__raf);__raf=null;__el=__now;__ctl.hidden=false}};` +

      `const __resumeFig=()=>{__ctl.hidden=true;${deferred ? `__play.style.display='none';` : ''}__leaveIdle();if(__raf==null&&__fn){__t0=null;__raf=requestAnimationFrame(__tick)}};` +
      `canvas.addEventListener('click',()=>{if(__raf!=null)__pause();else if(__fn)__resumeFig()});` +
      `document.getElementById('__resume').addEventListener('click',e=>{e.stopPropagation();__resumeFig()});` +
      `document.getElementById('__rst').addEventListener('click',e=>{e.stopPropagation();reset()});`
    : '';

  const playSetup = `const __play=document.getElementById('__play');const __contrast=()=>{const c=getComputedStyle(document.body).backgroundColor.match(/[\\d.]+/g);__play.classList.toggle('on-dark',!!(c&&(c.length<4||+c[3]>0)&&(0.299*c[0]+0.587*c[1]+0.114*c[2])<128))};__contrast();${bg ? '' : `addEventListener('message',function(e){if(e.data&&e.data.__sbxBg)requestAnimationFrame(__contrast)});`}`;
  const tail = deferred

    ? canPause

      ? playSetup + pauseControls + `__play.addEventListener('click',()=>__resumeFig());start();report();`
      : playSetup + `__play.addEventListener('click',()=>{__play.style.display='none';start()});report();`
    : isManual

      ? `start();addEventListener('message',function(e){if(!e.data)return;if(e.data.__figpause){if(__raf!=null){cancelAnimationFrame(__raf);__raf=null;__el=__now}}else if(e.data.__figplay){if(__raf==null&&__fn){__leaveIdle();__t0=null;__raf=requestAnimationFrame(__tick)}}else if(e.data.__figreset){reset()}});`
      : isHover

        ? `start();addEventListener('message',function(e){if(!__fn||!e.data)return;if(e.data.__figplay){if(__raf==null){__leaveIdle();__t0=null;__raf=requestAnimationFrame(__tick)}}else if('__figplay' in e.data){reset()}});`

        : pauseControls + `start();` + (canPause ? `__resumeFig();` : ``);
  // Everything the srcdoc puts above the user's code is emitted on one line, so a line
  // number reported from inside the frame maps back to an editor line by subtracting this
  // base. Prelude lines land at zero or below, which the host reads as "thrown in a shared
  // source, not in this block".
  const lineBase = 1 + pre.split('\n').length;

  // A prelude line maps back to a block and a line inside it through `__pre`.
  const errorReporting =
    `const report=()=>parent.postMessage({__sandboxHeight:document.body.scrollHeight},'*');` +
    `const __base=${lineBase};const __pre=${preludeJson};` +
    FMT_ERR +
    `const __own=(f)=>!/^(https?|blob):/.test(f||'');` +
    `const __pick=(s)=>{const hits=String(s||'').match(/[^\\s()]+:\\d+:\\d+/g)||[];` +
      `for(const hit of hits){const p=/^(.*):(\\d+):(\\d+)$/.exec(hit);if(!__own(p[1]))continue;return{line:+p[2]-__base,col:+p[3]}}return null};` +
    `const __evLoc=(e)=>e.lineno&&__own(e.filename)?{line:e.lineno-__base,col:e.colno||0}:__pick(e.error&&e.error.stack);` +
    `const __preAt=(loc)=>{if(!loc||!(loc.line<1))return null;const p=loc.line+__base-1;` +
      `for(let i=0;i<__pre.length;i++){const b=__pre[i];if(p>=b[1]&&p<=b[2])return{source:i,label:b[0],line:p-b[1]+1}}return{}};` +
    `const __hint=(at)=>!at?'':at.label?'Thrown in shared source "'+at.label+'", line '+at.line+'.':'Thrown in a shared source block.';` +
    // The block name is a link: the page it lives in scrolls to the block and marks the line.
    `const __hintHtml=(at)=>!at?'':!at.label?__esc(__hint(at)):'Thrown in <a href="#" data-src="'+at.source+'" data-line="'+at.line+'">'+__esc('shared source "'+at.label+'", line '+at.line)+'</a>.';` +
    `document.body.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[data-src]');if(!a)return;e.preventDefault();parent.postMessage({__sandboxGoto:{source:+a.dataset.src,line:+a.dataset.line}},'*')});` +
    `const showErr=(m,loc)=>{window.__sbxDead=true;const at=__preAt(loc),hint=__hint(at);` +
      `document.body.innerHTML='<pre class=err>'+(at?__hintHtml(at)+'\\n\\n':'')+__esc(m)+'</pre>';window.__sbxFlushConsole&&__sbxFlushConsole();` +
      `window.__sbxErr={message:String(m),line:loc&&loc.line,col:loc&&loc.col,hint};parent.postMessage({__sandboxError:window.__sbxErr},'*');report()};` +
    `addEventListener('error',e=>showErr(e.error?__fmt(e.error):e.message,__evLoc(e)));` +
    `addEventListener('unhandledrejection',e=>showErr(__fmt(e.reason),__pick(e.reason&&e.reason.stack)));`;

  const script =
    VIS_GATE +
    knobRuntime(knobs) +
    HELLO +
    setup +
    resetVars +
    loopDef +
    resetApi +
    rerun +
    `new ResizeObserver(report).observe(document.documentElement);` +
    themeSync +
    `const run=()=>{__ran=true;__knobDefs=[];__knobN=0;try{\n${pre}\n${body}\n}catch(e){showErr(__fmt(e),__pick(e&&e.stack));return}report();__knobReport()};` +
    loadExt +
    tail;

  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>${consoleScript(captureConsole)}</head><body>${surface}${playBtn}${ctlOverlay}${ext}<script>${errorReporting}</script><script>${script}</script></body></html>`;
}

const FENCE_OPEN = /^\s*(`{3,}|~{3,})\s*([^\s]+)?\s*(.*)$/;
const FENCE_CLOSE = { '`': /^\s*`{3,}\s*$/, '~': /^\s*~{3,}\s*$/ };

// Any line that opens or closes a fence, sandbox or not. An edit that touches none of
// these, and none of the blocks, cannot change what findSandboxBlocks returns.
export const FENCE_LINE = /^\s*(?:`{3,}|~{3,})/;

export function findSandboxBlocks(src) {
  const text = src || '';
  const lines = text.split('\n');

  const starts = [];
  for (let p = 0, k = 0; k < lines.length; k++) { starts.push(p); p += lines[k].length + 1; }

  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const open = FENCE_OPEN.exec(lines[i]);
    if (!open) continue;
    const close = FENCE_CLOSE[open[1][0]];
    const spec = parseMeta(open[2] || '', open[3] || '');

    let j = i + 1;
    while (j < lines.length && !close.test(lines[j])) j++;
    const closed = j < lines.length;
    if (spec) {
      const endLine = closed ? j : lines.length - 1;
      const to = Math.min(text.length, starts[endLine] + lines[endLine].length);
      blocks.push({ ...spec, code: lines.slice(i + 1, j).join('\n'), from: starts[i], to, closed });
    }
    i = j;
  }
  return blocks;
}
