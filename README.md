# @briwa.dev/sandbox

Interactive figure sandboxes for markdown. A fenced code block becomes a live, isolated iframe
figure — with shared libraries, playback controls, theme-following backgrounds, and an authoring UI.

````markdown
```js canvas 640x360 code
loop((t) => {
  ctx.clearRect(0, 0, width, height);
  ctx.beginPath();
  ctx.arc(width / 2 + Math.sin(t / 500) * 100, height / 2, 30, 0, Math.PI * 2);
  ctx.fill();
});
```
````

Each figure renders into its own `srcdoc` iframe with `sandbox="allow-scripts"` and no
`allow-same-origin`: a disposable realm with isolated globals, clean animation teardown, and a null
origin. It cannot reach the host page.

## Layers

Import only what you need. Each subpath is independently usable.

| Subpath | What it is | Needs |
| --- | --- | --- |
| `@briwa.dev/sandbox` | Core: parse fence meta, build srcdocs, serialize fences | — |
| `@briwa.dev/sandbox/client` | Browser runtime: size, theme and visibility-gate figures | DOM |
| `@briwa.dev/sandbox/remark` | The unified plugin that rewrites fences | — |
| `@briwa.dev/sandbox/codemirror` | Editor widgets: cards, inline previews, slash commands | `@codemirror/*` |
| `@briwa.dev/sandbox/editor` | CodeMirror services + a standalone syntax highlighter | `@codemirror/*` |
| `@briwa.dev/sandbox/react` | The authoring modals | `react` |
| `@briwa.dev/sandbox/astro` | Integration wiring all of the above | an Astro site |

The core is pure: string in, string out, zero imports. `codemirror`, `editor` and `react` declare
their CodeMirror and React needs as **peer dependencies**, so your copy is the only one loaded —
two React instances break hooks, and two `@codemirror/state` instances reject each other's
extensions. Nothing is bundled into the package.

`@astrojs/internal-helpers` is the one optional peer: it is imported dynamically, only when you
call `shikiHighlight()`, and an Astro site already has it.

It runs identically in a build, a Cloudflare worker, and the browser.

## Astro

```js
import { defineConfig } from 'astro/config';
import sandbox from '@briwa.dev/sandbox/astro';

export default defineConfig({
  integrations: [sandbox()],
});
```

That registers the remark plugins, injects the client runtime, and adds the stylesheet.

**If your site sets `markdown.processor`,** Astro ignores `markdown.remarkPlugins`, so the
integration cannot inject into the pipeline. Wire the plugins yourself and turn that half off:

```js
import { unified } from '@astrojs/markdown-remark';
import sandbox, { remarkSandbox, remarkStripHtml, shikiHighlight } from '@briwa.dev/sandbox/astro';

export default defineConfig({
  integrations: [sandbox({ remark: false })],
  markdown: {
    syntaxHighlight: 'shiki',
    shikiConfig: { theme: 'css-variables' },
    // ORDER MATTERS — see below.
    processor: unified({
      remarkPlugins: [remarkStripHtml, [remarkSandbox, { highlight: shikiHighlight() }]],
    }),
  },
});
```

### Ordering

`remarkStripHtml` **must** run before `remarkSandbox`. Astro passes raw HTML through, so an authored
`<script>` would execute in a reader's browser; the strip pass removes it. But `remarkSandbox` emits
its figures *as* raw HTML nodes — reverse the order and the figures are stripped along with the
untrusted markup.

## Without Astro

The remark plugin is a plain unified plugin — nothing about it is Astro-specific:

```js
import { remarkSandbox, remarkStripHtml } from '@briwa.dev/sandbox/remark';
```

Highlighting is injected rather than imported. Pass `{ highlight: (code, lang) => html }`; with no
highlighter, code renders as an escaped `<pre>` — a degraded look, never a build failure.

Two highlighters ship with the package:

```js
import { highlightCode } from '@briwa.dev/sandbox/editor';  // no Astro, no Shiki
import { shikiHighlight } from '@briwa.dev/sandbox/astro';  // Shiki, via Astro
```

`highlightCode` reuses the Lezer parsers CodeMirror already depends on, so it adds no dependency and
covers `js` and `vue`. It emits `.sbx-tok-*` spans coloured by the `--sbx-code-*` tokens — the same
palette the CodeMirror editor uses, so an editor pane and a published code block match.

On the page, wire the frames once:

```js
import { mountFigures } from '@briwa.dev/sandbox/client';
const stop = mountFigures();
```

A figure iframe is null-origin, so it cannot size itself in the host layout, read the host's CSS
variables, or tell whether the reader can see it. `mountFigures` hands it all three over
postMessage: it sizes each frame to its reported height, pushes the resolved background so figures
follow the theme, gates animation on visibility so off-screen figures stop burning CPU, and runs the
"Show code" toggle.

## Fence syntax

| Form | Meaning |
| --- | --- |
| ```` ```js canvas ```` | Canvas figure; `ctx`, `width`, `height`, `loop()`, `reset()`, `onCleanup()` |
| ```` ```js svg ```` | SVG figure; `svg`, `width`, `height` |
| ```` ```js root ```` | Bare sized mount point, for a library that owns its container |
| ```` ```vue ```` | Vue SFC mounted into `#root` |
| ```` ```js lib="name" ```` | Shared source, concatenated into every figure in the group |
| ```` ```vue lib="Name" ```` | Shared SFC component, registered globally |
| ```` ```js external-lib ```` | Body is a list of https `.js` URLs to inject |

Modifiers: `640x360` size · `bg="#111"` background · `code` show-code toggle ·
`control=pausable|auto|none` playback · `preview` nominate as cover · `label="…"` human name for a
figure · `id="group"` partition blocks into groups so a figure only pulls its own group's libraries.

`label` is free text — double quotes and ampersands in it are escaped as `&quot;` / `&amp;` in the
fence and decoded on the way back. It names a figure for a table of contents or a sidebar. `id`
stays functional: it partitions groups and is restricted to `[\w-]+`.

Every fence kind reports its name as `label`, so a consumer reads one field. Figures take the
`label="…"` tag; `lib` and `external-lib` fences already carry a name in the tag itself, and that
value *is* their `label`. A `vue lib` fence also keeps `componentName` alongside it — that one is
functional, the validated tag the component registers under, so a name Vue would reject shows up as
a `label` with no `componentName`.

To list the blocks in a document, hand each one from `findSandboxBlocks` to `describeSandboxBlock`:

```js
import { findSandboxBlocks, describeSandboxBlock } from '@briwa.dev/sandbox';

findSandboxBlocks(doc).map(describeSandboxBlock);
// → { kind: 'figure' | 'snippet' | 'external' | 'vue-lib', label, detail }
```

Its `label` is always a non-empty string, so a row renders it with no branching: the fence's own
`label` wins, then the first function or class declared in the fence body, then the preset and size
(`canvas 640×360`). `detail` is secondary text — the preset and size, the kind, the `#group` — and
may be empty. An `external-lib` whose name is a raw-gist URL is trimmed to its filename.

An ordinary ```` ```js ```` fence with no preset passes straight through to your normal highlighter.

## The authoring UI

`SandboxModal` and `SandboxExternalModal` cover the viewport by default — `position: fixed`, the
page behind them scroll-locked, `aria-modal="true"`. A host that already has an editor layout
usually wants them filling one pane of it instead. That is `variant="inline"`:

```jsx
/* the container the panel should fill — any positioned element */
<div className="editor-main">
  <MyEditor />
  {editing && (
    <SandboxModal
      variant="inline"
      kind="figure"
      initial={editing.initial}
      siblings={editing.siblings}
      onSave={save}
      onCancel={() => setEditing(null)}
    />
  )}
</div>
```

Inline drops the three things that only make sense full-screen: it positions `absolute` rather than
`fixed`, leaves `document.body` scrolling alone, and omits `aria-modal` — the rest of your app is
still reachable, so claiming otherwise would lie to a screen reader. **The container must establish
a containing block** (`position: relative` is enough); with none, `inset: 0` climbs to the next
positioned ancestor and the panel covers more than you meant.

Everything else is unchanged, including `draftKey` recovery and the shortcuts: ⌘S saves, ⌘F finds,
Esc closes once there is nothing unsaved. `className` is appended to the root if you need a handle
of your own, and both components take the same two props.

## Styling

```js
import '@briwa.dev/sandbox/styles';           // everything
import '@briwa.dev/sandbox/styles/figure.css'; // published figures only
import '@briwa.dev/sandbox/styles/editor.css'; // authoring UI only
```

Colors defer to your tokens (`--ink`, `--bg`, `--muted`, `--rule`, `--accent`, `--hover-bg`) and
fall back to real values when absent — so a site with a palette gets its own with no configuration.
Override any `--sbx-*` token to restyle. See `styles/tokens.css`.

Syntax colors work the same way: `--sbx-code-*` drives both the CodeMirror editor and rendered code
blocks, and each defers to Astro's `--astro-code-*` when Shiki is emitting them — so an Astro site
keeps its Shiki theme and a standalone one gets a built-in palette, light and dark.

If the host's background variable isn't `--bg`, tell the client runtime:

```js
import { configureSandboxClient } from '@briwa.dev/sandbox/client';
configureSandboxClient({ backgroundVar: '--page-bg' });
```

## The message protocol

Frame and host talk over `postMessage`; the keys are exported from the core so a host imports the
name instead of retyping the string.

| Constant | Direction | Meaning |
| --- | --- | --- |
| `MSG_HEIGHT` | frame → host | Document height, so the host can size the iframe |
| `MSG_RESET_DONE` | frame → host | The frame ran its own `reset()` |
| `MSG_BG` | host → frame | Resolved page background |
| `MSG_VISIBLE` | host → frame | Whether the reader can see this figure |
| `MSG_PLAY` / `MSG_PAUSE` / `MSG_RESET` | host → frame | Playback control |

Hover-to-play covers, for instance, are just `MSG_PLAY`:

```js
import { MSG_PLAY } from '@briwa.dev/sandbox';
frame.contentWindow.postMessage({ [MSG_PLAY]: true }, '*');
```

Note: `buildSrcdoc` inlines these keys as literals in the terse JS it emits, so the constants and
those literals must stay in sync. Renaming a key means grepping `src/core/index.js` for the string.

## Demo

```
npm run dev            # the demo pages, on Vite
npm run demo:build     # …built to demo-dist/
npm run demo:preview   # serve that build locally
```

`demo-dist/` is a plain static bundle with relative asset paths (`base: './'`), so it works served
from a domain root or any subdirectory — GitHub Pages project sites, Netlify, S3, a folder on an
existing site. Upload the directory; there is nothing to configure. The only network call at
runtime is the Vue runtime a `vue` figure pulls from jsDelivr, and only if such a figure is on the
page — override it with `configureVueRuntime()` to self-host.

Three pages, importing the package by its public name (the aliases in `vite.config.js` point them
at `src/`, so edits show up with no package rebuild):

- **figures** — every block type, rendered from one markdown document
- **playground** — edit markdown, watch the figures rebuild
- **editor** — the authoring UI: cards, slash commands, inline previews, the modals

The first two render markdown *in the browser*, which is the point: the remark plugin is plain
unified, so the same pipeline a build runs also runs on a page — highlighted by `highlightCode`,
with no Astro and no Shiki anywhere.

`demo/editor.jsx` is worth reading if you're integrating: the CodeMirror layer reports Edit/Create
through callbacks and ships no editing UI of its own, and that file is the ~60 lines that answer
them with the React modals and splice the result back into the document.

## Development

```
npm run build   # bundle src/ into dist/
npm run watch   # …and rebuild on change
```

The package ships bundled because the React layer is `.jsx`, and a consumer's bundler generally
won't run a JSX transform over files in `node_modules`. Peer dependencies stay external.

`dist/` is gitignored, so a fresh clone needs `npm run build` before a linked consumer will
resolve it. `prepack` covers publishing.
