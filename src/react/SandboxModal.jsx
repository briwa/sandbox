import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EditorView, lineNumbers } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { syntaxHighlighting, codeFolding, foldGutter, foldKeymap, bracketMatching } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { vue } from "@codemirror/lang-vue";
import Icon from "./Icon.jsx";
import { KIND_ICONS } from "../core/icons.js";
import EditorFind from "./EditorFind.jsx";
import { DockConsole, appendConsole } from "./PreviewConsole.jsx";
import { codeServices } from "../editor/services.js";
import { showError, clearError } from "../editor/errors.js";
import { figureBg } from "../client/index.js";
import { knobsPanel, knobsSignature, knobMessage, knobResetMessage } from "../client/knobs.js";
import { codeHighlightStyle } from "../editor/highlight.js";
import { loadSandboxDraft, saveSandboxDraft, clearSandboxDraft } from "./storage.js";
import { targetIdentity } from "./target.js";
import {
  MSG_ERROR,
  MSG_CONSOLE,
  MSG_PLAY,
  MSG_KNOBS,
  MSG_PRESS,
  VIZ_SURFACES,
  CONTROL_MODES,
  normalizeControl,
  defaultToolbar,
  buildSandboxFence,
  buildSrcdoc,
  buildVueSrcdoc,
  sandboxPreludeBlocks,
  sandboxExternals,
  sandboxVueComponents,
} from "../core/index.js";

const langCompartment = new Compartment();

const langSupport = (name) => (name === "vue" ? vue() : javascript());

// `control` is the block's own playback mode, so the figure plays as it will on the page.
function buildPreview({ lang, viz, w, h, bg, idle, knobs, control }, code, siblings) {
  if (lang === "vue") {
    return buildVueSrcdoc({ w, h, bg }, code, {
      externals: sandboxExternals(siblings),
      components: sandboxVueComponents(siblings),
      console: true,
      knobs,
    });
  }
  const spec = { preset: viz, w, h, bg, control, idle, console: true, knobs };
  return buildSrcdoc(spec, code, sandboxPreludeBlocks(siblings), sandboxExternals(siblings));
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

// `dock` is `{ preview, settings, console }`, three elements a host lays out elsewhere — a
// sidebar, say. The modal is only ever the code: the figure and its console render in the
// dock, and so do the settings, as a table instead of behind the gear. Without a dock there
// is no preview. The state is still all the modal's; only where the pieces are drawn moves.
function SandboxEditor({ variant = "fixed", className = "", initial, siblings = [], onSave, onCancel, draftKey, dock }) {
  const isInline = variant === "inline";
  const docked = Boolean(dock?.settings && dock?.preview && dock?.console);

  const [restored] = useState(() => (draftKey ? loadSandboxDraft(draftKey) : null));
  // `initial` may be partial — just the values a host wants to differ from a fresh block.
  const [seed] = useState(() => restored ?? defaultToolbar(initial));

  const [lang, setLang] = useState(seed.lang === "vue" ? "vue" : "js");
  // `/sandbox` opens as a shared source block; visualizing is opted into in the settings.
  const [viz, setViz] = useState(seed.viz ?? "");
  const [w, setW] = useState(seed.w || 640);
  const [h, setH] = useState(seed.h || 360);
  const [bg, setBg] = useState(seed.bg || "");
  const [showCode, setShowCode] = useState(Boolean(seed.showCode));
  const [open, setOpen] = useState(Boolean(seed.open));
  const [control, setControl] = useState(normalizeControl(seed.control));
  const [idle, setIdle] = useState(seed.idle || 0);
  const [meta, setMeta] = useState(seed.meta || "");
  const [label, setLabel] = useState(seed.label || "");

  const [srcdoc, setSrcdoc] = useState("");
  const [previewW, setPreviewW] = useState(seed.w || 640);
  const [previewH, setPreviewH] = useState(seed.h || 360);
  const [logs, setLogs] = useState([]);

  const [frameKey, setFrameKey] = useState(0);
  const [dirty, setDirty] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);

  // The knobs the running preview declared. Only their shape is state — a value-only report
  // must not rebuild the panel mid-drag — while the values dialled in live in a ref and are
  // seeded back into every rebuilt preview, so a code edit does not undo the tuning.
  const [knobSig, setKnobSig] = useState("");
  const [knobsOpen, setKnobsOpen] = useState(false);
  const knobDefsRef = useRef([]);
  const knobValsRef = useRef({});
  const knobsRef = useRef(null);
  const knobHostRef = useRef(null);

  const modalRef = useRef(null);
  const hostRef = useRef(null);
  const cmRef = useRef(null);
  const frameRef = useRef(null);
  const saveRef = useRef(null);
  const clearedRef = useRef(false);
  const persistRef = useRef(null);
  const saveTimer = useRef(null);
  const settingsRef = useRef(null);

  // A block is always js or vue. `viz` is the separate question of whether it is drawn.
  const isFigure = viz !== "";
  const isVue = lang === "vue";
  const codeLang = isVue ? "vue" : "javascript";
  // Only these two surfaces render playback UI: canvas gets the play button, pause-on-click
  // and the reset overlay, root gets the play button and reset. svg draws once and vue is
  // mounted by its own runtime, so `control` has nothing to act on.
  const hasControls = isFigure && !isVue && (viz === "canvas" || viz === "root");
  const tags = isFigure ? [[lang, lang], [viz, viz]] : KIND_ICONS[isVue ? "vue" : "source"];

  // `clean: false` re-runs the figure without calling the edits saved — for a rebuild that
  // only changes how the preview plays, not what the block says.
  function updatePreview({ clean = true } = {}) {
    if (!isFigure) return;
    const body = cmRef.current ? cmRef.current.state.doc.toString() : seed.code || "";
    const width = Number(w) || 0;
    const height = Number(h) || 0;

    clearError(cmRef.current);
    setSrcdoc(buildPreview({ lang, viz, w: width, h: height, bg: bg || figureBg(), idle: Number(idle) || 0, knobs: knobValsRef.current, control }, body, siblings));
    setPreviewW(width || 640);
    setPreviewH(height || 360);
    setFrameKey((k) => k + 1);
    if (clean) setDirty(false);
  }

  const persist = () => {
    if (!draftKey || clearedRef.current) return;
    const code = cmRef.current ? cmRef.current.state.doc.toString() : (seed.code || "");
    saveSandboxDraft(draftKey, { lang, viz, w, h, bg, showCode, open, control, idle, meta, label, code });
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
            ".cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": { background: "color-mix(in srgb, var(--astro-code-foreground, var(--sbx-ink)) 22%, transparent)" },

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
  const metaSnapshot = JSON.stringify([lang, viz, w, h, bg, open, idle, label, control]);
  const draftSnapshot = JSON.stringify([lang, viz, w, h, bg, showCode, open, control, idle, meta, label]);
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

  useEffect(() => { setLogs([]); knobDefsRef.current = []; setKnobSig(""); }, [frameKey]);

  // Picking another `control` is only seen by running it, so it rebuilds the figure — as does
  // the dock arriving, since there was nowhere to draw it before.
  const playbackSeenRef = useRef([docked, control]);
  useEffect(() => {
    const [wasDocked, wasControl] = playbackSeenRef.current;
    playbackSeenRef.current = [docked, control];
    if (docked && (!wasDocked || control !== wasControl)) updatePreview({ clean: false });
  }, [docked, control]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onDown = (e) => { if (!settingsRef.current?.contains(e.target)) setSettingsOpen(false); };
    // A press on the preview frame never reaches this document. A running frame reports it as
    // a press message (handled below); a frame whose script never ran — a syntax error takes
    // its press listener down with it — can only be caught by the focus moving into it.
    const onBlur = () => { if (document.activeElement === frameRef.current) setSettingsOpen(false); };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("blur", onBlur);
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (!knobsOpen) return;
    const onDown = (e) => { if (!knobsRef.current?.contains(e.target)) setKnobsOpen(false); };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [knobsOpen]);

  useEffect(() => {
    const host = knobHostRef.current;
    if (!host || !knobSig) return;
    const post = (msg) => frameRef.current?.contentWindow?.postMessage(msg, "*");
    host.replaceChildren(knobsPanel(knobDefsRef.current, {
      onChange: (key, value) => { knobValsRef.current[key] = value; post(knobMessage(key, value)); },
      onReset: () => { knobValsRef.current = {}; post(knobResetMessage()); },
    }));
  }, [knobSig, knobsOpen]);

  useEffect(() => {
    const onMessage = (e) => {
      if (!frameRef.current || frameRef.current.contentWindow !== e.source || !e.data) return;
      if (e.data[MSG_PRESS]) { setKnobsOpen(false); setSettingsOpen(false); return; }
      const defs = e.data[MSG_KNOBS];
      if (Array.isArray(defs)) { knobDefsRef.current = defs; setKnobSig(knobsSignature(defs)); return; }
      const out = e.data[MSG_CONSOLE];
      if (Array.isArray(out)) { setLogs((prev) => appendConsole(prev, out)); return; }
      const err = e.data[MSG_ERROR];
      if (err) {
        showError(cmRef.current, err);
        setLogs((prev) => appendConsole(prev, [{ text: err.hint ? `${err.hint}\n${err.message}` : String(err.message) }]));
        return;
      }
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

  function save() {
    const body = cmRef.current ? cmRef.current.state.doc.toString() : seed.code || "";
    if (isFigure) {
      const state = { kind: "figure", type: isVue ? "vue" : viz, w: Number(w) || undefined, h: Number(h) || undefined, bg, showCode, open, control, idle: Number(idle) || 0, meta, label };
      onSave(buildSandboxFence(state, body), { keepOpen: true });
      updatePreview();
    } else {
      finishDraft();
      onSave(buildSandboxFence({ kind: "source", type: lang, label, open }, body));
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
    if (settingsOpen) { setSettingsOpen(false); return true; }
    if (knobsOpen) { setKnobsOpen(false); return true; }
    const view = cmRef.current;
    if (view && view.state.selection.ranges.length > 1) {
      view.dispatch({ selection: view.state.selection.asSingle() });
      return true;
    }
    if (dirty) return false;
    requestClose();
    return true;
  };

  // The figure is drawn in the dock the way the rendered page draws it: its playback controls
  // are the frame's own, per `control`, and its knobs hang off the same corner button. A `hover`
  // figure is driven from out here, since the frame never sees the pointer come or go.
  const isHoverCtl = hasControls && control === "hover";
  const postFrame = (msg) => frameRef.current?.contentWindow?.postMessage(msg, "*");
  const dockStage = (
    <div
      className="sbx-dock-figure"
      ref={knobsRef}
      style={{ width: `${previewW}px` }}
      onPointerEnter={isHoverCtl ? () => postFrame({ [MSG_PLAY]: true }) : undefined}
      onPointerLeave={isHoverCtl ? () => postFrame({ [MSG_PLAY]: false }) : undefined}
    >
      <iframe
        key={frameKey}
        ref={frameRef}
        className="sbx-frame"
        style={{ aspectRatio: `${previewW} / ${previewH}` }}
        sandbox="allow-scripts"
        title="live figure preview"
        srcDoc={srcdoc}
      />
      {isHoverCtl && <div className="sandbox-hover" aria-hidden="true" />}
      {knobSig && (
        <div className="sandbox-tools">
          <button
            type="button"
            className="sandbox-knobs-btn"
            onClick={() => setKnobsOpen((o) => !o)}
            title="Settings"
            aria-label="Figure settings"
            aria-haspopup="true"
            aria-expanded={knobsOpen}
          >
            <Icon name="settings" size={15} />
          </button>
        </div>
      )}
      {knobSig && knobsOpen && <div ref={knobHostRef} />}
    </div>
  );

  // The gear panel's fields, as a table for a dock. Same state, same rules for what shows.
  const settingsTable = (
    <table className="sbx-table" aria-label="Settings">
      <tbody>
        {/* Labelled with the fence's own words: `sandbox=js`, `viz=svg`, `open`, `code`… */}
        <Row label="sandbox">
          <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">
            <option value="js">js</option>
            <option value="vue">vue</option>
          </select>
        </Row>
        <Row label="viz">
          <select value={viz} onChange={(e) => setViz(e.target.value)} aria-label="Visualize">
            <option value="">no</option>
            {VIZ_SURFACES[lang].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Row>
        <Row label="label">
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} aria-label={!isFigure && isVue ? "Component name" : "Label"} />
        </Row>
        {isFigure && (
          <>
            <Row label="w"><input type="number" min="1" value={w} onChange={(e) => setW(e.target.value)} aria-label="Width" /></Row>
            <Row label="h"><input type="number" min="1" value={h} onChange={(e) => setH(e.target.value)} aria-label="Height" /></Row>
            <Row label="bg"><input type="text" value={bg} onChange={(e) => setBg(e.target.value)} aria-label="Background" /></Row>
            {hasControls && (
              <Row label="control">
                <select value={control} onChange={(e) => setControl(e.target.value)} aria-label="Controls">
                  {CONTROL_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Row>
            )}
            {hasControls && (
              <Row label="idle"><input type="number" min="0" step="100" value={idle} onChange={(e) => setIdle(e.target.value)} aria-label="Idle frame in milliseconds" /></Row>
            )}
            <Row label="meta"><input type="text" value={meta} onChange={(e) => setMeta(e.target.value)} aria-label="meta" /></Row>
            <Row label="code"><BoolSelect value={showCode || open} disabled={open} onChange={setShowCode} label="Show code" /></Row>
            <Row label="open"><BoolSelect value={open} onChange={setOpen} label="Start on code" /></Row>
          </>
        )}
        {!isFigure && (
          <Row label="open"><BoolSelect value={open} onChange={setOpen} label="Start open" /></Row>
        )}
      </tbody>
    </table>
  );

  return (
    <div
      ref={modalRef}
      className={["sbx-modal", isInline ? "is-inline" : "", className].filter(Boolean).join(" ")}
      role="dialog"
      aria-modal={isInline ? undefined : "true"}
      aria-label={isFigure ? "Edit sandbox figure" : "Edit shared source"}
    >
      <div className="sbx-float" role="toolbar" aria-label="Editor actions">
        {dirty && (
          <button className="sbx-float-btn save" onClick={save} title="Save (⌘S)" aria-label="Save">
            <Icon name="save" size={15} />
          </button>
        )}
        {!docked && <div className="sbx-settings" ref={settingsRef}>
          <button
            className={`sbx-float-btn ${settingsOpen ? "is-on" : ""}`}
            onClick={() => setSettingsOpen((o) => !o)}
            title="Settings"
            aria-label="Settings"
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
          >
            <Icon name="settings" size={15} />
          </button>
          {settingsOpen && (
            <div className="sbx-settings-panel" role="dialog" aria-label="Settings">
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
                  {hasControls && (
                    <label className="sbx-field">
                      <span>Idle frame</span>
                      <input type="number" min="0" step="100" value={idle} onChange={(e) => setIdle(e.target.value)} aria-label="Idle frame in milliseconds" />
                    </label>
                  )}
                  <label className="sbx-field">
                    <span>meta</span>
                    <input type="text" value={meta} onChange={(e) => setMeta(e.target.value)} />
                  </label>
                  <div className="sbx-toggles">
                    <label className="sbx-check"><input type="checkbox" checked={showCode || open} disabled={open} onChange={(e) => setShowCode(e.target.checked)} /> show code</label>
                    <label className="sbx-check"><input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} /> start on code</label>
                  </div>
                </>
              )}
              {!isFigure && (
                <div className="sbx-toggles">
                  <label className="sbx-check"><input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} /> start open</label>
                </div>
              )}
            </div>
          )}
        </div>}
        {!docked && <span className="sbx-float-sep" aria-hidden="true" />}
        <button className="sbx-float-btn" onClick={requestClose} title="Close" aria-label="Close">
          <Icon name="close" size={15} />
        </button>
      </div>
      <div className="sbx-body sbx-body-solo">
        <div className="sbx-code-pane">
          <div className="sbx-code" ref={hostRef} />
          <div className="sbx-tags" aria-label="Editing">
            {tags.map(([icon, title]) => (
              <span key={icon} className="cm-sbx-chip icon" title={title} aria-label={title}>
                <Icon name={icon} size={13} />
              </span>
            ))}
          </div>
          {/* The scope is the whole fence editor, not just the code host:
              ⌘F from its toolbar means the code in front of you, and the page
              editor behind it has a find bar of its own that would otherwise
              answer the same keystroke. */}
          <EditorFind viewRef={cmRef} scopeRef={modalRef} />
        </div>
      </div>
      {docked && createPortal(settingsTable, dock.settings)}
      {docked && isFigure && createPortal(<div className="sbx-dock-preview">{dockStage}</div>, dock.preview)}
      {docked && isFigure && createPortal(<DockConsole logs={logs} onClear={() => setLogs([])} />, dock.console)}
    </div>
  );
}

// One row of the docked settings table: the name, then the value as an input that reads as
// plain text until it is edited.
function Row({ label, children }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{children}</td>
    </tr>
  );
}

// true/false as a dropdown, so every value in the table is text and a choice reads the same way.
function BoolSelect({ value, onChange, disabled, label }) {
  return (
    <select value={String(Boolean(value))} onChange={(e) => onChange(e.target.value === "true")} disabled={disabled} aria-label={label}>
      <option value="false">false</option>
      <option value="true">true</option>
    </select>
  );
}
