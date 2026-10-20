// A gist's markdown file as a post: what a site lists it by and shows it as, the same for a
// static build and an app in the browser. Pure functions; the views are the host's.
//
// The markdown pipeline is not imported here, so a host that only lists posts does not pull
// unified in: renderPost takes the renderer createMarkdownRenderer (`/markdown`) made.

import { gistImageResolver, resolveImages } from './assets.js';
import { splitFrontmatter } from './frontmatter.js';
import { summarize } from './summary.js';

export * from './frontmatter.js';
export * from './assets.js';
export { summarize } from './summary.js';
export { pickThumb, IMAGE_MAX } from './thumb.js';

/** `text` of `file` in gist `gistId` of `owner` → its summary, the body as HTML with the
 *  gist's images read from the raw host, and a thumb's `src` resolved the same way. */
export async function renderPost(text, { render, file, owner, gistId, assets } = {}) {
  const resolve = gistImageResolver({ owner, gistId }, assets);
  const summary = summarize(text, file);
  const { body } = splitFrontmatter(text);
  const thumb = summary.thumb?.kind === 'image' ? { ...summary.thumb, src: resolve(summary.thumb.src) } : summary.thumb;
  return { ...summary, thumb, html: await render(resolveImages(body, resolve)) };
}
