import '@briwa.dev/sandbox/styles';
import './demo.css';
import { mountFigures } from '@briwa.dev/sandbox/client';
import { renderMarkdown } from './render.js';

const SAMPLES = {
  'a first figure': `Press play to start it.

\`\`\`js canvas 460x240
loop((t) => {
  ctx.clearRect(0, 0, width, height);
  const r = 60 + Math.sin(t / 500) * 25;
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'currentColor';
  ctx.lineWidth = 2;
  ctx.stroke();
});
\`\`\`
`,

  'reset() and onCleanup()': `\`reset()\` rebuilds a figure in place — no reload. Tap the canvas to pause; the
overlay's ↺ calls it. \`onCleanup()\` is for side effects a rebuild can't see on its own.

\`\`\`js canvas 460x220 control=auto
const dots = Array.from({ length: 40 }, () => ({
  x: Math.random() * width,
  y: Math.random() * height,
  vx: (Math.random() - 0.5) * 2,
  vy: (Math.random() - 0.5) * 2,
}));

const id = setInterval(() => { dots[0].vx *= -1; }, 1500);
onCleanup(() => clearInterval(id));

loop(() => {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'currentColor';
  for (const d of dots) {
    d.x = (d.x + d.vx + width) % width;
    d.y = (d.y + d.vy + height) % height;
    ctx.fillRect(d.x, d.y, 3, 3);
  }
});
\`\`\`
`,

  'groups with id': `Two independent groups. Each figure only sees the \`lib\` blocks tagged with its own
\`id\`, so \`SHAPE\` means something different on each side.

\`\`\`js lib="left" id="left"
const SHAPE = (ctx, x, y) => { ctx.fillRect(x - 9, y - 9, 18, 18); };
\`\`\`

\`\`\`js lib="right" id="right"
const SHAPE = (ctx, x, y) => { ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill(); };
\`\`\`

\`\`\`js canvas 460x150 control=auto id="left"
loop((t) => {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'currentColor';
  for (let i = 0; i < 8; i++) SHAPE(ctx, 40 + i * 55, height / 2 + Math.sin(t / 400 + i) * 30);
});
\`\`\`

\`\`\`js canvas 460x150 control=auto id="right"
loop((t) => {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'currentColor';
  for (let i = 0; i < 8; i++) SHAPE(ctx, 40 + i * 55, height / 2 + Math.cos(t / 400 + i) * 30);
});
\`\`\`
`,

  'an error, surfaced': `A throw inside a figure is caught and shown in the frame — including one thrown
later, from inside the animation loop, long after the first frame drew.

\`\`\`js canvas 460x160 control=auto
let n = 0;
loop(() => {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'currentColor';
  ctx.fillRect(10, 10, n * 4, 20);
  if (++n > 40) throw new Error('something went wrong on frame ' + n);
});
\`\`\`
`,

  'a background, and no controls': `\`bg\` paints the figure. Without it, a figure follows the page's colour scheme —
try your OS light/dark switch on the other samples.

\`\`\`js canvas 460x200 bg="#0b1021" control=none
loop((t) => {
  ctx.clearRect(0, 0, width, height);
  for (let i = 0; i < 90; i++) {
    const x = (i * 97 + t / 30) % width;
    const y = (i * 53) % height;
    ctx.fillStyle = \`hsl(\${200 + (i % 40)} 90% \${60 + (i % 30)}%)\`;
    ctx.fillRect(x, y, 2, 2);
  }
});
\`\`\`
`,
};

const sourceEl = document.querySelector('#source');
const proseEl = document.querySelector('#playground-prose');
const statusEl = document.querySelector('#status');
const presetEl = document.querySelector('#preset');

for (const name of Object.keys(SAMPLES)) {
  presetEl.append(new Option(name, name));
}

mountFigures();

let token = 0;
async function render() {
  const mine = ++token;
  statusEl.textContent = '…';
  try {
    const html = await renderMarkdown(sourceEl.value);
    if (mine !== token) return;
    proseEl.innerHTML = html;
    statusEl.textContent = '';
  } catch (err) {
    if (mine !== token) return;
    statusEl.textContent = String(err.message || err);
  }
}

let timer;
const schedule = () => { clearTimeout(timer); timer = setTimeout(render, 400); };

sourceEl.addEventListener('input', schedule);
presetEl.addEventListener('change', () => {
  sourceEl.value = SAMPLES[presetEl.value];
  render();
});

sourceEl.value = SAMPLES[presetEl.value];
render();
