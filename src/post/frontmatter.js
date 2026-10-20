// Frontmatter is carried through verbatim.
//
// A document's frontmatter belongs to whatever builds the site — `title` and `tags` for one
// repo, `layout` and `weight` for another. Parsing it into an object and re-emitting would
// silently rewrite key order, quoting and comments on every save, so the block is kept as
// the exact string it arrived as and only *read* from when the UI needs a value.

// Only the leading block counts; a `---` later in prose is a horizontal rule.
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;

// The block's delimiters are kept as they were read — `fence.open` up to the frontmatter,
// `fence.close` from its end to the body, blank line included — so joining puts back exactly
// what was split, and a pulled file is not changed by being read.
export function splitFrontmatter(text = '') {
  const m = FRONTMATTER.exec(text);
  if (!m) return { frontmatter: '', body: text, fence: null };
  const lead = /^\r?\n/.exec(text.slice(m[0].length))?.[0] ?? '';
  const open = /^---\r?\n/.exec(m[0])[0];
  const close = m[0].slice(open.length + m[1].length) + lead;
  return { frontmatter: m[1], body: text.slice(m[0].length + lead.length), fence: { open, close } };
}

// A file read with a block keeps one, emptied or not. Without a `fence` — a new entry, or one
// stored before fences were kept — the block is written the usual way, and only if it has
// something in it.
export function joinFrontmatter(frontmatter, body, fence = null) {
  if (fence) return `${fence.open}${frontmatter}${fence.close}${body}`;
  if (!frontmatter.trim()) return body;
  return `---\n${frontmatter}\n---\n\n${body}`;
}

// Keys go into patterns as written; a dotted one (`thumb.name`) must not match `thumbXname`.
const esc = (key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A single top-level scalar, read without a YAML parser. A dotted key is one flat key.
export function readKey(frontmatter, key) {
  // `.*?` rather than `.+?`: a key with no value must capture nothing. Requiring a
  // character made the greedy `[ \t]*` give back the space after the colon, so `title: `
  // read as a single space — blank on screen, but truthy.
  const re = new RegExp(`^[ \\t]*${esc(key)}:[ \\t]*(.*?)[ \\t]*$`, 'm');
  const m = re.exec(frontmatter || '');
  if (!m) return '';
  let v = m[1];
  if (v.startsWith('"')) {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  if (v.startsWith("'")) return v.replace(/^'|'$/g, '');
  return v;
}

// Whether a top-level key is there at all, set or empty.
export function hasKey(frontmatter, key) {
  return new RegExp(`^[ \\t]*${esc(key)}:`, 'm').test(frontmatter || '');
}

// How many top-level keys the block defines. Indented lines are nested values, not keys.
export function countKeys(frontmatter) {
  return (frontmatter || '')
    .split('\n')
    .filter((line) => /^[A-Za-z_][\w.-]*[ \t]*:/.test(line)).length;
}

// Replace a key's value in place, or append the line when it is absent — so retitling an
// entry does not disturb the rest of the block.
export function writeKey(frontmatter, key, value) {
  const line = `${key}: ${JSON.stringify(value)}`;
  const re = new RegExp(`^[ \\t]*${esc(key)}:[ \\t]*.*$`, 'm');
  if (re.test(frontmatter || '')) return frontmatter.replace(re, line);
  return frontmatter.trim() ? `${frontmatter.trim()}\n${line}` : line;
}
