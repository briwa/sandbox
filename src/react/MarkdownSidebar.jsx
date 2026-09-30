import { memo, useEffect, useMemo, useRef, useState } from "react";
import { describeSandboxBlock } from "../core/index.js";
import { countKeys } from "../core/frontmatter.js";
import FrontmatterTable from "./FrontmatterTable.jsx";
import { clampWidth, DEFAULT_W, loadSidebar, MAX_W, MIN_W, saveSidebar } from "./sidebar.js";

// A MarkdownEditor's right-hand column, top to bottom:
//
//   Preview      the figure of the block being edited      ┐ slots the open block modal
//   Settings     that block's settings, as a table          │ renders into; empty — and so
//   Console      pinned at the foot; open, it takes         │ hidden — while writing prose
//                everything below the preview               ┘
//   Frontmatter  the document's, as a table — hidden while a block is open
//   Sandboxes    one row per block, when there are any
//
// Settings, Frontmatter and Sandboxes scroll together between the preview and the console.
//
// How wide it is, what is folded, and whether the column is there at all are the writer's,
// and outlive the session under `storageKey`. No chrome of its own: folding it away is the
// drag handle's double-click, and folded, the tab hung off that edge is the way back.
export default function MarkdownSidebar({ storageKey, frontmatter, onFrontmatter, blocks, active = -1, editing = false, onOpen, onClose, onSlot }) {
  const [ui, setUi] = useState(() => loadSidebar(storageKey));
  const { collapsed, width, open } = ui;

  // Settled rather than live: a drag changes the width every frame.
  useEffect(() => {
    const t = setTimeout(() => saveSidebar(storageKey, ui), 200);
    return () => clearTimeout(t);
  }, [storageKey, ui]);

  const toggle = (key) => setUi((s) => ({ ...s, open: { ...s.open, [key]: !s.open[key] } }));
  const setWidth = (px) => setUi((s) => ({ ...s, width: clampWidth(px) }));
  const setCollapsed = (v) => setUi((s) => ({ ...s, collapsed: v }));

  // One stable ref per slot: a fresh callback each render would hand the host null and then
  // the element again on every render, and the host re-renders on each.
  const slot = useMemo(
    () => ({
      preview: (el) => onSlot?.("preview", el),
      settings: (el) => onSlot?.("settings", el),
      console: (el) => onSlot?.("console", el),
    }),
    [onSlot],
  );

  const hasFrontmatter = frontmatter != null;
  const keyCount = hasFrontmatter ? countKeys(frontmatter) : 0;

  return (
    <aside className={`sbx-md-side ${collapsed ? "is-collapsed" : ""}`} style={{ "--sbx-md-side-w": `${width}px` }}>
      {collapsed && (
        <button
          className="sbx-md-side-tab"
          onClick={() => setCollapsed(false)}
          // No `aria-controls`: what it controls is not in the document while folded.
          aria-expanded={false}
          title="Show the sidebar"
          aria-label="Show the sidebar"
        >
          <IconExpandSide />
        </button>
      )}

      {/* Folded, everything below is hidden by CSS rather than unmounted: an open block's
          modal renders into these slots, and losing them would make it fall back to drawing
          its own preview, settings and console beside the code. */}
      <Resizer width={width} onWidth={setWidth} onCollapse={() => setCollapsed(true)} />

      {/* Above the scrolling sections rather than among them, so it stays in view when the
          console opens over everything else. */}
      <Section id="preview" title="Preview" open={open.preview} onToggle={toggle} slotRef={slot.preview} />

      <div className="sbx-md-side-body">
        <Section id="settings" title="Settings" open={open.settings} onToggle={toggle} slotRef={slot.settings} />

        {/* The document's, not the block's — out of the way while a block is open. */}
        {hasFrontmatter && !editing && (
          <Section id="frontmatter" title="Frontmatter" badge={keyCount || null} open={open.frontmatter} onToggle={toggle}>
            <FrontmatterTable frontmatter={frontmatter} onChange={(v) => onFrontmatter?.(v)} />
          </Section>
        )}

        {blocks.length > 0 && (
          <Section id="sandboxes" title="Sandboxes" badge={blocks.length} open={open.sandboxes} onToggle={toggle}>
            <ul className="sbx-md-rows">
              {/* Keyed by position: two blocks can be textually identical, and keying by
                  offset remounted every row below the caret on each keystroke. */}
              {blocks.map((block, i) => (
                <SandboxRow key={i} block={block} index={i} active={i === active} onOpen={onOpen} onClose={onClose} />
              ))}
            </ul>
          </Section>
        )}
      </div>

      <div className="sbx-md-console" ref={slot.console} />
    </aside>
  );
}

// What a row shows is read off the block's fence and code; where the block sits is not on
// screen, so a block that only moved leaves its row alone.
const ROW_FIELDS = ["kind", "lang", "label", "componentName", "preset", "w", "h", "closed", "code"];
const sameRow = (a, b) =>
  a.index === b.index &&
  a.active === b.active &&
  a.onOpen === b.onOpen &&
  a.onClose === b.onClose &&
  ROW_FIELDS.every((k) => a.block[k] === b.block[k]);

// `onOpen` is handed the row's position, not the block: a row that skipped a render still
// holds the block as it was, offsets and all.
const SandboxRow = memo(function SandboxRow({ block, index, active, onOpen, onClose }) {
  const { kind, label, detail } = describeSandboxBlock(block);
  return (
    <li className={active ? "is-active" : undefined}>
      <button className="sbx-md-row" onClick={() => onOpen(index)} title={detail || label} aria-current={active || undefined}>
        <span className={`sbx-md-kind sbx-md-kind-${kind}`} aria-hidden="true" />
        <span className="sbx-md-row-text">
          <span className="sbx-md-row-label">{label}</span>
          {detail && <span className="sbx-md-row-detail">{detail}</span>}
        </span>
        {!block.closed && (
          <span className="sbx-md-row-warn" title="This fence is never closed">!</span>
        )}
      </button>
      {/* The list is where you can see which block is open, so it is also where closing it
          belongs. */}
      {active && (
        <button className="sbx-md-row-close" onClick={onClose} title="Close the editor for this block" aria-label="Close the editor for this block">
          <IconClose />
        </button>
      )}
    </li>
  );
}, sameRow);

// A slot section's body is always mounted (hidden while folded), because what the modal
// portals into it — a running figure — must not be torn down by a fold. It hides itself
// entirely while the slot is empty.
function Section({ id, title, badge, open, onToggle, slotRef, children }) {
  const body = slotRef ? (
    <div className="sbx-md-sect-body sbx-md-slot" id={`sbx-md-sect-${id}`} ref={slotRef} hidden={!open} />
  ) : (
    // Unmounted rather than hidden: neither the table nor the list has state worth keeping.
    open && (
      <div className="sbx-md-sect-body" id={`sbx-md-sect-${id}`}>
        {children}
      </div>
    )
  );
  return (
    <section className={`sbx-md-sect sbx-md-sect-${id} ${open ? "is-open" : ""} ${slotRef ? "is-slot" : ""}`}>
      <h2 className="sbx-md-sect-head">
        <button className="sbx-md-sect-toggle" onClick={() => onToggle(id)} aria-expanded={open} aria-controls={`sbx-md-sect-${id}`}>
          <IconChevron />
          <span className="sbx-md-sect-title">{title}</span>
          {badge != null && <span className="sbx-md-count">{badge}</span>}
        </button>
      </h2>
      {body}
    </section>
  );
}

// The drag handle down the column's left edge, and — double-clicked — the way the column
// folds away. The column grows leftwards, so dragging left widens it. Pointer capture rather
// than window listeners, so a fast drag that outruns the cursor still lands here.
function Resizer({ width, onWidth, onCollapse }) {
  const drag = useRef(null);
  const [dragging, setDragging] = useState(false);

  function onPointerDown(e) {
    // Stops the drag from starting a text selection in the editor beside it.
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, w: width };
    setDragging(true);
  }

  function onPointerMove(e) {
    if (drag.current) onWidth(drag.current.w - (e.clientX - drag.current.x));
  }

  function onPointerUp() {
    drag.current = null;
    setDragging(false);
  }

  return (
    <div
      className={`sbx-md-resizer ${dragging ? "is-dragging" : ""}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the sidebar"
      title="Drag to resize · double-click to hide"
      aria-valuenow={width}
      aria-valuemin={MIN_W}
      aria-valuemax={MAX_W}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onCollapse}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16;
        if (e.key === "ArrowLeft") onWidth(width + step);
        else if (e.key === "ArrowRight") onWidth(width - step);
        else if (e.key === "Home") onWidth(DEFAULT_W);
        // Double-click has no keyboard equivalent, and this handle is the only way to fold.
        else if (e.key === "Enter" || e.key === " ") onCollapse();
        else return;
        e.preventDefault();
      }}
    />
  );
}

// Rotated by CSS when its section is open, so one path serves both states.
const IconChevron = () => (
  <svg className="sbx-md-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m9 6 6 6-6 6" />
  </svg>
);

// Double chevrons for the column, pointing the way it opens: leftwards, out of the edge.
const IconExpandSide = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m11 17-5-5 5-5" />
    <path d="m18 17-5-5 5-5" />
  </svg>
);

const IconClose = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
