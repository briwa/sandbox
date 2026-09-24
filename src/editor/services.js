import { EditorView, keymap } from "@codemirror/view";
import { history, historyKeymap, defaultKeymap, indentMore, indentLess, redo } from "@codemirror/commands";
import { indentUnit, indentOnInput } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { editorFind } from "./find.js";
import { editorErrors } from "./errors.js";
import { multiCursor, multiCursorKeymap } from "./multicursor.js";

const tabIndent = ({ state, dispatch }) => {
  if (state.selection.ranges.some((r) => !r.empty)) return indentMore({ state, dispatch });
  dispatch(state.update(state.replaceSelection(state.facet(indentUnit)), { scrollIntoView: true, userEvent: "input" }));
  return true;
};

export const codeKeybindings = [...closeBracketsKeymap, ...multiCursorKeymap, ...defaultKeymap, ...historyKeymap, { key: "Mod-y", run: redo, preventDefault: true }, { key: "Tab", run: tabIndent, shift: indentLess }];

export function codeServices(extraKeys = []) {
  return [
    history(),
    EditorView.lineWrapping,
    EditorView.theme({ ".cm-content": { caretColor: "currentColor" } }),
    indentUnit.of("  "),
    indentOnInput(),
    closeBrackets(),
    multiCursor,
    editorFind,
    editorErrors,
    keymap.of([...codeKeybindings, ...extraKeys]),
  ];
}
