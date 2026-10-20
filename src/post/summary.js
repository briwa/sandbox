// What a card says of a markdown file: its title, date, whether it runs sandboxes or is a
// draft, the opening of its text as plain words, and what it shows instead of that (thumb.js).

import { readKey, splitFrontmatter } from './frontmatter.js';
import { pickThumb } from './thumb.js';

const EXCERPT = 240;

export function summarize(text, file) {
  const { frontmatter, body } = splitFrontmatter(text);
  return {
    title: readKey(frontmatter, 'title') || file,
    date: readKey(frontmatter, 'date'),
    sandbox: readKey(frontmatter, 'sandbox') === 'true',
    draft: readKey(frontmatter, 'draft') === 'true',
    excerpt: excerpt(body),
    thumb: pickThumb(frontmatter, body),
  };
}

function excerpt(body) {
  const words = body
    .replace(/^(```|~~~)[\s\S]*?^\1.*$/gm, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_`~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return words.length > EXCERPT ? `${words.slice(0, EXCERPT).replace(/\s+\S*$/, '')}…` : words;
}
