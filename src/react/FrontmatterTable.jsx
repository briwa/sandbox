import { useState } from "react";

// The frontmatter as a two-column table: a key, then its value as written.
//
// Frontmatter is carried verbatim (see core/frontmatter.js), so the table never re-emits the
// block. Each row is the lines one key spans, and an edit rewrites only those lines —
// comments, blank lines and everyone else's quoting are left exactly as they were. A value is
// the raw text after the colon, so `date: 2026-09-30` stays a date and `"quoted"` stays quoted.
//
// A key whose value carries on below it — a list, a nested map, a `|` block — keeps those
// lines as they are, in a box under the inline value.

const KEY_LINE = /^([A-Za-z_][\w-]*)[ \t]*:[ \t]?(.*)$/;
const CONTINUES = /^([ \t]|-(\s|$))/;

// One entry per key: the line range it spans, its inline value, and the lines under it.
export function frontmatterRows(frontmatter) {
  const lines = (frontmatter || "").split("\n");
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const m = KEY_LINE.exec(lines[i]);
    if (!m) continue;
    let end = i + 1;
    // A blank line belongs to the value only when more of it follows, as in a `|` block.
    while (end < lines.length) {
      if (CONTINUES.test(lines[end])) end++;
      else if (!lines[end].trim() && lines.slice(end + 1).find((l) => l.trim())?.match(CONTINUES)) end++;
      else break;
    }
    // Untrimmed: a space typed at the end of a value must survive the round trip.
    rows.push({ start: i, end, key: m[1], inline: m[2], block: lines.slice(i + 1, end).join("\n") });
    i = end - 1;
  }
  return rows;
}

const linesFor = (key, inline, block) => [inline ? `${key}: ${inline}` : `${key}:`, ...(block ? block.split("\n") : [])];
const isKey = (s) => /^[A-Za-z_][\w-]*$/.test(s);
// A line typed into the box flush left would read as the next key, not as more of this
// value, and slip out of the row — so it is indented to stay under its key.
const keepUnder = (block) => block.split("\n").map((l) => (!l.trim() || CONTINUES.test(l) ? l : `  ${l}`)).join("\n");

export default function FrontmatterTable({ frontmatter, onChange }) {
  const rows = frontmatterRows(frontmatter);

  const replace = (row, next) => {
    const lines = frontmatter.split("\n");
    lines.splice(row.start, row.end - row.start, ...next);
    onChange(lines.join("\n"));
  };
  const add = (key, value) => {
    const line = linesFor(key, value).join("\n");
    onChange(frontmatter.trim() ? `${frontmatter.replace(/\s+$/, "")}\n${line}` : line);
  };

  return (
    <table className="sbx-table" aria-label="Frontmatter">
      <tbody>
        {rows.map((row) => (
          <tr key={row.start}>
            <th scope="row">
              <KeyInput value={row.key} onCommit={(key) => replace(row, linesFor(key, row.inline, row.block))} />
            </th>
            <td>
              <input
                type="text"
                value={row.inline}
                onChange={(e) => replace(row, linesFor(row.key, e.target.value, row.block))}
                aria-label={`${row.key} value`}
                spellCheck={false}
              />
              {row.block && (
                <textarea
                  className="sbx-table-block"
                  value={row.block}
                  onChange={(e) => replace(row, linesFor(row.key, row.inline, keepUnder(e.target.value)))}
                  rows={Math.min(10, row.block.split("\n").length)}
                  aria-label={`${row.key} nested value`}
                  spellCheck={false}
                />
              )}
            </td>
            <td className="sbx-table-act">
              <button type="button" onClick={() => replace(row, [])} title={`Remove ${row.key}`} aria-label={`Remove ${row.key}`}>×</button>
            </td>
          </tr>
        ))}
        <AddRow onAdd={add} />
      </tbody>
    </table>
  );
}

// A key is committed on blur or Enter, not per keystroke: half-typed, it is not a key yet,
// and the line it heads would stop reading as one.
function KeyInput({ value, onCommit }) {
  const [draft, setDraft] = useState(null);
  const commit = () => {
    if (draft != null && draft !== value && isKey(draft)) onCommit(draft);
    setDraft(null);
  };
  return (
    <input
      type="text"
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape") { setDraft(null); e.stopPropagation(); }
      }}
      aria-label="Key"
      spellCheck={false}
    />
  );
}

function AddRow({ onAdd }) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const submit = () => {
    if (!isKey(key)) return;
    onAdd(key, value);
    setKey("");
    setValue("");
  };
  const onKeyDown = (e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } };
  return (
    <tr className="sbx-table-add">
      <th scope="row">
        <input type="text" value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={onKeyDown} placeholder="key" aria-label="New key" spellCheck={false} />
      </th>
      <td>
        <input type="text" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={onKeyDown} placeholder="value" aria-label="New value" spellCheck={false} />
      </td>
      <td className="sbx-table-act">
        <button type="button" onClick={submit} disabled={!isKey(key)} title="Add key" aria-label="Add key">+</button>
      </td>
    </tr>
  );
}
