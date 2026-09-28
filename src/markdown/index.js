// Markdown → HTML for a host that is not Astro: the demo, the editor's preview, anything
// that renders in the browser. The Astro integration wires the same plugins into the
// site's own processor; this is the same pipeline with unified wrapped around it.
//
// `highlight` is the host's highlighter — `highlightCode` from `@briwa.dev/sandbox/editor`
// is the one that matches the editor's own colouring. `fences`, `links` and `languages`
// are passed through to `sandboxMarkdownPlugins`; `remarkPlugins` and `rehypePlugins` are
// the host's own passes, run after the preset's on each side.
//
// unified, remark-parse, remark-rehype and rehype-stringify are optional peers, so the
// `/remark` entry stays dependency-free for a host that brings its own processor.
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { sandboxMarkdownPlugins } from '../remark/index.js';

export function createMarkdownRenderer({ remarkPlugins = [], rehypePlugins = [], ...preset } = {}) {
  const plugins = sandboxMarkdownPlugins(preset);

  const processor = unified()
    .use(remarkParse)
    .use([...plugins.remarkPlugins, ...remarkPlugins])
    // Figures arrive as html nodes and leave as raw HTML, so both sides let it through.
    .use(remarkRehype, { allowDangerousHtml: true })
    .use([...plugins.rehypePlugins, ...rehypePlugins])
    .use(rehypeStringify, { allowDangerousHtml: true })
    .freeze();

  return async (md) => String(await processor.process(md ?? ''));
}

export { sandboxMarkdownPlugins } from '../remark/index.js';
