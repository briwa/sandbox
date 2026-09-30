// Frontmatter is carried through verbatim.
//
// A document's frontmatter belongs to whatever builds the site — `title` and `tags` for one
// repo, `layout` and `weight` for another. Parsing it into an object and re-emitting would
// silently rewrite key order, quoting and comments on every save, so the block is kept as
// the exact string it arrived as and only *read* from when the UI needs a value.

// Only the leading block counts; a `---` later in prose is a horizontal rule.
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;

export function splitFrontmatter(text = '') {
  const m = FRONTMATTER.exec(text);
  if (!m) return { frontmatter: '', body: text };
  return { frontmatter: m[1], body: text.slice(m[0].length).replace(/^\r?\n/, '') };
}

export function joinFrontmatter(frontmatter, body) {
  if (!frontmatter.trim()) return body;
  return `---\n${frontmatter}\n---\n\n${body}`;
}

// A single top-level scalar, read without a YAML parser.
export function readKey(frontmatter, key) {
  // `.*?` rather than `.+?`: a key with no value must capture nothing. Requiring a
  // character made the greedy `[ \t]*` give back the space after the colon, so `title: `
  // read as a single space — blank on screen, but truthy.
  const re = new RegExp(`^[ \\t]*${key}:[ \\t]*(.*?)[ \\t]*$`, 'm');
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

// How many top-level keys the block defines. Indented lines are nested values, not keys.
export function countKeys(frontmatter) {
  return (frontmatter || '')
    .split('\n')
    .filter((line) => /^[A-Za-z_][\w-]*[ \t]*:/.test(line)).length;
}

// Replace a key's value in place, or append the line when it is absent — so retitling an
// entry does not disturb the rest of the block.
export function writeKey(frontmatter, key, value) {
  const line = `${key}: ${JSON.stringify(value)}`;
  const re = new RegExp(`^[ \\t]*${key}:[ \\t]*.*$`, 'm');
  if (re.test(frontmatter || '')) return frontmatter.replace(re, line);
  return frontmatter.trim() ? `${frontmatter.trim()}\n${line}` : line;
}
