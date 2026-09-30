// How a MarkdownEditor's sidebar is arranged: whether it is folded away, how wide it is when
// it is not, and which of its sections are open.
//
// localStorage because it is a few bytes of window furniture, wanted synchronously on the
// first render (a width applied a frame late is a visible jump), and losing it costs nothing.

export const MIN_W = 220;
export const MAX_W = 760;
// Wide enough for a figure preview to be worth looking at.
export const DEFAULT_W = 340;

// Every collapsible section. A section added after the state was written defaults to open
// rather than to missing-and-therefore-collapsed.
const ALL_OPEN = { preview: true, settings: true, frontmatter: true, snippets: true };

export function clampWidth(px) {
  return Math.min(MAX_W, Math.max(MIN_W, Math.round(px)));
}

export function loadSidebar(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    return {
      collapsed: Boolean(saved.collapsed),
      // Kept across a collapse, so bringing the column back brings back the one you had.
      width: clampWidth(Number(saved.width) || DEFAULT_W),
      open: { ...ALL_OPEN, ...(saved.open || null) },
    };
  } catch {
    return { collapsed: false, width: DEFAULT_W, open: { ...ALL_OPEN } };
  }
}

export function saveSidebar(key, state) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Private mode, or out of quota. The layout just won't stick.
  }
}
