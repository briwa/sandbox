import '@briwa.dev/sandbox/styles';
import './demo.css';
import { mountFigures } from '@briwa.dev/sandbox/client';
import { renderMarkdown } from './render.js';

const source = `
## canvas

\`\`\`js canvas 480x260 control=auto code
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

## svg

\`\`\`js svg 480x160 control=none code
svg.innerHTML = Array.from({ length: 24 }, (_, i) => {
  const x = 12 + i * 19.5;
  const h = 20 + Math.abs(Math.sin(i / 3)) * 110;
  return \`<rect x="\${x}" y="\${150 - h}" width="12" height="\${h}" rx="2" fill="hsl(\${i * 14} 65% 55%)"/>\`;
}).join('');
\`\`\`

## Shared source with \`lib\`

\`\`\`js lib="polar helpers"
const polar = (cx, cy, r, a) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
\`\`\`

\`\`\`js canvas 480x220 control=auto code
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

\`\`\`js root 480x140 control=none code
root.style.display = 'grid';
root.style.placeItems = 'center';
root.innerHTML = '<p style="font:600 15px system-ui">any DOM you like, mounted into #root</p>';
\`\`\`

## vue

\`\`\`vue 480x170 code
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


\`\`\`vue lib=StatChip id=chips
<template>
  <span :style="chip"><slot /></span>
</template>
<script setup>
const chip = {
  font: '600 13px system-ui',
  padding: '6px 12px',
  borderRadius: '999px',
  border: '1px solid currentColor',
};
</script>
\`\`\`

\`\`\`vue 480x120 id=chips
<template>
  <div :style="row">
    <StatChip v-for="w in words" :key="w">{{ w }}</StatChip>
  </div>
</template>
<script setup>
const words = ['lib', 'external', 'vue'];
const row = { display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'center', height: '100%' };
</script>
\`\`\`
`;

const mount = document.querySelector('#figures-prose');
mount.innerHTML = await renderMarkdown(source);

mountFigures();
