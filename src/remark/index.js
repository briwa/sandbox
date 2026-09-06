import {
  parseMeta,
  buildSrcdoc,
  buildVueSrcdoc,
  sandboxPrelude,
  sandboxExternals,
  sandboxVueComponents,
  safeUrl,
  escapeAttr,
  escapeHtml,
} from '../core/index.js';

const plainHighlight = (code) => `<pre class="astro-code"><code>${escapeHtml(code)}</code></pre>`;

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

    await Promise.all(
      found.map(async ({ parent, index, spec, code }) => {

        if (spec.snippet) {
          const libHtml = await highlightCode(code);
          const summary = spec.summary || 'Click to see the code';
          parent.children[index] = {
            type: 'html',
            value:
              `<details class="sandbox sandbox-lib">` +
              `<summary><span class="sandbox-lib-tag">lib</span><span class="sandbox-lib-label">${escapeHtml(summary)}</span></summary>` +
              `${libHtml}</details>`,
          };
          return;
        }

        if (spec.external) {
          const urls = (code || '').split(/\s+/).map(safeUrl).filter(Boolean);
          const summary = spec.summary || 'External library';
          const body = urls.length
            ? urls
                .map(
                  (u) =>
                    `<a href="${escapeAttr(u)}" target="_blank" rel="noopener noreferrer">${escapeHtml(u)}</a>`
                )
                .join('')
            : `<span class="sandbox-external-bad">${escapeHtml((code || '').trim())}</span>`;
          parent.children[index] = {
            type: 'html',
            value:
              `<details class="sandbox sandbox-lib sandbox-external">` +
              `<summary><span class="sandbox-lib-tag">external-lib</span><span class="sandbox-lib-label">${escapeHtml(summary)}</span></summary>` +
              `<div class="sandbox-external-urls">${body}</div></details>`,
          };
          return;
        }

        if (spec.vueLib) {
          const libHtml = await highlightCode(code, 'vue');
          const summary = spec.summary || 'Vue component';
          parent.children[index] = {
            type: 'html',
            value:
              `<details class="sandbox sandbox-lib">` +
              `<summary><span class="sandbox-lib-tag">vue lib</span><span class="sandbox-lib-label">${escapeHtml(summary)}</span></summary>` +
              `${libHtml}</details>`,
          };
          return;
        }

        const externals = sandboxExternals(allBlocks, spec.id);
        const srcdoc = escapeAttr(
          spec.vue
            ? buildVueSrcdoc(spec, code, { externals, components: sandboxVueComponents(allBlocks, spec.id) })
            : buildSrcdoc(spec, code, sandboxPrelude(allBlocks, spec.id), externals)
        );
        const codeHtml = spec.showCode ? await highlightCode(code, spec.vue ? 'vue' : 'js') : '';
        const html =

          `<figure class="sandbox" data-mode="preview" data-preset="${spec.preset}" style="--sandbox-h:${spec.h}px">` +

          `<div class="sandbox-stage"><iframe class="sandbox-frame" sandbox="allow-scripts" title="interactive ${spec.preset} figure" srcdoc="${srcdoc}"></iframe></div>` +
          (spec.showCode
            ? `<div class="sandbox-code">${codeHtml}</div>` +
              `<button class="sandbox-toggle" type="button">Show code</button>`
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
