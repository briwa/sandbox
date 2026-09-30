import '@briwa.dev/sandbox/styles';
import './demo.css';

import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { joinFrontmatter, readKey } from '@briwa.dev/sandbox';
import { Icon, MarkdownEditor } from '@briwa.dev/sandbox/react';

const START = `Type \`/sandbox\` on an empty line to insert a block, or click a card below to edit it.
Opening one puts its code here and its figure, settings and console in the sidebar.
Your edits are kept in this browser; the reset button on the right brings this sample back.

\`\`\`sandbox=js label="shared helpers"
const wave = (t, i) => Math.sin(t / 500 + i / 3);
\`\`\`

\`\`\`sandbox=js viz 460x200 control=autoplay label="Marching squares"
const gap = knob(32, { min: 20, max: 48 });
const size = knob(16, { min: 4, max: 32 });

loop((t) => {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'currentColor';
  for (let i = 0; i < 14; i++) {
    ctx.fillRect(20 + i * gap, height / 2 + wave(t, i) * 60, size, size);
  }
});
\`\`\`

Prose between figures stays ordinary markdown. The figure below carries no \`label\`, so the outline
falls back to the first thing its code declares.

\`\`\`sandbox=js viz=svg 460x160
const drawGrid = () => {
  for (let x = 20; x < width; x += 36) {
    const line = document.createElementNS(svg.namespaceURI, 'line');
    line.setAttribute('x1', x);
    line.setAttribute('y1', 12);
    line.setAttribute('x2', x);
    line.setAttribute('y2', height - 12);
    line.setAttribute('stroke', 'currentColor');
    line.setAttribute('stroke-opacity', 0.35);
    svg.append(line);
  }
};

drawGrid();
\`\`\`
`;

const START_FRONTMATTER = `title: "An entry with figures"\ndate: 2026-09-30\ntags: [demo]\ndraft: true`;

// The document outlives a reload, the way a writer expects of an editor. Browser storage is
// enough for a demo: it is one visitor's scratch copy, and losing it costs a click of reset.
const STORE = 'sandbox-demo-doc';
const load = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE));
    if (typeof saved?.body === 'string' && typeof saved?.frontmatter === 'string') return saved;
  } catch {}
  return { frontmatter: START_FRONTMATTER, body: START };
};
const store = (doc) => {
  try { localStorage.setItem(STORE, JSON.stringify(doc)); } catch {}
};

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function Editor() {
  const editorRef = useRef(null);
  const [initial] = useState(load);
  const [frontmatter, setFrontmatter] = useState(initial.frontmatter);
  const [body, setBody] = useState(initial.body);
  const [preview, setPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  // Reset replaces the document outright, which the editor takes as a remount.
  const [generation, setGeneration] = useState(0);

  useEffect(() => { store({ frontmatter, body }); }, [frontmatter, body]);

  // The whole file, frontmatter and all, read off the editor rather than `body`, which
  // trails typing by a pause.
  const markdown = () => joinFrontmatter(frontmatter, editorRef.current?.getDoc() ?? body);

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  function download() {
    const url = URL.createObjectURL(new Blob([markdown()], { type: 'text/markdown' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${slug(readKey(frontmatter, 'title')) || 'entry'}.md` });
    a.click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    if (!confirm('Replace this document with the sample?')) return;
    setFrontmatter(START_FRONTMATTER);
    setBody(START);
    setPreview(false);
    setGeneration((g) => g + 1);
  }

  return (
    <MarkdownEditor
      key={generation}
      ref={editorRef}
      className="editor"
      initialDoc={body}
      onChange={setBody}
      frontmatter={frontmatter}
      onFrontmatterChange={setFrontmatter}
      preview={preview}
      // What `/sandbox` opens with; viz stays off until it is turned on in Settings.
      defaults={{ w: 480, h: 240 }}
      draftKey="demo"
      sidebarKey="demo-sidebar"
      autoFocus
    >
      {/* The host's own controls, laid over the writing column. */}
      <div className="demo-rail" role="toolbar" aria-label="Document">
        <button onClick={() => setPreview((v) => !v)} aria-pressed={preview} title={preview ? 'Back to editing' : 'Preview the document'} aria-label="Preview">
          <Icon name={preview ? 'eyeOff' : 'eye'} size={16} />
        </button>
        <button onClick={() => editorRef.current?.scrollToTop()} title="Back to top" aria-label="Back to top">
          <Icon name="chevronUp" size={16} />
        </button>
        <span className="demo-rail-sep" aria-hidden="true" />
        <button onClick={copy} title={copied ? 'Copied' : 'Copy the markdown'} aria-label="Copy the markdown">
          <Icon name={copied ? 'check' : 'copy'} size={16} />
        </button>
        <button onClick={download} title="Download as .md" aria-label="Download as .md">
          <Icon name="save" size={16} />
        </button>
        <button onClick={reset} title="Reset to the sample" aria-label="Reset to the sample">
          <Icon name="reset" size={16} />
        </button>
      </div>
    </MarkdownEditor>
  );
}

createRoot(document.querySelector('#app')).render(
  <StrictMode>
    <Editor />
  </StrictMode>
);
