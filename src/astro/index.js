import { remarkSandbox, remarkStripHtml } from '../remark/index.js';

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

export default function sandbox(options = {}) {
  const {
    remark = true,
    client = true,
    styles = true,
    editorStyles = false,
    shiki,
    clientOptions,
  } = options;

  return {
    name: '@briwa.dev/sandbox',
    hooks: {
      'astro:config:setup': ({ updateConfig, injectScript }) => {
        if (remark) {
          updateConfig({
            markdown: {

              remarkPlugins: [remarkStripHtml, [remarkSandbox, { highlight: shikiHighlight(shiki) }]],
            },
          });
        }

        const head = [];
        if (styles) head.push(`import '@briwa.dev/sandbox/styles/figure.css';`);
        if (editorStyles) head.push(`import '@briwa.dev/sandbox/styles/editor.css';`);
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

export { remarkSandbox, remarkStripHtml };
