import { EditorView, keymap } from "@codemirror/view";
import { history, historyKeymap, defaultKeymap, indentMore, indentLess } from "@codemirror/commands";
import { indentUnit, indentOnInput } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { editorFind } from "./find.js";

const tabIndent = ({ state, dispatch }) => {
  if (state.selection.ranges.some((r) => !r.empty)) return indentMore({ state, dispatch });
  dispatch(state.update(state.replaceSelection(state.facet(indentUnit)), { scrollIntoView: true, userEvent: "input" }));
  return true;
};

export const codeKeybindings = [...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, { key: "Tab", run: tabIndent, shift: indentLess }];

export function codeServices(extraKeys = []) {
  return [
    history(),
    EditorView.lineWrapping,
    indentUnit.of("  "),
    indentOnInput(),
    closeBrackets(),
    editorFind,
    keymap.of([...codeKeybindings, ...extraKeys]),
  ];
}
