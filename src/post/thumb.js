// What a card shows in place of its excerpt, from two flat frontmatter keys:
//
//   thumb.name: <sandbox label | gist file | image URL>
//   thumb.size: 640,480
//
// A name is a sandbox figure's label first (as describeSandboxBlock has it), then an image:
// one the text shows whose file is that name — whole, or without the `-<8 hex>` an upload
// adds, extension or not — else that file of the gist, else the URL as written. Without a
// name, or a figure name matching none, the first figure is it. `thumb.size` fixes the box;
// without one a figure is its own size and an image fits IMAGE_MAX square.

import {
  DEFAULT_H,
  DEFAULT_W,
  buildSrcdoc,
  describeSandboxBlock,
  findSandboxBlocks,
  sandboxExternals,
  sandboxPrelude,
} from '../core/index.js';
import { gistFileName } from './assets.js';
import { readKey } from './frontmatter.js';

export const IMAGE_MAX = 480;

// `640,480`, `640x480` or `640 480` → [640, 480]; anything else, none.
function parseSize(value) {
  const m = /^(\d+)\s*[,x× ]\s*(\d+)$/i.exec(String(value || '').trim());
  return m && +m[1] > 0 && +m[2] > 0 ? [+m[1], +m[2]] : null;
}

const IMAGE = /!\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]+)/g;
const unhashed = (file) => file.replace(/-[0-9a-f]{8}(\.[^./]+)$/i, '$1');
const stem = (file) => file.replace(/\.[^./]+$/, '');

function imageSrc(name, body) {
  if (/^https?:\/\//i.test(name)) return name;
  for (const m of body.matchAll(IMAGE)) {
    const src = m[1].startsWith('<') ? m[1].slice(1, -1) : m[1];
    const file = gistFileName(src);
    if (file && [file, unhashed(file), stem(unhashed(file))].includes(name)) return src;
  }
  return name;
}

/** `{ kind: 'sandbox', srcdoc, w, h }`, `{ kind: 'image', src, size }`, or null. An image's
 *  `src` is as written; resolve it against its gist with gistImageResolver. A figure's
 *  srcdoc runs on hover: post MSG_PLAY to it, as enterFigure/leaveFigure do. */
export function pickThumb(frontmatter, body) {
  const name = readKey(frontmatter, 'thumb.name');
  const size = parseSize(readKey(frontmatter, 'thumb.size'));

  const blocks = findSandboxBlocks(body);
  const figures = blocks.filter((b) => b.kind === 'figure' && b.closed);
  const named = name ? figures.find((f) => describeSandboxBlock(f).label === name) : null;

  if (name && !named) {
    const src = imageSrc(name, body);
    if (src !== name || /\.[a-z0-9]+$/i.test(name) || !figures.length) return { kind: 'image', src, size };
  }

  const figure = named ?? figures[0];
  if (!figure) return null;
  const [w, h] = size ?? [Number(figure.w) || DEFAULT_W, Number(figure.h) || DEFAULT_H];
  const srcdoc = buildSrcdoc(
    { ...figure, w, h, hover: true },
    figure.code,
    sandboxPrelude(blocks),
    sandboxExternals(blocks),
  );
  return { kind: 'sandbox', srcdoc, w, h };
}
