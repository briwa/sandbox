import { EditorSelection } from "@codemirror/state";

let prettier;

function loadPrettier() {
  prettier ??= Promise.all([
    import("prettier/standalone"),
    import("prettier/plugins/babel"),
    import("prettier/plugins/estree"),
    import("prettier/plugins/html"),
    import("prettier/plugins/postcss"),
  ]).then(([standalone, ...plugins]) => ({ format: standalone.formatWithCursor, plugins }));
  prettier.catch(() => { prettier = undefined; });
  return prettier;
}

const BROKEN_DESTRUCTURE = /^([ \t]*)((?:export )?(?:const|let|var) )\{ (.+) \} =\n[ \t]+(.+;)$/gm;

function splitTopLevel(list) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    else if (ch === "," && depth === 0) {
      parts.push(list.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(list.slice(start).trim());
  return parts.filter(Boolean);
}

function expandDestructuring(code, cursorOffset) {
  let cursor = cursorOffset;
  let shift = 0;
  const out = code.replace(BROKEN_DESTRUCTURE, (match, indent, keyword, list, rhs, offset) => {
    const names = splitTopLevel(list);
    const next = `${indent}${keyword}{\n${names.map((n) => `${indent}  ${n}${n.startsWith("...") ? "" : ","}`).join("\n")}\n${indent}} = ${rhs}`;
    if (cursorOffset > offset + match.length) cursor += next.length - match.length;
    else if (cursorOffset > offset) cursor = offset + shift;
    shift += next.length - match.length;
    return next;
  });
  return { formatted: out, cursorOffset: cursor };
}

export async function formatCode(code, { lang = "js", cursorOffset = 0, printWidth = 80 } = {}) {
  const { format, plugins } = await loadPrettier();
  const result = await format(code, {
    parser: lang === "vue" ? "vue" : "babel",
    plugins,
    cursorOffset,
    printWidth,
  });
  return expandDestructuring(result.formatted, result.cursorOffset);
}

export async function formatView(view, options = {}) {
  if (!view) return false;
  const { state } = view;
  const code = state.doc.toString();
  let result;
  try {
    result = await formatCode(code, { ...options, cursorOffset: state.selection.main.head });
  } catch {
    return false;
  }
  const formatted = code.endsWith("\n") ? result.formatted : result.formatted.replace(/\n$/, "");
  if (!view.dom.isConnected || view.state.doc !== state.doc || formatted === code) return false;
  const anchor = Math.min(Math.max(result.cursorOffset, 0), formatted.length);
  view.dispatch({
    changes: { from: 0, to: code.length, insert: formatted },
    selection: EditorSelection.cursor(anchor),
    scrollIntoView: true,
    userEvent: "format",
  });
  return true;
}
