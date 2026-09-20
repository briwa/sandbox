import '@briwa.dev/sandbox/styles';
import './demo.css';
import { playFigure, pauseFigure, resetFigure } from '@briwa.dev/sandbox/client';
import { renderMarkdown } from './render.js';

const WAVE = `loop((t) => {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'currentColor';
  for (let i = 0; i < 14; i++) {
    const x = 28 + i * ((width - 56) / 13);
    const y = height / 2 + Math.sin(t / 420 + i / 2.2) * (height / 2 - 22);
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
});`;

const sample = (control) =>
  '```sandbox=js viz 460x150 control=' + control + '\n' + WAVE + '\n```';

const source = `

## pausable (default) - starts off paused

${sample('pausable')}

## auto - runs on its own

${sample('auto')}

## none - uncontrollable

${sample('none')}

## hover - runs while pointed at

${sample('hover')}

## manual - the page drives it

Controlled by \`playFigure\`, \`pauseFigure\` and \`resetFigure\` from \`@briwa.dev/sandbox/client\`

${sample('manual')}
`;

const mount = document.querySelector('#controls-prose');
mount.innerHTML = await renderMarkdown(source);

const manual = mount.querySelector(".sandbox[data-control='manual']");
const bar = document.createElement('div');
bar.className = 'manual-controls';
for (const [text, action] of [['play', playFigure], ['pause', pauseFigure], ['reset', resetFigure]]) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = text;
  btn.addEventListener('click', () => action(manual));
  bar.append(btn);
}
manual.after(bar);
