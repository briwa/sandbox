// CodeMirror theme for the markdown editor.
//
// Scoped through `EditorView.theme` rather than written as global CSS: these selectors
// (`.cm-tooltip`, `.cm-content`) also match the CodeMirror instances inside the figure
// modals, and global rules would reach in and restyle those too.
//
// The autocomplete popup is the part that needs it most. `sandboxPreview` registers the
// slash-command completions, and without this they render in CodeMirror's stock light
// palette — a white panel with a blue selection bar, unreadable against a dark page.
import { EditorView } from '@codemirror/view';

const MONO = 'var(--sbx-mono)';
const SELECTION = 'color-mix(in srgb, var(--sbx-accent) 28%, transparent)';

export const markdownEditorTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', color: 'var(--sbx-ink)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-content': { fontFamily: MONO, caretColor: 'var(--sbx-ink)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--sbx-ink)' },

  // Native selection when drawSelection is off, and CodeMirror's own layer when it is on.
  '.cm-line::selection, .cm-line ::selection': { backgroundColor: SELECTION },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: SELECTION },

  '.cm-tooltip.cm-tooltip-autocomplete': {
    backgroundColor: 'var(--sbx-surface)',
    border: '1px solid var(--sbx-rule)',
    borderRadius: '7px',
    boxShadow: '0 6px 20px rgba(0, 0, 0, 0.28)',
    overflow: 'hidden',
    padding: '3px',
  },
  '.cm-tooltip-autocomplete > ul': { fontFamily: MONO, fontSize: '0.82rem', maxHeight: '16rem' },
  '.cm-tooltip-autocomplete > ul > li': {
    color: 'var(--sbx-ink)',
    padding: '3px 7px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.5rem',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'color-mix(in srgb, var(--sbx-accent) 22%, transparent)',
    color: 'var(--sbx-ink)',
  },
  // The labels already read as commands, so CodeMirror's type glyph is noise.
  '.cm-completionIcon': { display: 'none' },
  '.cm-completionLabel': { color: 'var(--sbx-ink)' },
  '.cm-completionMatchedText': { textDecoration: 'none', color: 'var(--sbx-accent)', fontWeight: '700' },
  '.cm-completionDetail': { color: 'var(--sbx-muted)', fontStyle: 'normal', marginLeft: 'auto', paddingLeft: '1.5rem' },
  '.cm-tooltip.cm-completionInfo': {
    backgroundColor: 'var(--sbx-surface)',
    border: '1px solid var(--sbx-rule)',
    borderRadius: '7px',
    color: 'var(--sbx-ink)',
    padding: '0.5rem 0.6rem',
  },
});
