import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { syntaxHighlighting } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import SandboxModal from "./SandboxModal.jsx";
import SandboxExternalModal from "./SandboxExternalModal.jsx";
import EditorFind from "./EditorFind.jsx";
import MarkdownSidebar from "./MarkdownSidebar.jsx";
import MarkdownPreview from "./MarkdownPreview.jsx";
import { codeServices } from "../editor/services.js";
import { codeHighlightStyle } from "../editor/highlight.js";
import { markdownEditorTheme } from "../editor/theme.js";
import { sandboxPreview } from "../codemirror/index.js";
import { findSandboxBlocks, specToToolbar } from "../core/index.js";
import { readKey, writeKey } from "../core/frontmatter.js";

// The whole markdown editor: a title field, the body in CodeMirror with its figure cards and
// slash commands, the find bar, a rendered preview, and a sidebar on the right with the
// frontmatter and an outline of the sandboxes. Opening a block puts its code in the writing
// column and its figure, settings and console in the sidebar. A host renders it and says
// what it needs:
//
//   initialDoc                      the body, seeded once (a different one is a remount, or setDoc)
//   frontmatter, onFrontmatterChange  the frontmatter block as a string, controlled; left out,
//                                   there is no frontmatter section and no title field
//   onChange(doc)                   the body, once typing pauses for `changeDelay` ms
//   preview                         show the rendered document in place of the editor
//   defaults                        what `/snippet` opens with, e.g. `{ w: 480, h: 480 }`
//   draftKey                        scopes the modals' unsaved drafts, e.g. the document's id
//   codeLanguages                   highlighting for ordinary fences (@codemirror/language-data)
//   sidebarKey                      where the sidebar's width and folds are remembered
//   children                        the host's own controls, laid over the writing column
//
// and drives it through the ref: getDoc, setDoc, focus, scrollToTop, openBlock(index),
// revealBlock(index), closeBlock, and `view` for anything else.
const MarkdownEditor = forwardRef(function MarkdownEditor(
  {
    initialDoc = "",
    onChange,
    onBlocks,
    changeDelay = 150,
    frontmatter,
    onFrontmatterChange,
    titleKey = "title",
    titlePlaceholder = "Untitled",
    preview = false,
    defaults,
    draftKey,
    codeLanguages,
    extensions = [],
    sidebar = true,
    sidebarKey = "sbx-md-sidebar",
    autoFocus = false,
    className = "",
    children,
  },
  ref,
) {
  const rootRef = useRef(null);
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  // Kept as the document rather than the view, so it is still readable while the view is
  // being torn down — a host flushing its last save on unmount reads it then.
  const docRef = useRef(null);
  const timer = useRef(null);

  const [doc, setDoc] = useState(initialDoc);
  const [editing, setEditing] = useState(null);
  // The sidebar's slots for an open block's preview, settings and console. Missing — the
  // sidebar folded or left out — the modal draws all three itself, as it does standalone.
  const [dock, setDock] = useState({});
  const onSlot = useCallback((name, el) => setDock((d) => (d[name] === el ? d : { ...d, [name]: el })), []);

  // The view is created once, but its callbacks need current props and state.
  const live = useRef({});
  live.current = { onChange, editing };

  const readDoc = () => (docRef.current ? docRef.current.toString() : doc);

  // Brings `doc` level with the editor now rather than when the pause ends.
  const flush = () => {
    if (timer.current == null) return;
    clearTimeout(timer.current);
    timer.current = null;
    const next = readDoc();
    setDoc(next);
    live.current.onChange?.(next);
  };

  const hasFrontmatter = frontmatter != null;
  const title = hasFrontmatter && titleKey ? readKey(frontmatter, titleKey) : "";
  const setTitle = (value) => onFrontmatterChange?.(writeKey(frontmatter, titleKey, value));

  const blocks = useMemo(() => findSandboxBlocks(doc), [doc]);
  // The modal knows its fence only as a range, so its block is the one that range covers;
  // `save` keeps the range in step as the fence is rewritten.
  const active = useMemo(
    () => (editing ? blocks.findIndex((b) => b.from >= editing.from && b.to <= editing.to) : -1),
    [blocks, editing],
  );

  const onBlocksRef = useRef(onBlocks);
  onBlocksRef.current = onBlocks;
  useEffect(() => { onBlocksRef.current?.({ blocks, active }); }, [blocks, active]);

  // The preview renders `doc`, which may be a pause behind the text.
  useEffect(() => { if (preview) flush(); }, [preview]);

  // Everything in the document except `self` — a block must not be its own sibling, or
  // visualizing a source block would run its code as both prelude and body.
  const siblingsOf = (self) => findSandboxBlocks(readDoc()).filter((b) => b.from !== self?.from);

  const open = (block) => {
    const { editing } = live.current;
    // Already the open one: reopening would remount the modal and lose what is half-typed.
    if (editing && block.from >= editing.from && block.to <= editing.to) return;
    // `active` matches by offset, so it cannot be a pause behind the text.
    flush();
    const base = { from: block.from, to: block.to, siblings: siblingsOf(block) };
    if (block.kind === "external") {
      setEditing({ ...base, modal: "external", initial: { code: block.code, label: block.label || "" } });
    } else {
      // `specToToolbar` leaves `viz` empty for a shared source, which opens the modal
      // without its figure half.
      setEditing({ ...base, modal: block.kind === "source" ? "source" : "figure", initial: { ...specToToolbar(block), code: block.code } });
    }
  };

  // `initial` arrives from sandboxPreview already filled out from `defaults`.
  const create = (kind, pos, initial) => {
    const base = { from: pos, to: pos, siblings: siblingsOf() };
    if (kind === "external") setEditing({ ...base, modal: "external", initial });
    else setEditing({ ...base, modal: initial.viz ? "figure" : "source", initial });
  };

  const actions = useRef({});
  actions.current = { open, create };

  useEffect(() => {
    const view = new EditorView({
      state: EditorState.create({
        doc: initialDoc,
        extensions: [
          ...codeServices(),
          markdownEditorTheme,
          syntaxHighlighting(codeHighlightStyle),
          markdown({ base: markdownLanguage, codeLanguages }),
          sandboxPreview({
            onEdit: (b) => actions.current.open(b),
            onCreate: (kind, pos, initial) => actions.current.create(kind, pos, initial),
            defaults,
          }),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return;
            docRef.current = u.state.doc;
            clearTimeout(timer.current);
            timer.current = setTimeout(() => {
              timer.current = null;
              const next = u.state.doc.toString();
              setDoc(next);
              live.current.onChange?.(next);
            }, changeDelay);
          }),
          ...extensions,
        ],
      }),
      parent: hostRef.current,
    });
    viewRef.current = view;
    if (autoFocus) view.focus();
    return () => {
      // An edit still waiting out the pause is handed over now, not dropped.
      if (timer.current != null) {
        clearTimeout(timer.current);
        timer.current = null;
        live.current.onChange?.(view.state.doc.toString());
      }
      view.destroy();
      viewRef.current = null;
    };
    // Created once; the document is only replaced deliberately, through setDoc.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function save(fence, { keepOpen = false } = {}) {
    const view = viewRef.current;
    if (!view || !editing) return setEditing(null);
    const { from, to } = editing;
    // A fence must start its own line, or the markdown parser will not see it.
    const insert = from > 0 && view.state.doc.sliceString(from - 1, from) !== "\n" ? "\n" + fence : fence;
    const below = view.state.doc.sliceString(to, to + 1) === "\n" ? 1 : 0;
    view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length + below } });
    if (keepOpen) setEditing((s) => (s ? { ...s, to: from + insert.length } : s));
    else { setEditing(null); view.focus(); }
  }

  const cancel = useCallback(() => {
    setEditing(null);
    viewRef.current?.focus();
  }, []);

  // By position rather than by block: a list drawn from `blocks` may be a pause behind the
  // text, so the block itself is read off the editor when asked for.
  const openBlock = (index) => {
    const block = findSandboxBlocks(readDoc())[index];
    if (block) open(block);
  };
  const openRef = useRef(openBlock);
  openRef.current = openBlock;
  const onOpenRow = useCallback((index) => openRef.current(index), []);

  useImperativeHandle(ref, () => ({
    get view() { return viewRef.current; },
    getDoc: readDoc,
    setDoc(next) {
      const view = viewRef.current;
      if (view) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
      flush();
    },
    focus() { viewRef.current?.focus(); },
    // Two surfaces scroll, never at once: the preview, or the document column with
    // CodeMirror's own scroller inside it. The editor needs both — the dispatch moves the
    // text, the column brings the title back down with it.
    scrollToTop() {
      const top = (sel) => rootRef.current?.querySelector(sel)?.scrollTo({ top: 0, behavior: "smooth" });
      if (preview) return top(".sbx-md-preview");
      viewRef.current?.dispatch({ effects: EditorView.scrollIntoView(0, { y: "start" }) });
      top(".sbx-md-doc");
      top(".sbx-md-body");
    },
    openBlock,
    revealBlock(index) {
      const view = viewRef.current;
      const block = findSandboxBlocks(readDoc())[index];
      if (!view || !block) return;
      view.dispatch({ selection: { anchor: block.from }, effects: EditorView.scrollIntoView(block.from, { y: "center" }) });
      view.focus();
    },
    closeBlock: cancel,
  }));

  // One draft slot per kind of modal, scoped by the host's key; the modal adds the target.
  const draft = (kind) => (draftKey ? `${kind}:${draftKey}` : undefined);

  return (
    <div className={["sbx-md", className].filter(Boolean).join(" ")} ref={rootRef}>
      {/* The writing column and what floats over it: the modals fill it, and the host's
          controls measure from it. */}
      <div className="sbx-md-main">
        {/* Kept mounted while previewing: unmounting CodeMirror would throw away the cursor,
            the selection and the undo history. */}
        <div className={`sbx-md-doc ${preview ? "is-hidden" : ""}`}>
          {hasFrontmatter && titleKey && (
            <div className="sbx-md-titlebar">
              <input
                className="sbx-md-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={titlePlaceholder}
                aria-label="Title"
                spellCheck={false}
                // Moving to the body is what Enter obviously means in a one-line field, and
                // ArrowDown too once the caret is at the end.
                onKeyDown={(e) => {
                  const el = e.target;
                  const atEnd = el.selectionStart === el.value.length && el.selectionStart === el.selectionEnd;
                  if (e.key === "Enter" || (e.key === "ArrowDown" && atEnd)) {
                    e.preventDefault();
                    viewRef.current?.focus();
                  }
                }}
              />
            </div>
          )}
          <div className="sbx-md-body" ref={hostRef} />
        </div>
        {preview && <MarkdownPreview markdown={doc} title={title} />}

        {children}

        {(editing?.modal === "figure" || editing?.modal === "source") && (
          <SandboxModal
            variant="inline"
            targetKey={editing.from}
            initial={editing.initial}
            siblings={editing.siblings}
            draftKey={draft(editing.modal)}
            dock={sidebar ? dock : undefined}
            onSave={save}
            onCancel={cancel}
          />
        )}
        {editing?.modal === "external" && (
          <SandboxExternalModal
            variant="inline"
            targetKey={editing.from}
            initial={editing.initial}
            onSave={save}
            onCancel={cancel}
          />
        )}

        <EditorFind viewRef={viewRef} scopeRef={rootRef} />
      </div>

      {sidebar && (
        <MarkdownSidebar
          storageKey={sidebarKey}
          frontmatter={frontmatter}
          onFrontmatter={onFrontmatterChange}
          blocks={blocks}
          active={active}
          editing={editing != null}
          onOpen={onOpenRow}
          onClose={cancel}
          onSlot={onSlot}
        />
      )}
    </div>
  );
});

export default MarkdownEditor;
