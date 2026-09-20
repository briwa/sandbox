import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { buildSandboxFence, externalName, safeUrl } from "../core/index.js";
import { targetIdentity } from "./target.js";

export default function SandboxExternalModal({ targetKey, initial, ...rest }) {
  return <ExternalEditor key={targetIdentity(targetKey, initial)} initial={initial} {...rest} />;
}

function ExternalEditor({ variant = "fixed", className = "", initial, onSave, onCancel }) {
  const [urls, setUrls] = useState(initial.code || "");
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const lines = urls.split(/\s+/).filter(Boolean);
  const good = lines.filter(safeUrl);
  const bad = lines.filter((u) => !safeUrl(u));

  function save() {
    onSave(buildSandboxFence({ kind: "external" }, good.join("\n")));
  }

  return (
    <div
      className={["sbx-overlay", variant === "inline" ? "is-inline" : "", className].filter(Boolean).join(" ")}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="sbx-dialog" role="dialog" aria-modal={variant === "inline" ? undefined : "true"} aria-label="External library">
        <h2 className="sbx-dialog-title">External library</h2>
        <label className="sbx-field sbx-field-block">
          <span>URLs — one https .js per line</span>
          <textarea
            ref={inputRef}
            className="sbx-urls"
            rows={4}
            placeholder="https://cdn.jsdelivr.net/npm/…/dist/thing.min.js"
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
          />
        </label>
        {good.length > 0 && (
          <p className="sbx-note">Reads as {good.map(externalName).join(", ")}</p>
        )}
        {bad.length > 0 && (
          <p className="sbx-warn">Ignored (not an https .js URL): {bad.join(", ")}</p>
        )}
        <div className="sbx-actions">
          <button className="sbx-btn save" onClick={save} disabled={!good.length} title="Save">
            <Icon name="check" size={17} /> Save
          </button>
          <button className="sbx-btn" onClick={onCancel} title="Cancel">
            <Icon name="close" size={17} /> Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
