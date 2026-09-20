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
import { targetIdentity } from "./target.js";
import { getCodeFenceSetting, setCodeFenceSetting } from "./storage.js";
import {
  VIZ_SURFACES,
  CONTROL_MODES,
  buildSandboxFence,
  buildSrcdoc,
  buildVueSrcdoc,
  sandboxPrelude,
  sandboxExternals,
  sandboxVueComponents,
} from "../core/index.js";

const langCompartment = new Compartment();

const langSupport = (name) => (name === "vue" ? vue() : javascript());

function buildPreview({ lang, viz, w, h, bg }, code, siblings) {
  if (lang === "vue") {
    return buildVueSrcdoc({ w, h, bg }, code, {
      externals: sandboxExternals(siblings),
      components: sandboxVueComponents(siblings),
    });
  }
  const spec = { preset: viz, w, h, bg, control: 'manual' };
  return buildSrcdoc(spec, code, sandboxPrelude(siblings), sandboxExternals(siblings));
}

// SandboxEditor seeds its state once, so a new target must arrive as a remount, not as new props.
export default function SandboxModal({ targetKey, initial, draftKey, ...rest }) {
  const target = targetIdentity(targetKey, initial);
  return (
    <SandboxEditor
      key={target}
      initial={initial}
      draftKey={draftKey ? `${draftKey}@${target}` : draftKey}
      {...rest}
    />
  );
}

function SandboxEditor({ variant = "fixed", className = "", initial, siblings = [], onSave, onCancel, draftKey }) {
  const isInline = variant === "inline";

  const [restored] = useState(() => (draftKey ? loadSandboxDraft(draftKey) : null));
  const seed = restored ?? initial;

  const [lang, setLang] = useState(seed.lang === "vue" ? "vue" : "js");
  const [viz, setViz] = useState(seed.viz ?? "canvas");
  const [w, setW] = useState(seed.w || 640);
  const [h, setH] = useState(seed.h || 360);
  const [bg, setBg] = useState(seed.bg || "");
  const [showCode, setShowCode] = useState(Boolean(seed.showCode));
  const [control, setControl] = useState(seed.control || "pausable");
  const [meta, setMeta] = useState(seed.meta || "");
  const [label, setLabel] = useState(seed.label || "");

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
  const clearedRef = useRef(false);
  const persistRef = useRef(null);
  const saveTimer = useRef(null);

  // A block is always js or vue. `viz` is the separate question of whether it is drawn.
  const isFigure = viz !== "";
  const isVue = lang === "vue";
  const codeLang = isVue ? "vue" : "javascript";
  const canPlay = isFigure && !isVue;
  const canReset = isFigure && (viz === "canvas" || viz === "root");
  // Only these two surfaces render playback UI: canvas gets the play button, pause-on-click
  // and the reset overlay, root gets the play button and reset. svg draws once and vue is
  // mounted by its own runtime, so `control` has nothing to act on.
  const hasControls = isFigure && !isVue && (viz === "canvas" || viz === "root");

  function updatePreview() {
    if (!isFigure) return;
    const body = cmRef.current ? cmRef.current.state.doc.toString() : seed.code || "";
    const width = Number(w) || 0;
    const height = Number(h) || 0;

    setSrcdoc(buildPreview({ lang, viz, w: width, h: height, bg: bg || figureBg() }, body, siblings));
    setPreviewW(width || 640);
    setPreviewH(height || 360);
    setFrameKey((k) => k + 1);
    setDirty(false);
  }

  const persist = () => {
    if (!draftKey || clearedRef.current) return;
    const code = cmRef.current ? cmRef.current.state.doc.toString() : (seed.code || "");
    saveSandboxDraft(draftKey, { lang, viz, w, h, bg, showCode, control, meta, label, code });
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

  // Switching to vue narrows the surfaces to `root`, so a js-only choice cannot linger.
  useEffect(() => {
    if (viz && !VIZ_SURFACES[lang].includes(viz)) setViz(VIZ_SURFACES[lang][0]);
  }, [lang, viz]);

  // Turning visualization on should show something, not an empty pane.
  const vizSeenRef = useRef(viz);
  useEffect(() => {
    const was = vizSeenRef.current;
    vizSeenRef.current = viz;
    if (viz && viz !== was) updatePreview();
  }, [viz]);

  // Both effects below react to a *change* in the toolbar values, and both used
  // to detect one by skipping their first run. That miscounts: StrictMode mounts,
  // unmounts and remounts in development, the refs survive it, and the second run
  // fell straight through the guard — so every modal opened already dirty and
  // wrote a recovery draft for an edit nobody had made. Comparing snapshots
  // instead is indifferent to how many times the effect runs.
  const metaSnapshot = JSON.stringify([lang, viz, w, h, bg, label]);
  const draftSnapshot = JSON.stringify([lang, viz, w, h, bg, showCode, control, meta, label]);
  const metaSeenRef = useRef(metaSnapshot);
  const draftSeenRef = useRef(draftSnapshot);

  useEffect(() => {
    if (metaSnapshot === metaSeenRef.current) return;
    metaSeenRef.current = metaSnapshot;
    setDirty(true);
  }, [metaSnapshot]);

  useEffect(() => {
    if (draftSnapshot === draftSeenRef.current) return;
    draftSeenRef.current = draftSnapshot;
    scheduleSaveRef.current();
  }, [draftSnapshot]);

  useEffect(() => {
    if (isInline) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isInline]);

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
        return;
      }

      if (e.key === "Escape") {
        if (document.activeElement?.closest?.(".editor-find")) return;
        if (!escapeRef.current?.()) return;
        e.preventDefault();
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
      const state = { kind: "figure", type: isVue ? "vue" : viz, w: Number(w) || undefined, h: Number(h) || undefined, bg, showCode, control, meta, label };
      onSave(buildSandboxFence(state, body), { keepOpen: true });
      updatePreview();
    } else {
      finishDraft();
      onSave(buildSandboxFence({ kind: "source", type: lang, label }, body));
    }
  }
  saveRef.current = save;

  function requestClose() {
    if (dirty && !window.confirm("You have unsaved changes. Close and discard them?")) return;
    finishDraft();
    onCancel();
  }

  const escapeRef = useRef(null);
  escapeRef.current = () => {
    if (dirty) return false;
    requestClose();
    return true;
  };

  return (
    <div
      className={["sbx-modal", isInline ? "is-inline" : "", className].filter(Boolean).join(" ")}
      role="dialog"
      aria-modal={isInline ? undefined : "true"}
      aria-label={isFigure ? "Edit sandbox figure" : "Edit shared source"}
    >
      <div className="sbx-head">
        <div className="sbx-toolbar">
          <label className="sbx-field">
            <span>Language</span>
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              <option value="js">js</option>
              <option value="vue">vue</option>
            </select>
          </label>
          <label className="sbx-field">
            <span>Visualize</span>
            <select value={viz} onChange={(e) => setViz(e.target.value)}>
              <option value="">no</option>
              {VIZ_SURFACES[lang].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="sbx-field">
            <span>{!isFigure && isVue ? "Component name" : "Label"}</span>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          {isFigure && (
            <>
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
                <input type="text" value={bg} onChange={(e) => setBg(e.target.value)} />
              </label>
              {hasControls && (
                <label className="sbx-field">
                  <span>Controls</span>
                  <select value={control} onChange={(e) => setControl(e.target.value)}>
                    {CONTROL_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
              )}
              <label className="sbx-field">
                <span>meta</span>
                <input type="text" value={meta} onChange={(e) => setMeta(e.target.value)} />
              </label>
              <div className="sbx-toggles">
                <label className="sbx-check"><input type="checkbox" checked={showCode} onChange={(e) => setShowCode(e.target.checked)} /> show code</label>
              </div>
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
