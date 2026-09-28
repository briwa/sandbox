import {
  parseMeta,
  describeSandboxBlock,
  buildSrcdoc,
  buildVueSrcdoc,
  sandboxPreludeBlocks,
  sandboxExternals,
  sandboxVueComponents,
  safeUrl,
  escapeAttr,
  escapeHtml,
} from '../core/index.js';
import { iconSvg, KIND_ICONS } from '../core/icons.js';

const copyButton = `<button class="sandbox-copy" type="button" title="Copy code" aria-label="Copy code">${iconSvg('copy')}</button>`;

const libHead = (kind, label) =>
  `<div class="sandbox-stage sandbox-lib-head"><span class="sandbox-lib-label">${escapeHtml(label)}</span>` +
  (KIND_ICONS[kind] ?? KIND_ICONS.source)
    .map(([icon, title]) => `<span class="sandbox-lib-tag" title="${title}" aria-label="${title}">${iconSvg(icon, 13)}</span>`)
    .join('') +
  `</div>`;

const codeToggle = (showing) =>
  showing
    ? `<button class="sandbox-toggle" type="button" title="Hide code" aria-label="Hide code">${iconSvg('codeOff')}</button>`
    : `<button class="sandbox-toggle" type="button" title="Show code" aria-label="Show code">${iconSvg('code')}</button>`;

const plainHighlight = (code) => `<pre class="astro-code"><code>${escapeHtml(code)}</code></pre>`;

const externalUrlList = (code) => {
  const urls = (code || '').split(/\s+/).map(safeUrl).filter(Boolean);
  const body = urls.length
    ? urls
        .map((u) => `<a href="${escapeAttr(u)}" target="_blank" rel="noopener noreferrer">${escapeHtml(u)}</a>`)
        .join('')
    : `<span class="sandbox-external-bad">${escapeHtml((code || '').trim())}</span>`;
  return `<div class="sandbox-external-urls">${body}</div>`;
};

// A highlighter is whatever the host has: shiki at build time, the editor's lezer
// highlighter in the browser. Either way it may be async and it may throw on a language
// it does not know, and a figure with unstyled code beats a page that failed to build.
const withFallback = (highlight) => async (code, lang = 'js') => {
  if (!highlight) return plainHighlight(code);
  try {
    return await highlight(code, lang);
  } catch {
    return plainHighlight(code);
  }
};

export function remarkSandbox({ highlight } = {}) {
  const highlightCode = withFallback(highlight);

  return async (tree) => {

    const found = [];
    const walk = (node) => {
      if (!node || !Array.isArray(node.children)) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === 'code') {
          const spec = parseMeta(child.lang, child.meta);
          if (spec) { found.push({ parent: node, index: i, spec, code: child.value }); continue; }
        }
        walk(child);
      }
    };
    walk(tree);

    const allBlocks = found.map(({ spec, code }) => ({ ...spec, code }));
    const externals = sandboxExternals(allBlocks);
    const components = sandboxVueComponents(allBlocks);
    const prelude = sandboxPreludeBlocks(allBlocks);

    // A frame names a shared js block by its position in the prelude, so the page stamps
    // each one with the same index for the client to find on a goto.
    let sourceIndex = 0;

    await Promise.all(
      found.map(async ({ parent, index, spec, code }) => {
        const { kind, label } = describeSandboxBlock({ ...spec, code });
        const source = kind === 'source' ? ` data-source="${sourceIndex++}"` : '';

        // A shared block wears the same chrome as a figure: a head stands where the frame
        // would be, and showing the code swaps it out the same way — `data-mode` decides
        // which of the two is on screen, with the tools in the corner either way.
        if (kind !== 'figure') {
          const body = kind === 'external' ? externalUrlList(code) : await highlightCode(code, spec.lang);
          parent.children[index] = {
            type: 'html',
            value:
              `<figure class="sandbox sandbox-lib" data-kind="${kind}"${source} data-mode="${spec.open ? 'code' : 'preview'}">` +
              libHead(kind, label) +
              `<div class="sandbox-code">${body}</div>` +
              `<div class="sandbox-tools">` +
              (kind === 'external' ? '' : copyButton) +
              codeToggle(spec.open) +
              `</div>` +
              `</figure>`,
          };
          return;
        }

        const srcdoc = escapeAttr(
          spec.lang === 'vue'
            ? buildVueSrcdoc(spec, code, { externals, components })
            : buildSrcdoc(spec, code, prelude, externals)
        );
        const codeHtml = spec.showCode ? await highlightCode(code, spec.lang) : '';
        const html =

          `<figure class="sandbox" data-mode="${spec.open ? 'code' : 'preview'}" data-preset="${spec.preset}"` +
          (spec.control ? ` data-control="${spec.control}"` : '') +
          ` style="--sandbox-h:${spec.h}px;--sandbox-ar:${spec.w}/${spec.h}">` +

          `<div class="sandbox-stage"><iframe class="sandbox-frame" sandbox="allow-scripts" title="interactive ${spec.preset} figure" srcdoc="${srcdoc}"></iframe>` +
          // A frame swallows the pointer: neither page sees it enter or leave. This catches
          // it in the host document instead, which is where the hover wiring lives.
          (spec.control === 'hover' ? `<div class="sandbox-hover" aria-hidden="true"></div>` : '') +
          `</div>` +
          (spec.showCode
            ? `<div class="sandbox-code">${codeHtml}</div>` +
              `<div class="sandbox-tools">` +
              copyButton +
              (spec.open
                ? `<button class="sandbox-toggle" type="button" title="Show preview" aria-label="Show preview">${iconSvg('eye')}</button>`
                : codeToggle(false)) +
              `</div>`
            : '') +
          `</figure>`;
        parent.children[index] = { type: 'html', value: html };
      })
    );
  };
}

// Must run before remarkSandbox, which emits its figures as html nodes.
export function remarkStripHtml() {
  return (tree) => {
    const walk = (node) => {
      if (!node || !Array.isArray(node.children)) return;
      node.children = node.children.filter((c) => c.type !== 'html');
      for (const child of node.children) walk(child);
    };
    walk(tree);
  };
}

// The fences remarkSandbox left alone — ordinary code blocks — coloured by the same
// highlighter, so a keyword in prose looks like a keyword in a figure. Runs after
// remarkSandbox: by then the figure fences are html nodes, so what is still `code` is
// exactly the set this should touch. Only the languages the highlighter knows are
// replaced; the editor's highlighter parses anything unfamiliar as JavaScript, and
// Python coloured by JavaScript's rules is worse than Python left plain. In Astro the
// site's own shiki already does this for every language, so the integration skips it.
export const HIGHLIGHTED_LANGS = ['js', 'javascript', 'vue'];

export function remarkHighlightFences({ highlight, languages = HIGHLIGHTED_LANGS } = {}) {
  const known = new Set(languages.map((l) => l.toLowerCase()));
  const highlightCode = withFallback(highlight);

  return async (tree) => {
    const found = [];
    const walk = (node) => {
      if (!node || !Array.isArray(node.children)) return;
      node.children.forEach((child, index) => {
        const lang = (child.lang || '').toLowerCase();
        if (child.type === 'code' && known.has(lang)) {
          found.push({ parent: node, index, code: child.value, lang });
          return;
        }
        walk(child);
      });
    };
    walk(tree);

    await Promise.all(
      found.map(async ({ parent, index, code, lang }) => {
        parent.children[index] = { type: 'html', value: await highlightCode(code, lang) };
      })
    );
  };
}

// Every link and image the markdown produced, checked on the hast side where each is an
// element with a URL on it rather than a shape per syntax.
//
// `safe` drops a URL whose scheme the page should not follow. `[click](javascript:…)`
// survives remark-rehype untouched, and a page that renders someone else's markdown —
// a gist, a post — would run it in its own origin. Dropped rather than blanked: an `<a>`
// with no href is text and an `<img>` with no src shows its alt, both of which say "not
// a link we would follow" better than a dead `#` does.
//
// `external` opens an http(s) link in a new tab, with `rel` set so the page it opens
// cannot reach back. Everything else — a relative path, a mailto — stays in place.
//
// Raw HTML was already dropped by remarkStripHtml, and a sandbox figure is still a `raw`
// node here that this pass does not descend into: its own links were built by the figure
// from the fence, and the frame runs where it always did, in a null-origin iframe.
const LINK_SCHEMES = new Set(['http', 'https', 'mailto']);

export function isSafeUrl(url, { image = false } = {}) {
  // Browsers strip control characters and spaces before reading the scheme, so
  // `java\nscript:` is `javascript:` by the time it matters. The test reads what the
  // browser will.
  const bare = String(url).replace(/[\u0000-  ]/g, '');
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(bare)?.[1].toLowerCase();
  // No scheme at all is a relative URL, which can only point back into this origin's
  // own paths.
  if (!scheme) return true;
  // A data image is inert — an SVG's script does not run through `<img>` — and an
  // embedded diagram is a reasonable thing for a file to carry.
  if (image && /^data:image\//i.test(bare)) return true;
  return LINK_SCHEMES.has(scheme);
}

export const isExternalUrl = (url) => /^https?:\/\//i.test(String(url));

export function rehypeLinks({ safe = true, external = true } = {}) {
  return (tree) => {
    const walk = (node) => {
      if (!node || !Array.isArray(node.children)) return;
      for (const child of node.children) {
        if (child.type === 'element' && child.properties) {
          const props = child.properties;
          if (child.tagName === 'a' && typeof props.href === 'string') {
            if (safe && !isSafeUrl(props.href)) delete props.href;
            else if (external && isExternalUrl(props.href)) {
              props.target = '_blank';
              props.rel = ['noopener', 'noreferrer'];
            }
          }
          if (child.tagName === 'img' && typeof props.src === 'string' && safe && !isSafeUrl(props.src, { image: true })) {
            delete props.src;
          }
        }
        walk(child);
      }
    };
    walk(tree);
  };
}

// The whole pipeline in the one order that works, for any unified host to splice in:
// strip raw HTML before remarkSandbox emits its figures as html nodes, colour the
// leftover fences after it, and check links last of all on the hast side. Every host —
// the demo, the editor, the Astro integration — builds from this, so a fix to one pass
// lands in all of them.
export function sandboxMarkdownPlugins({ highlight, fences = true, links = true, languages } = {}) {
  const remarkPlugins = [remarkStripHtml, [remarkSandbox, { highlight }]];
  if (fences) remarkPlugins.push([remarkHighlightFences, { highlight, languages }]);
  const rehypePlugins = links ? [[rehypeLinks, links === true ? {} : links]] : [];
  return { remarkPlugins, rehypePlugins };
}
