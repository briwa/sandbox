import { Decoration, EditorView, WidgetType, ViewPlugin, keymap } from '@codemirror/view';
import { StateField, StateEffect, Prec } from '@codemirror/state';
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
    ignoreEvent() { return true; }
  }

  class LibCard extends WidgetType {
    constructor(block, index, kind, label) { super(); this.block = block; this.index = index; this.kind = kind; this.label = label; }
    eq(o) { return this.index === o.index && this.kind === o.kind && this.label === o.label && this.block.from === o.block.from && this.block.to === o.block.to; }
    toDOM(view) {
      const card = document.createElement('div');
      card.className = 'cm-sbx-card';
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
    ignoreEvent() { return true; }
  }

  class PreviewWidget extends WidgetType {
    constructor(block, srcdoc, index) { super(); this.block = block; this.srcdoc = srcdoc; this.index = index; }

    eq(o) { return this.index === o.index && this.srcdoc === o.srcdoc; }
    toDOM(view) {
      const b = this.block;
      const fig = document.createElement('figure');
      fig.className = 'sandbox cm-sandbox';
      fig.dataset.preset = b.preset;

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
    ignoreEvent() { return true; }
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

  return [previewField, decorationField, resizePlugin, slashComplete, slashCommand];
}
