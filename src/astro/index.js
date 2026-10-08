import { remarkSandbox, remarkStripHtml, sandboxMarkdownPlugins } from '../remark/index.js';

export function shikiHighlight({ theme = 'css-variables', ...rest } = {}) {
  let highlighter;
  const load = async () => {
    const { createShikiHighlighter } = await import('@astrojs/internal-helpers/shiki');
    return createShikiHighlighter({ theme, ...rest });
  };
  return async (code, lang = 'js') => {
    highlighter ??= load();
    return (await highlighter).codeToHtml(code, lang);
  };
}

// Astro 7 renders markdown with Sätteri by default, which runs no remark or rehype
// plugins at all, and `markdown.remarkPlugins` is deprecated on its way out. The plugins
// have to land on a `unified()` processor from `@astrojs/markdown-remark`: the site's
// own, if it set one — its options object keeps its identity through config validation,
// so pushing onto it is the supported way in — or one made here otherwise. The site's
// remark plugins then see the figures already built, and the sandbox passes come first
// so `remarkStripHtml` only ever removes what the author wrote.
async function installPlugins(config, updateConfig, plugins) {
  const { unified, isUnifiedProcessor } = await import('@astrojs/markdown-remark');
  const current = config.markdown?.processor;
  if (current && isUnifiedProcessor(current)) {
    current.options.remarkPlugins.unshift(...plugins.remarkPlugins);
    current.options.rehypePlugins.push(...plugins.rehypePlugins);
    return;
  }
  updateConfig({ markdown: { processor: unified(plugins) } });
}

export default function sandbox(options = {}) {
  const {
    remark = true,
    client = true,
    styles = true,
    shiki,
    // Astro's own shiki already colours every ordinary fence, in every language it
    // knows, so the fence pass is off unless a site asks for the figure highlighter's
    // exact output there too.
    fences = false,
    links = true,
    // Deferring frames relies on the client to load them, so it follows `client`.
    lazy = client,
    clientOptions,
  } = options;

  return {
    name: '@briwa.dev/sandbox',
    hooks: {
      'astro:config:setup': async ({ config, updateConfig, injectScript }) => {
        if (remark) {
          const plugins = sandboxMarkdownPlugins({ highlight: shikiHighlight(shiki), fences, links, lazy });
          await installPlugins(config, updateConfig, plugins);
        }

        const head = [];
        if (styles) head.push(`import '@briwa.dev/sandbox/styles/figure.css';`);
        if (client) {
          head.push(
            `import { mountFigures } from '@briwa.dev/sandbox/client';`,
            `mountFigures(${JSON.stringify(clientOptions ?? {})});`
          );
        }

        if (head.length) injectScript('page', head.join('\n'));
      },
    },
  };
}

export { remarkSandbox, remarkStripHtml, sandboxMarkdownPlugins };
export { remarkHighlightFences, rehypeLinks } from '../remark/index.js';
