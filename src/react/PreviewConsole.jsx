import { useLayoutEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { getCodeFenceSetting, setCodeFenceSetting } from "./storage.js";

const MAX_ENTRIES = 500;
let seq = 0;

export function appendConsole(prev, entries) {
  let next = prev.slice();
  for (const { level, text } of entries) {
    if (level === "clear") next = [];
    else next.push({ id: ++seq, text });
  }
  return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
}

export default function PreviewConsole({ logs, onClear }) {
  const [open, setOpen] = useState(() => getCodeFenceSetting("consoleOpen", false));
  const listRef = useRef(null);
  const pinnedRef = useRef(true);

  const toggle = () => { setOpen(!open); setCodeFenceSetting("consoleOpen", !open); };

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [logs, open]);

  const onScroll = () => {
    const el = listRef.current;
    if (el) pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
  };

  return (
    <div className={`sbx-console ${open ? "is-open" : ""}`}>
      <div className="sbx-console-head">
        <button className="sbx-console-toggle" onClick={toggle} aria-expanded={open} title={open ? "Hide console" : "Show console"}>
          <Icon name={open ? "chevronDown" : "chevronRight"} size={12} />
          <span>Console</span>
          {logs.length > 0 && <span className="sbx-console-count">({logs.length})</span>}
        </button>
        {open && logs.length > 0 && (
          <button className="sbx-ctl sbx-icon" onClick={onClear} title="Clear console" aria-label="Clear console">
            <Icon name="trash" size={12} />
          </button>
        )}
      </div>
      {open && (
        <div className="sbx-console-list" ref={listRef} onScroll={onScroll} role="log">
          {logs.length === 0 && <div className="sbx-console-empty">No output</div>}
          {logs.map((l) => <div key={l.id} className="sbx-console-entry">{l.text}</div>)}
        </div>
      )}
    </div>
  );
}
