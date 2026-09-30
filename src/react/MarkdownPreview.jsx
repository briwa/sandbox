import { useEffect, useRef, useState } from "react";
import { mountFigures } from "../client/index.js";

// The rendered document, figures running: what a MarkdownEditor's text reads as finished.
//
// `render` is markdown → HTML. Left out, it is the package's own pipeline with the
// editor's highlighter, loaded on first use so the `react` entry does not pull unified in
// for a host that never previews. `title` heads the page when it lives in frontmatter
// rather than in the body; `children` goes above the body too.
let defaultRender = null;
const loadDefaultRender = () =>
  (defaultRender ??= Promise.all([import("../markdown/index.js"), import("../editor/render.js")]).then(
    ([{ createMarkdownRenderer }, { highlightCode }]) => createMarkdownRenderer({ highlight: highlightCode, lazy: true }),
  ));

export default function MarkdownPreview({ markdown, title, render, delay = 250, className = "", children }) {
  const ref = useRef(null);
  const [html, setHtml] = useState("");

  // Debounced because re-rendering swaps the figure iframes, and each swap restarts
  // whatever is animating inside them.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const out = await (render ?? (await loadDefaultRender()))(markdown);
        if (!cancelled) setHtml(out);
      } catch (err) {
        if (!cancelled) setHtml(`<p class="sbx-md-preview-error">Preview failed: ${escapeHtml(err.message)}</p>`);
      }
    }, delay);
    return () => { cancelled = true; clearTimeout(t); };
  }, [markdown, render, delay]);

  // `root` as a function, so the runtime re-queries after each render rather than holding
  // iframes that have since been replaced.
  useEffect(() => mountFigures({ root: () => ref.current }), []);

  return (
    <div className={["sbx-md-preview", className].filter(Boolean).join(" ")}>
      {title && (
        <div className="sbx-md-preview-head">
          <h1 className="sbx-md-preview-title">{title}</h1>
        </div>
      )}
      {children}
      <div className="sbx-md-preview-body" ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
