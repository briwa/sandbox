import { Decoration, EditorView, WidgetType, ViewPlugin, keymap } from '@codemirror/view';
import { EditorState, StateField, StateEffect, Prec, Transaction } from '@codemirror/state';
import { autocompletion, completionStatus } from '@codemirror/autocomplete';
import {
  buildSrcdoc,
  buildVueSrcdoc,
  describeSandboxBlock,
  findSandboxBlocks,
  sandboxPrelude,
  sandboxExternals,
  sandboxVueComponents,
} from '../core/index.js';
import { mountFigures } from '../client/index.js';
import { iconSvg, KIND_ICONS } from '../core/icons.js';

function iconChip(name, title) {
  const chip = document.createElement('span');
  chip.className = 'cm-sbx-chip icon';
  chip.title = title;
  chip.setAttribute('aria-label', title);
  chip.innerHTML = iconSvg(name, 13);
  return chip;
}

const togglePreview = StateEffect.define();

const previewField = StateField.define({
  create() { return new Set(); },
  update(set, tr) {
    let next = set;
    for (const e of tr.effects) {
      if (e.is(togglePreview)) {
        next = new Set(next);
        if (next.has(e.value)) next.delete(e.value);
        else next.add(e.value);
      }
    }
    return next;
  },
});

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

// The widget hides the fence, so selecting it in the editor is not an option.
function copyBlock(view, block, btn) {
  const fence = view.state.doc.sliceString(block.from, block.to);
  if (!navigator.clipboard) return;
  const state = (icon, label) => {
    btn.innerHTML = iconSvg(icon);
    btn.title = label;
    btn.setAttribute('aria-label', label);
  };
  navigator.clipboard.writeText(fence).then(() => {
    clearTimeout(btn.copyTimer);
    state('check', 'Copied');
    btn.copyTimer = setTimeout(() => state('copy', 'Copy fence'), 1200);
  }, () => {});
}

export function sandboxPreview({ onEdit, onCreate, confirm = (m) => window.confirm(m) } = {}) {

  function blockActions(view, block) {
    const copy = toolBtn('cm-sbx-btn', 'Copy fence', () => copyBlock(view, block, copy), 'copy');
    return [
      copy,
      toolBtn('cm-sbx-btn', 'Edit', () => onEdit?.(block), 'pencil'),
      toolBtn('cm-sbx-btn danger', 'Remove', () => {
        if (confirm('Remove this sandbox block?')) removeBlock(view, block.from, block.to);
      }, 'trash'),
    ];
  }

  class SandboxCard extends WidgetType {
    constructor(block, index) { super(); this.block = block; this.index = index; this.name = describeSandboxBlock(block).label; }
    sig() { const b = this.block; return `${b.from}:${b.to}:${b.lang}:${b.preset}:${b.bg}:${b.showCode}:${b.control}:${b.meta}:${this.name}`; }
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
      chips.appendChild(iconChip(b.lang, b.lang));
      chips.appendChild(iconChip(b.preset, b.preset));
      if (b.bg) {
        const c = document.createElement('span');
        c.className = 'cm-sbx-chip';
        c.textContent = `bg=${b.bg}`;
        chips.appendChild(c);
      }

      const actions = document.createElement('div');
      actions.className = 'cm-sbx-actions';
      actions.append(
        toolBtn('cm-sbx-btn', 'Show preview', () => view.dispatch({ effects: togglePreview.of(this.index) }), 'eye'),
        ...blockActions(view, this.block),
      );

      card.append(chips, actions);
      return card;
    }
    ignoreEvent(e) { return e.type !== 'mousedown'; }
  }

  class LibCard extends WidgetType {
    constructor(block, index, kind, label) { super(); this.block = block; this.index = index; this.kind = kind; this.label = label; }
    eq(o) { return this.index === o.index && this.kind === o.kind && this.label === o.label && this.block.from === o.block.from && this.block.to === o.block.to; }
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
      for (const [icon, title] of KIND_ICONS[this.kind] ?? KIND_ICONS.source) chips.appendChild(iconChip(icon, title));
      const actions = document.createElement('div');
      actions.className = 'cm-sbx-actions';
      actions.append(...blockActions(view, this.block));
      card.append(chips, actions);
      return card;
    }
    ignoreEvent(e) { return e.type !== 'mousedown'; }
  }

  class PreviewWidget extends WidgetType {
    constructor(block, srcdoc, index) { super(); this.block = block; this.srcdoc = srcdoc; this.index = index; }

    eq(o) { return this.index === o.index && this.srcdoc === o.srcdoc; }
    toDOM(view) {
      const b = this.block;
      const fig = document.createElement('figure');
      fig.className = 'sandbox cm-sandbox';
      fig.dataset.preset = b.preset;
      fig.dataset.sbxIndex = this.index;

      const stage = document.createElement('div');
      stage.className = 'sandbox-stage';
      const iframe = document.createElement('iframe');
      iframe.className = 'sandbox-frame';
      iframe.setAttribute('sandbox', 'allow-scripts');
      iframe.title = `live ${b.lang === 'vue' ? 'vue' : b.preset} preview`;
      iframe.srcdoc = this.srcdoc;
      stage.appendChild(iframe);

      const bar = document.createElement('div');
      bar.className = 'cm-sbx-actions cm-sbx-actions-preview';
      bar.append(
        toolBtn('cm-sbx-btn', 'Hide preview', () => view.dispatch({ effects: togglePreview.of(this.index) }), 'eyeOff'),
        ...blockActions(view, this.block),
      );

      fig.append(stage, bar);
      return fig;
    }
    ignoreEvent(e) { return e.type !== 'mousedown'; }
  }

  function buildDecorations(state) {
    const previews = state.field(previewField);
    const blocks = findSandboxBlocks(state.doc.toString());
    const ranges = [];
    blocks.forEach((b, i) => {

      if (!b.closed) return;
      const replace = (widget) => ranges.push(Decoration.replace({ widget, block: true }).range(b.from, b.to));
      const { kind, label } = describeSandboxBlock(b);
      if (kind !== 'figure') {
        replace(new LibCard(b, i, kind, label));
      } else if (previews.has(i)) {

        const externals = sandboxExternals(blocks);
        const srcdoc = b.lang === 'vue'
          ? buildVueSrcdoc(b, b.code, { externals, components: sandboxVueComponents(blocks) })
          : buildSrcdoc(b, b.code, sandboxPrelude(blocks), externals);
        replace(new PreviewWidget(b, srcdoc, i));
      } else {
        replace(new SandboxCard(b, i));
      }
    });
    return Decoration.set(ranges, true);
  }

  const decorationField = StateField.define({
    create(state) { return buildDecorations(state); },
    update(value, tr) {
      if (tr.docChanged || tr.effects.some((e) => e.is(togglePreview))) return buildDecorations(tr.state);
      return value;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  const blockAt = (state, pos) => {
    let block = null;
    state.field(decorationField).between(pos, pos, (from, to, deco) => {
      block = { from, to, index: deco.spec.widget.index };
      return false;
    });
    return block;
  };

  const blockBetween = (state, from, to, dir) => {
    let found = null;
    state.field(decorationField).between(Math.min(from, to), Math.max(from, to), (bFrom, bTo, deco) => {
      const hit = dir > 0 ? bFrom >= from && bFrom <= to : bTo <= from && bTo >= to;
      if (!hit) return;
      found = { from: bFrom, to: bTo, index: deco.spec.widget.index };
      if (dir > 0) return false;
    });
    return found;
  };

  const edgeAt = (state, pos) => {
    const block = blockAt(state, pos);
    if (!block || (pos !== block.from && pos !== block.to)) return null;
    return { ...block, side: pos === block.from ? 'before' : 'after' };
  };

  const mainEdge = (state) => {
    const sel = state.selection.main;
    return sel.empty ? edgeAt(state, sel.head) : null;
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

  const leave = (view, block, dir) => {
    const doc = view.state.doc;
    if (dir < 0) {
      const anchor = block.from > 0 ? doc.lineAt(block.from - 1).to : block.from;
      view.dispatch({ selection: { anchor }, scrollIntoView: true });
    } else {
      const anchor = block.to < doc.length ? doc.lineAt(block.to + 1).from : block.to;
      view.dispatch({ selection: { anchor }, scrollIntoView: true });
    }
    return true;
  };

  const stepOut = (view, edge, dir) => {
    const doc = view.state.doc;
    const line = dir < 0 ? (edge.from > 0 ? doc.lineAt(edge.from - 1) : null) : (edge.to < doc.length ? doc.lineAt(edge.to + 1) : null);
    if (!line) return true;
    if (line.length === 0) {
      const changes = dir < 0 ? { from: line.from, to: edge.from } : { from: edge.to, to: line.to };
      view.dispatch({ changes, selection: { anchor: dir < 0 ? line.from : edge.to }, userEvent: dir < 0 ? 'delete.backward' : 'delete.forward' });
    } else {
      view.dispatch({ selection: { anchor: dir < 0 ? line.to : line.from }, scrollIntoView: true });
    }
    return true;
  };

  const vertical = (dir) => (view) => {
    const { state } = view;
    if (state.selection.ranges.length > 1) return false;
    const selected = selectedBlock(state);
    if (selected) return leave(view, selected, dir);
    const range = state.selection.main;
    if (!range.empty) return false;
    const edge = mainEdge(state);
    if (edge) {
      if ((edge.side === 'before') === (dir > 0)) return selectBlock(view, edge);
      return false;
    }
    const next = view.moveVertically(range, dir > 0).head;
    const crossed = blockBetween(state, range.head, next, dir);
    return crossed ? selectBlock(view, crossed) : false;
  };

  const horizontal = (dir) => (view) => {
    const { state } = view;
    if (state.selection.ranges.length > 1) return false;
    const selected = selectedBlock(state);
    if (selected) return leave(view, selected, dir);
    const range = state.selection.main;
    if (!range.empty) return false;
    const edge = mainEdge(state);
    if (edge) {
      if ((edge.side === 'before') === (dir > 0)) return selectBlock(view, edge);
      return leave(view, edge, dir);
    }
    const line = state.doc.lineAt(range.head);
    if (range.head !== (dir > 0 ? line.to : line.from)) return false;
    const block = edgeAt(state, range.head + dir);
    return block ? selectBlock(view, block) : false;
  };

  const erase = (dir) => (view) => {
    const selected = selectedBlock(view.state);
    if (selected) return deleteBlock(view, selected);
    const edge = mainEdge(view.state);
    if (!edge) return false;
    if ((edge.side === 'after') === (dir < 0)) return selectBlock(view, edge);
    return stepOut(view, edge, dir);
  };

  const enter = (view) => {
    const selected = selectedBlock(view.state);
    if (selected) return openLine(view, selected.to, false);
    const edge = mainEdge(view.state);
    if (!edge) return false;
    return edge.side === 'before' ? openLine(view, edge.from, true) : openLine(view, edge.to, false);
  };

  const edgeKeymap = Prec.high(keymap.of([
    { key: 'Enter', run: enter },
    { key: 'Backspace', run: erase(-1) },
    { key: 'Delete', run: erase(1) },
    { key: 'ArrowLeft', run: horizontal(-1) },
    { key: 'ArrowRight', run: horizontal(1) },
    { key: 'ArrowUp', run: vertical(-1) },
    { key: 'ArrowDown', run: vertical(1) },
    { key: 'Escape', run: (view) => {
      const selected = selectedBlock(view.state);
      return selected ? leave(view, selected, 1) : false;
    } },
  ]));

  const edgeInput = EditorView.inputHandler.of((view, from, to, text) => {
    const selected = selectedBlock(view.state);
    const edge = from === to ? edgeAt(view.state, from) : null;
    if (selected && from === selected.from && to === selected.to) {
      const insert = '\n' + text;
      view.dispatch({ changes: { from: to, insert }, selection: { anchor: to + insert.length }, userEvent: 'input.type' });
      return true;
    }
    if (!edge) return false;
    const insert = edge.side === 'before' ? text + '\n' : '\n' + text;
    view.dispatch({
      changes: { from, insert },
      selection: { anchor: edge.side === 'before' ? from + text.length : from + insert.length },
      userEvent: 'input.type',
    });
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
    const { at, to, text } = edits[0];
    const doc = startState.doc;
    const paste = tr.isUserEvent('input.paste');
    const spec = (insert, anchor) => ({
      changes: { from: at, to, insert },
      selection: { anchor },
      effects: tr.effects,
      scrollIntoView: true,
      userEvent: tr.annotation(Transaction.userEvent),
    });

    if (/```\s*$/.test(text) && (paste || at === to)) {
      const body = text.replace(/\s+$/, '');
      const lead = /^```/.test(body) && at > doc.lineAt(at).from ? '\n' : '';
      const gap = to < doc.length && doc.sliceString(to, to + 1) !== '\n' ? '\n' : '';
      return spec(lead + body + '\n' + gap, at + lead.length + body.length + 1);
    }

    const edge = paste && at === to ? mainEdge(startState) : null;
    if (!edge || !text) return tr;
    if (edge.side === 'before') return spec(text.endsWith('\n') ? text : text + '\n', at + text.replace(/\n$/, '').length);
    const insert = text.startsWith('\n') ? text : '\n' + text;
    return spec(insert, at + insert.length);
  });

  const CARET_CLASSES = ['cm-sbx-caret-before', 'cm-sbx-caret-after', 'cm-sbx-selected'];
  const edgeCaret = ViewPlugin.fromClass(
    class {
      constructor(view) { this.marked = null; this.sync(view); }
      update(u) { if (u.selectionSet || u.docChanged || u.focusChanged || u.viewportChanged) this.sync(u.view); }
      sync(view) {
        view.requestMeasure({
          read: () => {
            if (!view.hasFocus || view.state.selection.ranges.length > 1) return null;
            const selected = selectedBlock(view.state);
            if (selected) return { index: selected.index, cls: 'cm-sbx-selected' };
            const edge = mainEdge(view.state);
            return edge ? { index: edge.index, cls: `cm-sbx-caret-${edge.side}` } : null;
          },
          write: (mark) => {
            this.marked?.classList.remove(...CARET_CLASSES);
            this.marked = mark ? view.contentDOM.querySelector(`[data-sbx-index="${mark.index}"]`) : null;
            if (this.marked) this.marked.classList.add(mark.cls);
            view.dom.classList.toggle('cm-sbx-at-edge', !!this.marked);
          },
        });
      }
      destroy() { this.marked?.classList.remove(...CARET_CLASSES); }
    }
  );

  const resizePlugin = ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.stop = mountFigures({
          root: () => view.dom,
          selector: '.cm-sandbox iframe',
          sizeCode: false,
          toggle: false,
          prime: false,
          onResize: () => view.requestMeasure(),
        });
      }
      destroy() { this.stop(); }
    }
  );

  // Two commands is the whole surface: language and viz are picked in the modal.
  const COMMANDS = { '/sandbox': 'figure', '/sandbox-external': 'external' };
  const slashCommand = Prec.high(keymap.of([{
    key: 'Enter',
    run(view) {

      if (completionStatus(view.state) === 'active') return false;
      const line = view.state.doc.lineAt(view.state.selection.main.head);
      const kind = COMMANDS[line.text.trim()];
      if (!kind) return false;
      view.dispatch({ changes: { from: line.from, to: line.to, insert: '' } });
      onCreate?.(kind, line.from);
      return true;
    },
  }]));

  const SLASH_OPTIONS = [
    { label: '/sandbox', kind: 'figure', detail: 'figure or shared source' },
    { label: '/sandbox-external', kind: 'external', detail: 'external library' },
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
            onCreate?.(o.kind, line.from);
          },
        })),
      };
    }],
  });

  return [
    previewField,
    decorationField,
    EditorView.atomicRanges.of((view) => view.state.field(decorationField)),
    edgeKeymap,
    edgeInput,
    selectOnClick,
    fenceBreaks,
    edgeCaret,
    resizePlugin,
    slashComplete,
    slashCommand,
  ];
}
