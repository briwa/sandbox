import { useEffect, useRef, useState } from "react";
import { EditorView, lineNumbers } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { syntaxHighlighting, codeFolding, foldGutter, foldKeymap, bracketMatching } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { vue } from "@codemirror/lang-vue";
import Icon from "./Icon.jsx";
import EditorFind from "./EditorFind.jsx";
import { codeServices } from "../editor/services.js";
import { figureBg } from "../client/index.js";
import { codeHighlightStyle } from "../editor/highlight.js";
import { loadSandboxDraft, saveSandboxDraft, clearSandboxDraft } from "./storage.js";
import { getCodeFenceSetting, setCodeFenceSetting } from "./storage.js";
import {
  SANDBOX_TYPES,
  CONTROL_MODES,
  buildSandboxFence,
  buildLibFence,
  buildSrcdoc,
  buildVueSrcdoc,
  sandboxPrelude,
  sandboxExternals,
  sandboxVueComponents,
} from "../core/index.js";

const langCompartment = new Compartment();

const langSupport = (name) => (name === "vue" ? vue() : javascript());

function buildPreview({ type, w, h, bg, id }, code, siblings) {
  if (type === "vue") {
    return buildVueSrcdoc({ w, h, bg }, code, {
      externals: sandboxExternals(siblings, id),
      components: sandboxVueComponents(siblings, id),
    });
  }
  const spec = { preset: type, w, h, bg, control: 'manual', id };
  return buildSrcdoc(spec, code, sandboxPrelude(siblings, id), sandboxExternals(siblings, id));
}

export default function SandboxModal({ kind = "figure", initial, siblings = [], onSave, onCancel, draftKey }) {
  const isFigure = kind === "figure";

  const [restored] = useState(() => (draftKey ? loadSandboxDraft(draftKey) : null));
  const seed = restored ?? initial;

  const [type, setType] = useState(seed.type || "canvas");
  const [w, setW] = useState(seed.w || 640);
  const [h, setH] = useState(seed.h || 360);
  const [bg, setBg] = useState(seed.bg || "");
  const [showCode, setShowCode] = useState(Boolean(seed.showCode));
  const [control, setControl] = useState(seed.control || "pausable");
  const [preview, setPreview] = useState(Boolean(seed.preview));

  const [srcLang, setSrcLang] = useState(seed.srcLang || "js");
  const [name, setName] = useState(seed.name || "");

  const [groupId, setGroupId] = useState(seed.id || "");
  const [srcdoc, setSrcdoc] = useState("");
  const [previewW, setPreviewW] = useState(initial.w || 640);
  const [previewH, setPreviewH] = useState(initial.h || 360);
  const [playing, setPlaying] = useState(false);

  const [frameKey, setFrameKey] = useState(0);
  const [dirty, setDirty] = useState(false);

  const [split, setSplit] = useState(() => getCodeFenceSetting("splitRatio", 0.5));
  const [dragging, setDragging] = useState(false);

  const bodyRef = useRef(null);
  const hostRef = useRef(null);
  const cmRef = useRef(null);
  const frameRef = useRef(null);
  const saveRef = useRef(null);
  const metaInitRef = useRef(false);
  const draftInitRef = useRef(false);
  const clearedRef = useRef(false);
  const persistRef = useRef(null);
  const saveTimer = useRef(null);

  const codeLang = isFigure ? (type === "vue" ? "vue" : "javascript") : (srcLang === "vue" ? "vue" : "javascript");
  const canPlay = isFigure && type !== "vue";
  const canReset = isFigure && (type === "canvas" || type === "root");

  function updatePreview() {
    if (!isFigure) return;
    const body = cmRef.current ? cmRef.current.state.doc.toString() : seed.code || "";
    const width = Number(w) || 0;
    const height = Number(h) || 0;

    setSrcdoc(buildPreview({ type, w: width, h: height, bg: bg || figureBg(), id: groupId }, body, siblings));
    setPreviewW(width || 640);
    setPreviewH(height || 360);
    setFrameKey((k) => k + 1);
    setDirty(false);
  }

  const persist = () => {
    if (!draftKey || clearedRef.current) return;
    const code = cmRef.current ? cmRef.current.state.doc.toString() : (seed.code || "");
    saveSandboxDraft(draftKey, { type, w, h, bg, showCode, control, preview, srcLang, name, id: groupId, code });
  };
  persistRef.current = persist;
  const scheduleSave = () => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persistRef.current?.(), 500);
  };
  const scheduleSaveRef = useRef(scheduleSave);
  scheduleSaveRef.current = scheduleSave;

  const finishDraft = () => { clearedRef.current = true; clearTimeout(saveTimer.current); if (draftKey) clearSandboxDraft(); };

  useEffect(() => {
    const view = new EditorView({
      state: EditorState.create({
        doc: seed.code || "",
        extensions: [
          lineNumbers(),
          codeFolding(),
          foldGutter({ openText: "⌄", closedText: "›" }),

          ...codeServices(foldKeymap),

          bracketMatching(),
          langCompartment.of(langSupport(codeLang)),
          syntaxHighlighting(codeHighlightStyle, { fallback: true }),

          EditorView.theme({
            "&": { height: "100%", color: "var(--astro-code-foreground, var(--sbx-ink))", background: "var(--astro-code-background, var(--sbx-surface))" },
            ".cm-content": { caretColor: "var(--astro-code-foreground, var(--sbx-ink))" },

            ".cm-scroller": { fontFamily: "'Roboto Mono', ui-monospace, 'SF Mono', monospace", fontSize: "0.85rem", lineHeight: "1.7", paddingBottom: "40vh" },
            "&.cm-focused": { outline: "none" },
            ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { background: "color-mix(in srgb, var(--astro-code-foreground, var(--sbx-ink)) 22%, transparent)" },

            ".cm-gutters": { background: "transparent", border: "none", color: "color-mix(in srgb, var(--astro-code-foreground, var(--sbx-ink)) 40%, transparent)" },
            ".cm-lineNumbers .cm-gutterElement": { padding: "0 6px 0 8px", minWidth: "2ch" },

            ".cm-foldGutter .cm-gutterElement": { padding: "0 4px", cursor: "pointer", opacity: 0, transition: "opacity 0.12s", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.05rem", lineHeight: "1.7" },
            ".cm-gutters:hover .cm-foldGutter .cm-gutterElement": { opacity: 0.55 },
            ".cm-foldGutter .cm-gutterElement:hover": { opacity: 1 },

            ".cm-foldGutter [title='Fold line']": { transform: "translateY(-4px)" },
            ".cm-foldGutter [title='Unfold line']": { transform: "translateY(-2px)" },

            ".cm-foldPlaceholder": { background: "color-mix(in srgb, var(--astro-code-foreground, var(--sbx-ink)) 12%, transparent)", border: "none", color: "var(--astro-code-token-comment, var(--sbx-ink))", borderRadius: "4px", padding: "0 6px", margin: "0 2px" },
          }),
          EditorView.updateListener.of((u) => {

            if (u.docChanged) { setDirty(true); scheduleSaveRef.current(); }
          }),
        ],
      }),
      parent: hostRef.current,
    });
    cmRef.current = view;
    view.focus();
    updatePreview();
    return () => { view.destroy(); cmRef.current = null; };
  }, []);

  useEffect(() => {
    if (cmRef.current) cmRef.current.dispatch({ effects: langCompartment.reconfigure(langSupport(codeLang)) });
  }, [codeLang]);

  useEffect(() => {
    if (!metaInitRef.current) { metaInitRef.current = true; return; }
    setDirty(true);
  }, [type, w, h, bg, groupId, srcLang, name]);

  useEffect(() => {
    if (!draftInitRef.current) { draftInitRef.current = true; return; }
    scheduleSaveRef.current();
  }, [type, w, h, bg, showCode, control, preview, srcLang, name, groupId]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const flush = () => persistRef.current?.();
    window.addEventListener("pagehide", flush);
    return () => { clearTimeout(saveTimer.current); window.removeEventListener("pagehide", flush); };
  }, []);

  useEffect(() => { setPlaying(false); }, [frameKey]);

  useEffect(() => {
    const onMessage = (e) => {
      if (!frameRef.current || frameRef.current.contentWindow !== e.source || !e.data) return;
      if (e.data.__sandboxReset) { setPlaying(false); return; }
      const height = e.data.__sandboxHeight;
      if (typeof height !== "number" || height <= 0) return;

      const frame = frameRef.current;
      const natural = previewW > 0 ? (frame.clientWidth * previewH) / previewW : 0;
      frame.style.height = natural > 0 && height <= natural + 1 ? "" : height + "px";
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [previewW, previewH]);

  useEffect(() => {
    const onKey = (e) => {

      if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        saveRef.current?.();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  function togglePlay() {
    const win = frameRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(playing ? { __figpause: true } : { __figplay: true }, "*");
    setPlaying(!playing);
  }

  function resetFrame() {
    if (canReset) frameRef.current?.contentWindow?.postMessage({ __figreset: true }, "*");
    else setFrameKey((k) => k + 1);
  }

  function startResize(e) {
    e.preventDefault();
    setDragging(true);
    let ratio = split;
    const move = (ev) => {
      const rect = bodyRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      ratio = Math.min(0.85, Math.max(0.15, (ev.clientX - rect.left) / rect.width));
      setSplit(ratio);
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setCodeFenceSetting("splitRatio", ratio);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function save() {
    const body = cmRef.current ? cmRef.current.state.doc.toString() : seed.code || "";
    if (isFigure) {
      const state = { type, w: Number(w) || undefined, h: Number(h) || undefined, bg, showCode, control, preview, id: groupId };
      onSave(buildSandboxFence(state, body), { keepOpen: true });
      updatePreview();
    } else {
      finishDraft();
      const fence = srcLang === "vue"
        ? buildLibFence({ kind: "vue", name, id: groupId }, body)
        : buildLibFence({ kind: "source", label: name, id: groupId }, body);
      onSave(fence);
    }
  }
  saveRef.current = save;

  function requestClose() {
    if (dirty && !window.confirm("You have unsaved changes. Close and discard them?")) return;
    finishDraft();
    onCancel();
  }

  const isVue = type === "vue";

  return (
    <div className="sbx-modal" role="dialog" aria-modal="true" aria-label={isFigure ? "Edit sandbox figure" : "Edit shared library"}>
      <div className="sbx-head">
        <div className="sbx-toolbar">
          {isFigure ? (
            <>
              <label className="sbx-field">
                <span>Type</span>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  {SANDBOX_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="sbx-field">
                <span>Size</span>
                <span className="sbx-size">
                  <input type="number" min="1" value={w} onChange={(e) => setW(e.target.value)} aria-label="Width" />
                  <span aria-hidden="true">×</span>
                  <input type="number" min="1" value={h} onChange={(e) => setH(e.target.value)} aria-label="Height" />
                </span>
              </label>
              <label className="sbx-field">
                <span>Background</span>
                <input type="text" placeholder="#111 / transparent" value={bg} onChange={(e) => setBg(e.target.value)} />
              </label>
              <label className="sbx-field">
                <span>Group</span>
                <input type="text" placeholder="id" value={groupId} onChange={(e) => setGroupId(e.target.value)} />
              </label>
              {!isVue && (
                <label className="sbx-field">
                  <span>Controls</span>
                  <select value={control} onChange={(e) => setControl(e.target.value)}>
                    {CONTROL_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
              )}
              <div className="sbx-toggles">
                <label className="sbx-check"><input type="checkbox" checked={showCode} onChange={(e) => setShowCode(e.target.checked)} /> show code</label>
                <label className="sbx-check"><input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} /> cover</label>
              </div>
            </>
          ) : (
            <>
              <label className="sbx-field">
                <span>Language</span>
                <select value={srcLang} onChange={(e) => setSrcLang(e.target.value)}>
                  <option value="js">js source</option>
                  <option value="vue">vue component</option>
                </select>
              </label>
              <label className="sbx-field">
                <span>{srcLang === "vue" ? "Component name" : "Label"}</span>
                <input
                  type="text"
                  placeholder={srcLang === "vue" ? "MyWidget" : "what this is"}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="sbx-field">
                <span>Group</span>
                <input type="text" placeholder="id" value={groupId} onChange={(e) => setGroupId(e.target.value)} />
              </label>
            </>
          )}
        </div>
        <div className="sbx-actions">
          {!isFigure && dirty && (
            <button className="sbx-btn sbx-icon save" onClick={save} title="Save (⌘S)" aria-label="Save">
              <Icon name="save" size={17} />
            </button>
          )}
          <button className="sbx-btn sbx-icon" onClick={requestClose} title="Close" aria-label="Close">
            <Icon name="close" size={17} />
          </button>
        </div>
      </div>
      <div
        ref={bodyRef}
        className={`sbx-body ${isFigure ? "" : "sbx-body-solo"} ${dragging ? "sbx-dragging" : ""}`}
        style={isFigure ? { "--sbx-code-grow": split, "--sbx-prev-grow": 1 - split } : undefined}
      >
        <div className="sbx-code-pane">
          <div className="sbx-code" ref={hostRef} />
          <EditorFind viewRef={cmRef} scopeRef={hostRef} />
          {isFigure && dirty && (
            <button
              className="sbx-save-fab"
              onClick={save}
              title="Save (⌘S)"
              aria-label="Save"
            >
              <Icon name="save" size={16} />
            </button>
          )}
        </div>
        {isFigure && (
          <div
            className="sbx-divider"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize editor and preview"
            onPointerDown={startResize}
          />
        )}
        {isFigure && (
          <div className="sbx-preview">
            <div className="sbx-controls" role="toolbar" aria-label="Preview controls">
              {canPlay && (
                <button className="sbx-ctl sbx-icon" onClick={togglePlay} title={playing ? "Pause" : "Play"} aria-label={playing ? "Pause" : "Play"}>
                  <Icon name={playing ? "pause" : "play"} size={16} />
                </button>
              )}
              <button className="sbx-ctl sbx-icon" onClick={resetFrame} title="Restart the preview" aria-label="Restart the preview">
                <Icon name="reset" size={16} />
              </button>
            </div>
            <iframe
              key={frameKey}
              ref={frameRef}
              className="sbx-frame"
              style={{ width: `${previewW}px`, maxWidth: "100%", aspectRatio: `${previewW} / ${previewH}` }}
              sandbox="allow-scripts"
              title="live figure preview"
              srcDoc={srcdoc}
            />
          </div>
        )}
      </div>
    </div>
  );
}
