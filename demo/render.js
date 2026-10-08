import { createMarkdownRenderer } from '@briwa.dev/sandbox/markdown';
import { highlightCode } from './highlight.js';

export const renderMarkdown = createMarkdownRenderer({ highlight: highlightCode, lazy: true });
