import { Decoration, EditorView, WidgetType, ViewPlugin, keymap } from '@codemirror/view';
import { EditorState, StateField, Prec, Transaction, MapMode } from '@codemirror/state';
import { autocompletion, completionStatus } from '@codemirror/autocomplete';
import { describeSandboxBlock, findSandboxBlocks, defaultToolbar, FENCE_LINE } from '../core/index.js';
import { blockIcons, iconSvg } from '../core/icons.js';

function iconChip(name, title) {
  const chip = document.createElement('span');
  chip.className = 'cm-sbx-chip icon';
  chip.title = title;
  chip.setAttribute('aria-label', title);
  chip.innerHTML = iconSvg(name, 13);
  return chip;
}

const touchesFence = (doc, from, to) => {
  for (let pos = from; ; ) {
    const line = doc.lineAt(pos);
    if (FENCE_LINE.test(line.text)) return true;
    if (line.to >= to) return false;
    pos = line.to + 1;
  }
};

// Typing prose between blocks is by far the most common edit, and it cannot change which
// blocks there are: only an edit that lands in a block or on a fence line can. Those
// rescan; everything else keeps the blocks and moves them with the text.
function nextBlocks(blocks, tr) {
  let rescan = false;
  tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    if (rescan) return;
    rescan = blocks.some((b) => b.from <= toA && b.to >= fromA)
      || touchesFence(tr.startState.doc, fromA, toA)
      || touchesFence(tr.newDoc, fromB, toB);
  });
  if (rescan) return { blocks: findSandboxBlocks(tr.newDoc.toString()), rescanned: true };
  let moved = false;
  const next = blocks.map((b) => {
    const from = tr.changes.mapPos(b.from, 1);
    const to = tr.changes.mapPos(b.to, -1);
    if (from === b.from && to === b.to) return b;
    moved = true;
    return { ...b, from, to };
  });
  return { blocks: moved ? next : blocks, rescanned: false };
}

function removeBlock(view, from, to) {
  const doc = view.state.doc;
  let end = to;
  if (end < doc.length && doc.sliceString(end, end + 1) === '\n') end += 1;
  view.dispatch({ changes: { from, to: end, insert: '' } });
  view.focus();
}

function toolBtn(className, label, onClick, icon) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = icon ? `${className} icon` : className;
  btn.title = label;
  btn.setAttribute('aria-label', label);
  if (icon) btn.innerHTML = iconSvg(icon);
  else btn.textContent = label;
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', onClick);
  return btn;
}

// `defaults` seeds every block `/snippet` opens — `{ viz: 'canvas', w: 800, h: 400 }` starts
// each new one on a canvas of that size. It reaches `onCreate` filled out as its third
// argument, ready to hand to the editor as `initial`.
export function sandboxPreview({ onEdit, onCreate, defaults, confirm = (m) => window.confirm(m) } = {}) {
  const create = (kind, pos) => onCreate?.(kind, pos, kind === 'external' ? { code: '', label: '' } : defaultToolbar(defaults));

  // A widget outlives the edits that move its block, so it looks the block up when pressed
  // rather than holding on to the positions it was drawn with.
  const blockOf = (view, index) => view.state.field(blocksField).blocks[index];

  function blockActions(view, index) {
    return [
      toolBtn('cm-sbx-btn danger', 'Remove', () => {
        if (!confirm('Remove this sandbox block?')) return;
        const b = blockOf(view, index);
        if (b) removeBlock(view, b.from, b.to);
      }, 'trash'),
    ];
  }

  // Clicking the card anywhere but its buttons opens it. Listening for the click rather
  // than the mousedown leaves the mousedown to select the block first.
  function openOnClick(card, view, index) {
    card.addEventListener('click', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      const b = blockOf(view, index);
      if (b) onEdit?.(b);
    });
  }

  class SandboxCard extends WidgetType {
    constructor(block, index) { super(); this.block = block; this.index = index; this.name = describeSandboxBlock(block).label; }
    sig() { const b = this.block; return `${b.lang}:${b.preset}:${b.bg}:${b.showCode}:${b.open}:${b.control}:${b.meta}:${this.name}`; }
    eq(o) { return this.index === o.index && this.sig() === o.sig(); }
    toDOM(view) {
      const b = this.block;
      const card = document.createElement('div');
      card.className = 'cm-sbx-card';
      card.dataset.sbxIndex = this.index;

      const chips = document.createElement('div');
      chips.className = 'cm-sbx-chips';
      const label = document.createElement('span');
      label.className = 'cm-sbx-label';
      label.textContent = this.name;
      label.title = this.name;
      chips.appendChild(label);
      for (const [icon, title] of blockIcons('figure', b)) chips.appendChild(iconChip(icon, title));
      if (b.bg) {
        const c = document.createElement('span');
        c.className = 'cm-sbx-chip';
        c.textContent = `bg=${b.bg}`;
        chips.appendChild(c);
      }

      const actions = document.createElement('div');
      actions.className = 'cm-sbx-actions';
      actions.append(...blockActions(view, this.index));

      card.append(chips, actions);
      openOnClick(card, view, this.index);
      return card;
    }
    ignoreEvent(e) { return e.type !== 'mousedown'; }
  }

  class LibCard extends WidgetType {
    constructor(block, index, kind, label) { super(); this.block = block; this.index = index; this.kind = kind; this.label = label; }
    eq(o) { return this.index === o.index && this.kind === o.kind && this.label === o.label; }
    toDOM(view) {
      const card = document.createElement('div');
      card.className = 'cm-sbx-card';
      card.dataset.sbxIndex = this.index;
      const chips = document.createElement('div');
      chips.className = 'cm-sbx-chips';
      if (this.label) {
        const lbl = document.createElement('span');
        lbl.className = 'cm-sbx-label';
        lbl.textContent = this.label;
        lbl.title = this.label;
        chips.appendChild(lbl);
      }
      for (const [icon, title] of blockIcons(this.kind, this.block)) chips.appendChild(iconChip(icon, title));
      const actions = document.createElement('div');
      actions.className = 'cm-sbx-actions';
      actions.append(...blockActions(view, this.index));
      card.append(chips, actions);
      openOnClick(card, view, this.index);
      return card;
    }
    ignoreEvent(e) { return e.type !== 'mousedown'; }
  }

  function buildDecorations(blocks) {
    const ranges = [];
    blocks.forEach((b, i) => {

      if (!b.closed) return;
      const { kind, label } = describeSandboxBlock(b);
      const widget = kind === 'figure' ? new SandboxCard(b, i) : new LibCard(b, i, kind, label);
      ranges.push(Decoration.replace({ widget, block: true }).range(b.from, b.to));
    });
    return Decoration.set(ranges, true);
  }

  const blocksField = StateField.define({
    create(state) {
      const blocks = findSandboxBlocks(state.doc.toString());
      return { blocks, deco: buildDecorations(blocks) };
    },
    update(value, tr) {
      if (!tr.docChanged) return value;
      const { blocks, rescanned } = nextBlocks(value.blocks, tr);
      return { blocks, deco: rescanned ? buildDecorations(blocks) : value.deco.map(tr.changes) };
    },
    provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
  });
  const decorations = (state) => state.field(blocksField).deco;

  const blockAt = (state, pos) => {
    let block = null;
    decorations(state).between(pos, pos, (from, to, deco) => {
      block = { from, to, index: deco.spec.widget.index };
      return false;
    });
    return block;
  };

  const blockBetween = (state, from, to, dir) => {
    let found = null;
    decorations(state).between(Math.min(from, to), Math.max(from, to), (bFrom, bTo, deco) => {
      const hit = dir > 0 ? bFrom >= from && bFrom <= to : bTo <= from && bTo >= to;
      if (!hit) return;
      found = { from: bFrom, to: bTo, index: deco.spec.widget.index };
      if (dir > 0) return false;
    });
    return found;
  };

  const edgeAt = (state, pos) => {
    const block = blockAt(state, pos);
    return block && (pos === block.from || pos === block.to) ? block : null;
  };

  const selectedBlock = (state) => {
    const sel = state.selection.main;
    if (sel.empty) return null;
    const block = blockAt(state, sel.from);
    return block && block.from === sel.from && block.to === sel.to ? block : null;
  };

  const selectBlock = (view, block) => {
    view.dispatch({ selection: { anchor: block.from, head: block.to }, scrollIntoView: true });
    return true;
  };

  const withSelected = (fn) => (view) => {
    if (view.state.selection.ranges.length > 1) return false;
    const block = selectedBlock(view.state);
    return block ? fn(view, block) : false;
  };

  const openLine = (view, pos, before) => {
    view.dispatch({
      changes: { from: pos, insert: '\n' },
      selection: { anchor: before ? pos : pos + 1 },
      scrollIntoView: true,
      userEvent: 'input',
    });
    return true;
  };

  const deleteBlock = (view, block) => {
    const doc = view.state.doc;
    const trailing = block.to < doc.length;
    const from = !trailing && block.from > 0 ? block.from - 1 : block.from;
    const to = trailing ? block.to + 1 : block.to;
    view.dispatch({ changes: { from, to }, selection: { anchor: from }, scrollIntoView: true, userEvent: 'delete' });
    return true;
  };

  const leave = (dir) => withSelected((view, block) => {
    const doc = view.state.doc;
    const anchor = dir < 0
      ? (block.from > 0 ? doc.lineAt(block.from - 1).to : block.from)
      : (block.to < doc.length ? doc.lineAt(block.to + 1).from : block.to);
    view.dispatch({ selection: { anchor }, scrollIntoView: true });
    return true;
  });

  const crossVertically = (dir) => (view) => {
    const { state } = view;
    const range = state.selection.main;
    if (state.selection.ranges.length > 1 || !range.empty) return false;
    const next = view.moveVertically(range, dir > 0).head;
    const crossed = blockBetween(state, range.head, next, dir);
    return crossed ? selectBlock(view, crossed) : false;
  };

  const blockKeymap = Prec.high(keymap.of([
    { key: 'Enter', run: withSelected((view, block) => openLine(view, block.to, false)) },
    { key: 'Shift-Enter', run: withSelected((view, block) => openLine(view, block.from, true)) },
    { key: 'Backspace', run: withSelected(deleteBlock) },
    { key: 'Delete', run: withSelected(deleteBlock) },
    { key: 'ArrowLeft', run: leave(-1) },
    { key: 'ArrowRight', run: leave(1) },
    { key: 'ArrowUp', run: (view) => leave(-1)(view) || crossVertically(-1)(view) },
    { key: 'ArrowDown', run: (view) => leave(1)(view) || crossVertically(1)(view) },
    { key: 'Escape', run: leave(1) },
  ]));

  const typeBelow = EditorView.inputHandler.of((view, from, to, text) => {
    const block = selectedBlock(view.state);
    if (!block || from !== block.from || to !== block.to) return false;
    const insert = '\n' + text;
    view.dispatch({ changes: { from: to, insert }, selection: { anchor: to + insert.length }, userEvent: 'input.type' });
    return true;
  });

  const selectOnClick = EditorView.domEventHandlers({
    mousedown(e, view) {
      const el = e.target.closest?.('[data-sbx-index]');
      if (!el || e.target.closest('button') || e.button !== 0) return !!el;
      const block = blockAt(view.state, view.posAtDOM(el));
      if (!block) return false;
      e.preventDefault();
      view.focus();
      return selectBlock(view, block);
    },
  });

  const fenceBreaks = EditorState.transactionFilter.of((tr) => {
    const { startState } = tr;
    if (!tr.docChanged || tr.isUserEvent('undo') || tr.isUserEvent('redo') || startState.selection.ranges.length > 1) return tr;
    const edits = [];
    tr.changes.iterChanges((fromA, toA, fromB, toB, text) => edits.push({ at: fromA, to: toA, text: text.toString() }));
    if (edits.length !== 1) return tr;
    let { at, to, text } = edits[0];
    const paste = tr.isUserEvent('input.paste');
    const selected = paste ? selectedBlock(startState) : null;
    if (selected && at === selected.from && to === selected.to) at = to;
    const spec = (insert, anchor) => ({
      changes: { from: at, to, insert },
      selection: { anchor },
      effects: tr.effects,
      scrollIntoView: true,
      userEvent: tr.annotation(Transaction.userEvent),
    });
    const doc = startState.doc;
    if (/```\s*$/.test(text) && (paste || at === to)) {
      const body = text.replace(/\s+$/, '');
      const lead = at > doc.lineAt(at).from ? '\n' : '';
      const gap = to < doc.length && doc.sliceString(to, to + 1) !== '\n' ? '\n' : '';
      return spec(lead + body + '\n' + gap, at + lead.length + body.length + 1);
    }
    if (at !== edits[0].at) return spec('\n' + text, at + text.length + 1);
    return tr;
  });

  const fenceGuard = EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged || tr.isUserEvent('undo') || tr.isUserEvent('redo')) return tr;
    const doc = tr.newDoc;
    const broken = [];
    decorations(tr.startState).between(0, tr.startState.doc.length, (from, to, deco) => {
      const nf = tr.changes.mapPos(from, 1, MapMode.TrackDel);
      const nt = tr.changes.mapPos(to, -1, MapMode.TrackDel);
      if (nf == null || nt == null) return;
      const block = { from, to, index: deco.spec.widget.index };
      if (nf > 0 && doc.sliceString(nf - 1, nf) !== '\n') broken.push({ pos: nf, block });
      if (nt < doc.length && doc.sliceString(nt, nt + 1) !== '\n') broken.push({ pos: nt, block });
    });
    if (!broken.length) return tr;
    if (tr.isUserEvent('delete') && tr.startState.selection.main.empty) {
      const { block } = broken[0];
      return { selection: { anchor: block.from, head: block.to }, scrollIntoView: true };
    }
    return [tr, { changes: broken.map(({ pos }) => ({ from: pos, insert: '\n' })), sequential: true }];
  });

  const selectAtEdge = EditorState.transactionFilter.of((tr) => {
    if (!tr.selection && !tr.docChanged) return tr;
    const { state } = tr;
    const sel = state.selection;
    if (sel.ranges.length > 1 || !sel.main.empty) return tr;
    const block = edgeAt(state, sel.main.head);
    if (!block) return tr;
    return [tr, { selection: { anchor: block.from, head: block.to }, sequential: true }];
  });

  // A state that starts with the cursor at a block's edge — a document that opens on a figure
  // has it at 0 — reached the view without any transaction the filter above could widen. The
  // view widens it on arrival instead, so the block is what shows as selected, not a caret
  // blinking beside it.
  const selectAtStart = ViewPlugin.define((view) => {
    const sel = view.state.selection;
    const block = sel.ranges.length === 1 && sel.main.empty ? edgeAt(view.state, sel.main.head) : null;
    if (block) queueMicrotask(() => view.dispatch({ selection: { anchor: block.from, head: block.to } }));
    return {};
  });

  const selectedMark = ViewPlugin.fromClass(
    class {
      constructor(view) { this.marked = null; this.sync(view); }
      update(u) { if (u.selectionSet || u.docChanged || u.focusChanged || u.viewportChanged) this.sync(u.view); }
      sync(view) {
        view.requestMeasure({
          read: () => (view.hasFocus && view.state.selection.ranges.length === 1 ? selectedBlock(view.state) : null),
          write: (block) => {
            this.marked?.classList.remove('cm-sbx-selected');
            this.marked = block ? view.contentDOM.querySelector(`[data-sbx-index="${block.index}"]`) : null;
            this.marked?.classList.add('cm-sbx-selected');
            view.dom.classList.toggle('cm-sbx-has-selected', !!this.marked);
          },
        });
      }
      destroy() { this.marked?.classList.remove('cm-sbx-selected'); }
    }
  );

  // Two commands is the whole surface: `/snippet` opens as a shared source block, and
  // language and viz are picked in the modal; `/lib` pulls in an external library.
  const COMMANDS = { '/snippet': 'figure', '/lib': 'external' };
  const slashCommand = Prec.high(keymap.of([{
    key: 'Enter',
    run(view) {

      if (completionStatus(view.state) === 'active') return false;
      const line = view.state.doc.lineAt(view.state.selection.main.head);
      const kind = COMMANDS[line.text.trim()];
      if (!kind) return false;
      view.dispatch({ changes: { from: line.from, to: line.to, insert: '' } });
      create(kind, line.from);
      return true;
    },
  }]));

  const SLASH_OPTIONS = [
    { label: '/snippet', kind: 'figure', detail: 'shared source or figure' },
    { label: '/lib', kind: 'external', detail: 'external library' },
  ];
  const slashComplete = autocompletion({
    override: [(ctx) => {
      const line = ctx.state.doc.lineAt(ctx.pos);
      const head = line.text.slice(0, ctx.pos - line.from);

      if (!/^\/[\w-]*$/.test(head)) return null;
      return {
        from: line.from,
        to: ctx.pos,
        options: SLASH_OPTIONS.map((o) => ({
          label: o.label,
          detail: o.detail,
          type: 'keyword',

          apply: (view) => {
            view.dispatch({ changes: { from: line.from, to: line.to, insert: '' } });
            create(o.kind, line.from);
          },
        })),
      };
    }],
  });

  return [
    blocksField,
    EditorView.atomicRanges.of((view) => decorations(view.state)),
    blockKeymap,
    typeBelow,
    selectOnClick,
    fenceBreaks,
    fenceGuard,
    selectAtEdge,
    selectAtStart,
    selectedMark,
    slashComplete,
    slashCommand,
  ];
}
