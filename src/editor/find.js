import { StateField, StateEffect } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";

const setFindEffect = StateEffect.define();

const matchMark = Decoration.mark({ class: "cm-find-match" });
const currentMark = Decoration.mark({ class: "cm-find-match cm-find-current" });

function findMatches(doc, query) {
  if (!query) return [];
  const hay = doc.toString().toLowerCase();
  const needle = query.toLowerCase();
  const out = [];
  for (let i = hay.indexOf(needle); i !== -1 && out.length < 5000; i = hay.indexOf(needle, i + needle.length)) {
    out.push({ from: i, to: i + needle.length });
  }
  return out;
}

const findField = StateField.define({
  create: () => ({ query: "", current: 0 }),
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setFindEffect)) return e.value ?? { query: "", current: 0 };
    return value;
  },
});

const findDecorations = EditorView.decorations.compute(["doc", findField], (state) => {
  const { query, current } = state.field(findField);
  const matches = findMatches(state.doc, query);
  return Decoration.set(matches.map((m, i) => (i === current ? currentMark : matchMark).range(m.from, m.to)));
});

export const editorFind = [findField, findDecorations];

function reveal(view, query, current, matches) {
  const m = matches[current];
  view.dispatch({
    effects: [setFindEffect.of({ query, current }), EditorView.scrollIntoView(m.from, { y: "center" })],
    selection: { anchor: m.from, head: m.to },
  });
}

export function setFind(view, query) {
  const matches = findMatches(view.state.doc, query);
  if (!matches.length) {
    view.dispatch({ effects: setFindEffect.of(query ? { query, current: 0 } : null) });
    return;
  }
  const head = view.state.selection.main.from;
  const at = matches.findIndex((m) => m.to > head);
  reveal(view, query, at === -1 ? 0 : at, matches);
}

export function moveFind(view, dir) {
  const { query } = view.state.field(findField);
  const matches = findMatches(view.state.doc, query);
  if (!matches.length) return;
  const cur = view.state.field(findField).current;
  reveal(view, query, (cur + dir + matches.length) % matches.length, matches);
}

export function clearFind(view) {
  view.dispatch({ effects: setFindEffect.of(null) });
}

export function findInfo(view) {
  const { query, current } = view.state.field(findField);
  if (!query) return { current: 0, total: 0 };
  const total = findMatches(view.state.doc, query).length;
  return { current: total ? current + 1 : 0, total };
}
