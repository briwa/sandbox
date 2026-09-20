import {
  parseMeta,
  describeSandboxBlock,
  buildSrcdoc,
  buildVueSrcdoc,
  sandboxPrelude,
  sandboxExternals,
  sandboxVueComponents,
  safeUrl,
  escapeAttr,
  escapeHtml,
} from '../core/index.js';
import { iconSvg, KIND_ICONS } from '../core/icons.js';

const libSummary = (kind, label) =>
  `<summary><span class="sandbox-lib-label">${escapeHtml(label)}</span>` +
  (KIND_ICONS[kind] ?? KIND_ICONS.source)
    .map(([icon, title]) => `<span class="sandbox-lib-tag" title="${title}" aria-label="${title}">${iconSvg(icon, 13)}</span>`)
    .join('') +
  `</summary>`;

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

export function remarkSandbox({ highlight } = {}) {

  const highlightCode = async (code, lang = 'js') => {
    if (!highlight) return plainHighlight(code);
    try {
      return await highlight(code, lang);
    } catch {
      return plainHighlight(code);
    }
  };

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
    const prelude = sandboxPrelude(allBlocks);

    await Promise.all(
      found.map(async ({ parent, index, spec, code }) => {
        const { kind, label } = describeSandboxBlock({ ...spec, code });

        if (kind !== 'figure') {
          const body = kind === 'external' ? externalUrlList(code) : await highlightCode(code, spec.lang);
          parent.children[index] = {
            type: 'html',
            value:
              `<details class="sandbox sandbox-lib${kind === 'external' ? ' sandbox-external' : ''}">` +
              libSummary(kind, label) +
              body +
              `</details>`,
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

          `<figure class="sandbox" data-mode="preview" data-preset="${spec.preset}" style="--sandbox-h:${spec.h}px">` +

          `<div class="sandbox-stage"><iframe class="sandbox-frame" sandbox="allow-scripts" title="interactive ${spec.preset} figure" srcdoc="${srcdoc}"></iframe></div>` +
          (spec.showCode
            ? `<div class="sandbox-code">${codeHtml}</div>` +
              `<button class="sandbox-toggle" type="button" title="Show code" aria-label="Show code">${iconSvg('code')}</button>`
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
