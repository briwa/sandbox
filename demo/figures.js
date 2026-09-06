import '@briwa.dev/sandbox/styles';
import './demo.css';
import { mountFigures } from '@briwa.dev/sandbox/client';
import { renderMarkdown } from './render.js';

const source = `
## canvas

The default. \`ctx\`, \`width\`, \`height\` and \`loop()\` are already in scope, and the figure sits
behind a play button until you press it.

\`\`\`js canvas 480x260
loop((t) => {
  ctx.clearRect(0, 0, width, height);
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2 + t / 2200;
    const r = 70 + Math.sin(t / 700 + i / 5) * 26;
    ctx.beginPath();
    ctx.arc(width / 2 + Math.cos(a) * r, height / 2 + Math.sin(a) * r, 3, 0, Math.PI * 2);
    ctx.fillStyle = \`hsl(\${(i * 6 + t / 40) % 360} 70% 55%)\`;
    ctx.fill();
  }
});
\`\`\`

## control=auto, and show the code

\`auto\` runs on load instead of waiting for a press. \`code\` adds the Show-code toggle — the
source pane is capped to the figure's own height so toggling never resizes the page.

\`\`\`js canvas 480x180 control=auto code
loop((t) => {
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = 'currentColor';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= width; x += 4) {
    const y = height / 2 + Math.sin(x / 40 + t / 500) * 40 * Math.sin(x / 300);
    x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
});
\`\`\`

## svg

A sized \`<svg>\` instead of a canvas. Static figures need no playback controls at all.

\`\`\`js svg 480x160 control=none
svg.innerHTML = Array.from({ length: 24 }, (_, i) => {
  const x = 12 + i * 19.5;
  const h = 20 + Math.abs(Math.sin(i / 3)) * 110;
  return \`<rect x="\${x}" y="\${150 - h}" width="12" height="\${h}" rx="2" fill="hsl(\${i * 14} 65% 55%)"/>\`;
}).join('');
\`\`\`

## Shared source with \`lib\`

A \`lib\` block is not a figure. Its source is concatenated into every figure in the same group,
which is how figures share helpers — they run in separate realms and cannot share globals.

\`\`\`js lib="polar helpers"
const polar = (cx, cy, r, a) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
\`\`\`

\`\`\`js canvas 480x220 control=auto
loop((t) => {
  ctx.clearRect(0, 0, width, height);
  ctx.beginPath();
  for (let i = 0; i <= 200; i++) {
    const a = (i / 200) * Math.PI * 2;
    const [x, y] = polar(width / 2, height / 2, 60 + Math.sin(a * 5 + t / 600) * 30, a);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.strokeStyle = 'currentColor';
  ctx.stroke();
});
\`\`\`

## root

A bare, sized mount point — for a library that wants to own its own container.

\`\`\`js root 480x140 control=none
root.style.display = 'grid';
root.style.placeItems = 'center';
root.innerHTML = '<p style="font:600 15px system-ui">any DOM you like, mounted into #root</p>';
\`\`\`

## vue

A \`vue\` fence is a single-file component, compiled in the frame and mounted into \`#root\`.
Vue is interactive on load, so there is no play button.

\`\`\`vue 480x170
<template>
  <div :style="box">
    <button :style="btn" @click="n--">−</button>
    <strong :style="{ fontSize: '28px', minWidth: '3ch', textAlign: 'center' }">{{ n }}</strong>
    <button :style="btn" @click="n++">+</button>
  </div>
</template>
<script setup>
import { ref } from 'vue';
const n = ref(0);
const box = { display: 'flex', gap: '14px', alignItems: 'center', justifyContent: 'center', height: '100%', font: '600 15px system-ui' };
const btn = { font: 'inherit', fontSize: '20px', width: '38px', height: '38px', borderRadius: '8px', border: '1px solid currentColor', background: 'none', color: 'inherit', cursor: 'pointer' };
</script>
\`\`\`

## Raw HTML never survives

The markdown below this line contains a \`<script>\` tag. \`remarkStripHtml\` runs before
\`remarkSandbox\`, so it is gone from the output while the figures — which are themselves emitted as
raw HTML — are untouched.

<script>document.title = 'this never runs'</script>
`;

const mount = document.querySelector('#prose');
mount.innerHTML = await renderMarkdown(source);

mountFigures();
