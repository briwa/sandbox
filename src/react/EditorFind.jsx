import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { setFind, moveFind, clearFind, findInfo } from "../editor/find.js";

export default function EditorFind({ viewRef, scopeRef }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [info, setInfo] = useState({ current: 0, total: 0 });
  const inputRef = useRef(null);

  const refresh = () => { const v = viewRef.current; if (v) setInfo(findInfo(v)); };

  useEffect(() => { if (open) { inputRef.current?.focus(); inputRef.current?.select(); } }, [open]);
  const move = (dir) => { const v = viewRef.current; if (v) { moveFind(v, dir); refresh(); } };
  const close = () => {
    setOpen(false);
    const v = viewRef.current;
    if (v) { clearFind(v); v.focus(); }
  };

  useEffect(() => {
    const onKey = (e) => {
      const bar = inputRef.current;
      const inBar = bar && document.activeElement === bar;
      if ((e.metaKey || e.ctrlKey) && (e.key === "f" || e.key === "F")) {
        const v = viewRef.current;
        const inScope = scopeRef?.current?.contains(document.activeElement);
        if (!open && !inScope && !inBar) return;
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
    <div className="editor-find" role="search">
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
