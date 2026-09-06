import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { remarkSandbox, remarkStripHtml } from '@briwa.dev/sandbox/remark';
import { highlightCode } from '@briwa.dev/sandbox/editor';

const processor = unified()
  .use(remarkParse)
  .use(remarkStripHtml)
  .use(remarkSandbox, { highlight: highlightCode })
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeStringify, { allowDangerousHtml: true });

export async function renderMarkdown(md) {
  return String(await processor.process(md));
}
