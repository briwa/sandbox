import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { setFind, moveFind, clearFind, findInfo } from "../editor/find.js";

// Marks the region a find bar searches within. Bars nest — the fence editor's
// sits inside the surrounding page editor's — so ownership of the keystroke
// cannot be "my scope contains the focus": both would say yes. It is the
// innermost mark around the focus that owns it, which is the editor being typed
// in. A bar carries the mark too, so typing into one does not read as focus in
// the editor around it.
const SCOPE = "data-find-scope";

export default function EditorFind({ viewRef, scopeRef }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [info, setInfo] = useState({ current: 0, total: 0 });
  const inputRef = useRef(null);
  const barRef = useRef(null);

  const refresh = () => { const v = viewRef.current; if (v) setInfo(findInfo(v)); };

  useEffect(() => { if (open) { inputRef.current?.focus(); inputRef.current?.select(); } }, [open]);
  const move = (dir) => { const v = viewRef.current; if (v) { moveFind(v, dir); refresh(); } };
  // Closing for a nested bar leaves the focus where it is: the caret is already
  // in the inner editor, and pulling it back out is the fight this avoids.
  const close = ({ refocus = true } = {}) => {
    setOpen(false);
    const v = viewRef.current;
    if (v) { clearFind(v); if (refocus) v.focus(); }
  };

  useEffect(() => {
    const els = [scopeRef?.current, barRef.current].filter(Boolean);
    for (const el of els) el.setAttribute(SCOPE, "");
    return () => { for (const el of els) el.removeAttribute(SCOPE); };
  }, [open]);

  useEffect(() => {
    const onKey = (e) => {
      const bar = inputRef.current;
      const inBar = bar && document.activeElement === bar;
      if ((e.metaKey || e.ctrlKey) && (e.key === "f" || e.key === "F")) {
        const v = viewRef.current;
        const scope = scopeRef?.current;
        const owner = document.activeElement?.closest?.(`[${SCOPE}]`) ?? null;
        const mine = inBar || (!!scope && owner === scope);
        if (!mine) {
          // Another editor has the focus, so the keystroke is its bar's. This
          // one stands down instead of leaving its matches lit in a document
          // nobody is searching any more — one find at a time, wherever the
          // caret is.
          if (open) close({ refocus: false });
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);

        const sel = v?.state.selection.main;
        if (sel && !sel.empty && sel.to - sel.from < 100) {
          const text = v.state.sliceDoc(sel.from, sel.to);
          setQuery(text);
          setFind(v, text);
          refresh();
        }

        if (open && bar) { bar.focus(); bar.select(); }
        return;
      }
      if (!open || !inBar) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); }
      else if (e.key === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); move(e.shiftKey ? -1 : 1); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  if (!open) return null;

  const onChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    const v = viewRef.current;
    if (v) { setFind(v, q); refresh(); }
  };

  return (
    <div className="editor-find" role="search" ref={barRef}>
      <input
        ref={inputRef}
        className="editor-find-input"
        value={query}
        onChange={onChange}
        placeholder="Find"
        aria-label="Find in editor"
        spellCheck={false}
      />
      <span className={`editor-find-count ${query && !info.total ? "is-none" : ""}`}>
        {query ? `${info.current}/${info.total}` : ""}
      </span>
      <button className="editor-find-btn" onClick={() => move(-1)} disabled={!info.total} aria-label="Previous match" title="Previous (⇧⏎)">
        <Icon name="chevronUp" size={17} />
      </button>
      <button className="editor-find-btn" onClick={() => move(1)} disabled={!info.total} aria-label="Next match" title="Next (⏎)">
        <Icon name="chevronDown" size={17} />
      </button>
      <button className="editor-find-btn" onClick={close} aria-label="Close find" title="Close (Esc)">
        <Icon name="close" size={17} />
      </button>
    </div>
  );
}
