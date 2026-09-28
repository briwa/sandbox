import { StateField, StateEffect, RangeSet } from "@codemirror/state";
import { Decoration, EditorView, GutterMarker, gutterLineClass, hoverTooltip } from "@codemirror/view";

const setErrorEffect = StateEffect.define();

const errorLine = Decoration.line({ class: "cm-error-line" });

const errorGutterMarker = new (class extends GutterMarker {
  elementClass = "cm-error-gutter";
})();

const errorField = StateField.define({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setErrorEffect)) return e.value;
    return tr.docChanged ? null : value;
  },
});

// A line of 0 or less came from the shared prelude, not from this block, and a line past
// the end came from the frame's own scaffolding. Neither belongs to a line we can point at.
function errorPos(state) {
  const err = state.field(errorField);
  if (!err || !err.line || err.line < 1 || err.line > state.doc.lines) return null;
  return state.doc.line(err.line);
}

const errorDecorations = EditorView.decorations.compute([errorField, "doc"], (state) => {
  const line = errorPos(state);
  return line ? Decoration.set([errorLine.range(line.from)]) : Decoration.none;
});

const errorGutter = gutterLineClass.compute([errorField, "doc"], (state) => {
  const line = errorPos(state);
  return line ? RangeSet.of([errorGutterMarker.range(line.from)]) : RangeSet.empty;
});

const errorTooltip = hoverTooltip((view, pos) => {
  const line = errorPos(view.state);
  if (!line || pos < line.from || pos > line.to) return null;
  const { message } = view.state.field(errorField);
  return {
    pos: line.from,
    end: line.to,
    above: true,
    create() {
      const dom = document.createElement("div");
      dom.className = "cm-error-tooltip";
      dom.textContent = message;
      return { dom };
    },
  };
});

export const editorErrors = [errorField, errorDecorations, errorGutter, errorTooltip];

// V8 pins a call to an undefined name inside an argument list or array literal to the start
// of the enclosing expression, so `steps.push(\n  nope(),\n)` reports the `push` line. When
// the reported line never mentions the name, the first following line that does is the one.
// Safari and Firefox report the identifier's own line, so the check leaves them alone.
const UNDEFINED_NAME = /^(?:ReferenceError: )?(?:([\w$]+) is not defined|Can't find variable: ([\w$]+))/m;
const SNAP_WINDOW = 40;

export function snapErrorLine(doc, line, message) {
  const m = UNDEFINED_NAME.exec(String(message || ""));
  const name = m && (m[1] || m[2]);
  if (!name || !(line >= 1) || line > doc.lines) return line;
  const word = new RegExp(`(^|[^\\w$])${name.replace(/\$/g, "\\$")}(?![\\w$])`);
  if (word.test(doc.line(line).text)) return line;
  for (let n = line + 1; n <= Math.min(doc.lines, line + SNAP_WINDOW); n++) {
    if (word.test(doc.line(n).text)) return n;
  }
  return line;
}

export function showError(view, { line, message }) {
  if (!view) return;
  line = snapErrorLine(view.state.doc, line, message);
  const effects = [setErrorEffect.of({ line, message })];
  if (line >= 1 && line <= view.state.doc.lines) {
    effects.push(EditorView.scrollIntoView(view.state.doc.line(line).from, { y: "nearest" }));
  }
  view.dispatch({ effects });
}

export function clearError(view) {
  if (view?.state.field(errorField, false)) view.dispatch({ effects: setErrorEffect.of(null) });
}
