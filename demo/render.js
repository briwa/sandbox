import { createMarkdownRenderer } from '@briwa.dev/sandbox/markdown';
import { highlightCode } from '@briwa.dev/sandbox/editor';

export const renderMarkdown = createMarkdownRenderer({ highlight: highlightCode });
