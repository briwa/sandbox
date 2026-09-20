import '@briwa.dev/sandbox/styles';
import './demo.css';

import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';

import { codeServices } from '@briwa.dev/sandbox/editor';
import { sandboxPreview } from '@briwa.dev/sandbox/codemirror';
import { SandboxModal, SandboxExternalModal } from '@briwa.dev/sandbox/react';
import { findSandboxBlocks, describeSandboxBlock, specToToolbar, DEFAULT_W, DEFAULT_H } from '@briwa.dev/sandbox';

const START = `# An entry with figures

Type \`/\` on an empty line to insert a block, or press Edit on a card below.
The outline beside the editor is one row per sandbox, names and all.

\`\`\`js lib="shared helpers"
const wave = (t, i) => Math.sin(t / 500 + i / 3);
\`\`\`

\`\`\`js canvas 460x200 control=auto label="Marching squares"
loop((t) => {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'currentColor';
  for (let i = 0; i < 14; i++) {
    ctx.fillRect(20 + i * 32, height / 2 + wave(t, i) * 60, 16, 16);
  }
});
\`\`\`

Prose between figures stays ordinary markdown. The figure below carries no \`label\`, so the outline
falls back to the first thing its code declares.

\`\`\`js svg 460x160
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

const readOutline = (doc) =>
  findSandboxBlocks(doc).map((block) => ({ ...describeSandboxBlock(block), block }));

function Editor() {
  const hostRef = useRef(null);
  const viewRef = useRef(null);

  const [editing, setEditing] = useState(null);
  const [outline, setOutline] = useState(() => readOutline(START));

  const onEditRef = useRef(null);
  const onCreateRef = useRef(null);

  const siblingsNow = () => findSandboxBlocks(viewRef.current?.state.doc.toString() ?? '');

  onEditRef.current = (block) => {
    const base = { from: block.from, to: block.to, siblings: siblingsNow() };
    if (block.snippet) {
      setEditing({ ...base, modal: 'source', initial: { srcLang: 'js', name: block.label, id: block.id, code: block.code } });
    } else if (block.vueLib) {
      setEditing({ ...base, modal: 'source', initial: { srcLang: 'vue', name: block.componentName, id: block.id, code: block.code } });
    } else if (block.external) {
      setEditing({ ...base, modal: 'external', initial: { label: block.label, id: block.id, code: block.code } });
    } else {
      setEditing({ ...base, modal: 'figure', initial: { ...specToToolbar(block), code: block.code } });
    }
  };

  onCreateRef.current = (kind, pos) => {
    const base = { from: pos, to: pos, siblings: siblingsNow() };
    if (kind === 'external') {
      setEditing({ ...base, modal: 'external', initial: { label: '', id: '', code: '' } });
    } else if (kind === 'source') {
      setEditing({ ...base, modal: 'source', initial: { srcLang: 'js', name: '', id: '', code: '' } });
    } else {
      setEditing({
        ...base,
        modal: 'figure',
        initial: { type: 'canvas', w: DEFAULT_W, h: DEFAULT_H, bg: '', showCode: false, control: 'pausable', preview: false, label: '', id: '', code: '' },
      });
    }
  };

  useEffect(() => {
    const view = new EditorView({
      state: EditorState.create({
        doc: START,
        extensions: [
          ...codeServices(),
          markdown(),
          sandboxPreview({
            onEdit: (b) => onEditRef.current?.(b),
            onCreate: (kind, pos) => onCreateRef.current?.(kind, pos),
          }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) setOutline(readOutline(u.state.doc.toString()));
          }),
        ],
      }),
      parent: hostRef.current,
    });
    viewRef.current = view;
    return () => { view.destroy(); viewRef.current = null; };
  }, []);

  function reveal({ block }) {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      selection: { anchor: block.from },
      effects: EditorView.scrollIntoView(block.from, { y: 'center' }),
    });
    view.focus();
  }

  function save(fence, { keepOpen = false } = {}) {
    const view = viewRef.current;
    if (!view || !editing) return setEditing(null);
    const { from, to } = editing;

    const insert = from > 0 && view.state.doc.sliceString(from - 1, from) !== '\n' ? '\n' + fence : fence;
    view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length } });
    if (keepOpen) setEditing((s) => (s ? { ...s, to: from + insert.length } : s));
    else { setEditing(null); view.focus(); }
  }

  return (
    <>
      <h1>the authoring UI</h1>
      <p className="note">
        Cards replace the raw fences. Show preview runs one inline. Edit opens the full modal —
        code on the left, a live preview on the right, with play/pause/reset and a draggable split.
        ⌘F finds, ⌘S saves.
      </p>
      <div className="with-outline">
        <div className="editor" ref={hostRef} />
        <aside className="outline">
          <h2>outline &mdash; {outline.length}</h2>
          {outline.length === 0 ? (
            <p className="note">No sandboxes in this document.</p>
          ) : (
            <ol>
              {outline.map((row) => (
                <li key={row.block.from}>
                  <button className="outline-jump" onClick={() => reveal(row)} title="Jump to this block">
                    <span className="outline-kind">{row.kind}</span>
                    <span className="outline-label">{row.label}</span>
                    {row.detail && <span className="outline-detail">{row.detail}</span>}
                  </button>
                  <button className="outline-edit" onClick={() => onEditRef.current?.(row.block)}>edit</button>
                </li>
              ))}
            </ol>
          )}
          <p className="note">
            Every row is <code>describeSandboxBlock</code> over a block from{' '}
            <code>findSandboxBlocks</code> &mdash; <code>label</code> is never empty, so nothing here
            branches on the kind.
          </p>
        </aside>
      </div>

      {editing?.modal === 'figure' && (
        <SandboxModal
          kind="figure"
          initial={editing.initial}
          siblings={editing.siblings}
          draftKey="demo-figure"
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}
      {editing?.modal === 'source' && (
        <SandboxModal
          kind="source"
          initial={editing.initial}
          siblings={editing.siblings}
          draftKey="demo-source"
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}
      {editing?.modal === 'external' && (
        <SandboxExternalModal
          initial={editing.initial}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}
    </>
  );
}

createRoot(document.querySelector('#app')).render(
  <StrictMode>
    <Editor />
  </StrictMode>
);
