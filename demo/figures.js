import { renderMarkdown } from './render.js';

const source = `
## canvas (+ knobs)

\`\`\`js sandbox=canvas 480x260 control=autoplay code
const count = knob(60, { min: 6, max: 120 });
const radius = knob(70, { min: 20, max: 110 });
const dot = knob(3, { min: 1, max: 8 });
const filled = knob(true);
const tint = knob({ r: 244, g: 96, b: 54 }, { min: { r: 60, g: 130, b: 246 }, max: { r: 244, g: 96, b: 54 } });

loop((t) => {
  ctx.clearRect(0, 0, width, height);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + t / 2200;
    const r = radius + Math.sin(t / 700 + i / 5) * 26;
    ctx.beginPath();
    ctx.arc(width / 2 + Math.cos(a) * r, height / 2 + Math.sin(a) * r, dot, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle = \`rgb(\${tint.r} \${tint.g} \${tint.b} / \${0.35 + 0.65 * ((i / count + t / 3000) % 1)})\`;
    filled ? ctx.fill() : ctx.stroke();
  }
});
\`\`\`

## shared source

\`\`\`js sandbox open label="easing helpers"
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const pingPong = (t, ms) => {
  const p = (t % (ms * 2)) / ms;
  return easeInOut(p > 1 ? 2 - p : p);
};
\`\`\`

\`\`\`js sandbox=canvas 480x220 control=autoplay code
loop((t) => {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'currentColor';
  for (let i = 0; i < 8; i++) {
    const y = 26 + i * 24;
    const x = 30 + pingPong(t + i * 140, 1200) * (width - 60);
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
  }
});
\`\`\`

## root + external

\`\`\`text sandbox=external
https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.js
\`\`\`

\`\`\`js sandbox=root 480x140 control=none code
root.style.display = 'grid';
root.style.placeItems = 'center';
const btn = document.createElement('button');
btn.textContent = 'confetti';
btn.style.font = '600 14px system-ui';
btn.style.padding = '10px 18px';
btn.style.borderRadius = '8px';
btn.style.border = '1px solid currentColor';
btn.style.background = 'none';
btn.style.color = 'inherit';
btn.style.cursor = 'pointer';
btn.onclick = () => confetti({ particleCount: 80, spread: 60, origin: { y: 0.8 } });
root.append(btn);
\`\`\`

## vue

\`\`\`text sandbox=external
https://cdn.jsdelivr.net/npm/vue@3/dist/vue.global.prod.js
\`\`\`

\`\`\`js sandbox=root 480x170 control=none code
const { createApp, ref } = Vue;
const step = knob(1, { min: 1, max: 10 });
const box = { display: 'flex', gap: '14px', alignItems: 'center', justifyContent: 'center', height: '100%', font: '600 15px system-ui' };
const btn = { font: 'inherit', fontSize: '20px', width: '38px', height: '38px', borderRadius: '8px', border: '1px solid currentColor', background: 'none', color: 'inherit', cursor: 'pointer' };
const app = createApp({
  setup: () => ({ n: ref(0), step, box, btn }),
  template: \`
    <div :style="box">
      <button :style="btn" @click="n -= step">-</button>
      <strong :style="{ fontSize: '28px', minWidth: '3ch', textAlign: 'center' }">{{ n }}</strong>
      <button :style="btn" @click="n += step">+</button>
    </div>\`,
});
app.mount(root);
onCleanup(() => app.unmount());
\`\`\`

\`\`\`js sandbox label=StatChip
const StatChip = {
  template: '<span style="font:600 13px system-ui;padding:6px 12px;border-radius:999px;border:1px solid currentColor"><slot /></span>',
};
\`\`\`

\`\`\`js sandbox=root 480x120 control=none code
const app = Vue.createApp({
  components: { StatChip },
  setup: () => ({ words: ['source', 'external', 'canvas'] }),
  template: '<div style="display:flex;gap:10px;align-items:center;justify-content:center;height:100%"><StatChip v-for="w in words" :key="w">{{ w }}</StatChip></div>',
});
app.mount(root);
onCleanup(() => app.unmount());
\`\`\`
`;

document.querySelector('#figures-prose').innerHTML = await renderMarkdown(source);
