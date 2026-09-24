import { EditorSelection, EditorState, StateField } from "@codemirror/state";
import { EditorView, drawSelection } from "@codemirror/view";

const isMac = typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(navigator.platform);

const wordMode = StateField.define({
  create: () => false,
  update(value, tr) {
    if (tr.isUserEvent("select.occurrence.word")) return true;
    if (tr.isUserEvent("select.occurrence")) return value;
    return tr.selection || tr.docChanged ? false : value;
  },
});

function isWord(state, from, to) {
  const word = state.wordAt(from);
  return !!word && word.from === from && word.to === to;
}

function occurrences(state, query, whole) {
  const doc = state.doc.toString();
  const out = [];
  for (let i = doc.indexOf(query); i !== -1 && out.length < 5000; i = doc.indexOf(query, i + 1)) {
    if (!whole || isWord(state, i, i + query.length)) out.push(i);
  }
  return out;
}

function expandToWords(state, dispatch) {
  const { ranges, mainIndex } = state.selection;
  const next = EditorSelection.create(ranges.map((r) => (r.empty ? state.wordAt(r.head) ?? r : r)), mainIndex);
  if (next.eq(state.selection)) return false;
  dispatch(state.update({ selection: next, userEvent: "select.occurrence.word" }));
  return true;
}

function sharedQuery(state) {
  const { ranges, main } = state.selection;
  const query = state.sliceDoc(main.from, main.to);
  if (!ranges.every((r) => state.sliceDoc(r.from, r.to) === query)) return null;
  return { query, whole: state.field(wordMode, false) && isWord(state, main.from, main.to) };
}

export const selectNextOccurrence = ({ state, dispatch }) => {
  if (state.selection.ranges.some((r) => r.empty)) return expandToWords(state, dispatch);
  const shared = sharedQuery(state);
  if (!shared) return false;
  const { query, whole } = shared;
  const { ranges, main } = state.selection;
  const free = occurrences(state, query, whole).filter((i) => !ranges.some((r) => r.from < i + query.length && r.to > i));
  if (!free.length) return true;
  const from = free.find((i) => i >= main.to) ?? free[0];
  dispatch(state.update({
    selection: state.selection.addRange(EditorSelection.range(from, from + query.length)),
    effects: EditorView.scrollIntoView(from, { y: "nearest" }),
    userEvent: "select.occurrence",
  }));
  return true;
};

export const selectAllOccurrences = ({ state, dispatch }) => {
  const { main } = state.selection;
  let target;
  if (main.empty) {
    const word = state.wordAt(main.head);
    if (!word) return false;
    target = { query: state.sliceDoc(word.from, word.to), whole: true, from: word.from };
  } else {
    const shared = sharedQuery(state);
    if (!shared) return false;
    target = { ...shared, from: main.from };
  }
  const { query, whole, from } = target;
  const matches = occurrences(state, query, whole);
  dispatch(state.update({
    selection: EditorSelection.create(matches.map((i) => EditorSelection.range(i, i + query.length)), Math.max(0, matches.indexOf(from))),
    userEvent: whole ? "select.occurrence.word" : "select.occurrence",
  }));
  return true;
};

export const multiCursorKeymap = [
  { key: "Mod-d", run: selectNextOccurrence, preventDefault: true },
  { key: "Mod-Shift-l", run: selectAllOccurrences, preventDefault: true },
];

export const multiCursor = [
  wordMode,
  EditorState.allowMultipleSelections.of(true),
  drawSelection(),
  EditorView.clickAddsSelectionRange.of((e) => e.altKey || (isMac ? e.metaKey : e.ctrlKey)),
  EditorView.theme({
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "currentColor" },
    ".cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
      background: "color-mix(in srgb, currentColor 22%, transparent)",
    },
  }),
];
