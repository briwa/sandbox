// A gist's images, as its markdown names them: `/uploads/<file>`, `./<file>` or `<file>` — any
// file of the same gist — read from the raw host, which needs no sign-in for a secret gist
// either. A link elsewhere is left as it is.

const RAW = 'https://gist.githubusercontent.com';

const enc = encodeURIComponent;

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** `src` as written → where to load it. `assets`, `{ filename, url }` each, pin a file to the revision it was
 *  listed at; one not among them is read at the gist's latest. */
export function gistImageResolver({ owner, gistId } = {}, assets = []) {
  const byName = new Map(assets.map((a) => [a.filename, a.url]));
  return (src) => {
    const name = gistFileName(src);
    if (!name) return src;
    if (byName.has(name)) return byName.get(name);
    return owner && gistId ? `${RAW}/${enc(owner)}/${enc(gistId)}/raw/${enc(name)}` : src;
  };
}

/** The file of the same gist `src` names, or null: absolute, on another host, or in a folder. */
export function gistFileName(src) {
  if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(src)) return null;
  const name = safeDecode(src.replace(/^(\.\/|\/?uploads\/|\/)/, ''));
  return name && !name.includes('/') ? name : null;
}

// `![alt](src …)`, its src bare or in angle brackets.
const IMAGE = /(!\[[^\]]*\]\(\s*)(<[^>]*>|[^)\s]+)/g;

/** The markdown with each image's src as `resolve` has it. */
export function resolveImages(markdown, resolve) {
  if (!resolve) return markdown;
  return markdown.replace(IMAGE, (_, head, src) => {
    const bracketed = src.startsWith('<');
    const out = resolve(bracketed ? src.slice(1, -1) : src);
    return head + (bracketed || /\s/.test(out) ? `<${out}>` : out);
  });
}

// The whole of `![alt](src "title")`.
const IMAGE_WHOLE = /!\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]+)[^)]*\)/g;

/** Where `markdown` shows `filename` of its gist, as CodeMirror changes taking each out — its
 *  line too, when the image was all the line held. */
export function imageRemovals(markdown, filename) {
  const out = [];
  for (const m of markdown.matchAll(IMAGE_WHOLE)) {
    const src = m[1].startsWith('<') ? m[1].slice(1, -1) : m[1];
    if (gistFileName(src) !== filename) continue;
    let from = m.index;
    let to = from + m[0].length;
    const start = markdown.lastIndexOf('\n', from - 1) + 1;
    const end = markdown.indexOf('\n', to);
    const lineEnd = end < 0 ? markdown.length : end;
    if (!markdown.slice(start, from).trim() && !markdown.slice(to, lineEnd).trim()) {
      from = start;
      to = end < 0 ? lineEnd : end + 1;
    }
    out.push({ from, to });
  }
  return out;
}
