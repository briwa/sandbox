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

const MODES = [
  ['default'],
  ['autoplay'],
  ['none'],
  ['hover'],
  ['manual'],
  ['default', 'idle=2000'],
  ['hover', 'idle=2000'],
];

const sample = (control, extra) =>
  '```js sandbox=canvas 460x150 code control=' + control + (extra ? ' ' + extra : '') + '\n' + WAVE + '\n```';

const mount = document.querySelector('#controls-prose');

const heading = Object.assign(document.createElement('h2'), { textContent: 'controls' });

const picker = document.createElement('select');
picker.setAttribute('aria-label', 'Control mode');
MODES.forEach(([control, extra], i) => picker.add(new Option(extra ? `${control} ${extra}` : control, i)));

const stage = document.createElement('div');
mount.append(heading, picker, stage);

async function render() {
  const [control, extra] = MODES[picker.value];
  stage.innerHTML = await renderMarkdown(sample(control, extra));
  if (control !== 'manual') return;

  const figure = stage.querySelector('.sandbox');
  const bar = document.createElement('div');
  bar.className = 'manual-controls';
  for (const [text, action] of [['play', playFigure], ['pause', pauseFigure], ['reset', resetFigure]]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = text;
    btn.addEventListener('click', () => action(figure));
    bar.append(btn);
  }
  figure.after(bar);
}

picker.addEventListener('change', render);
await render();
