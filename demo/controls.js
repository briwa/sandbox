import '@briwa.dev/sandbox/styles';
import './demo.css';
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
## auto (default)

${sample('auto')}

## pausable - starts off paused

${sample('pausable')}

## none - uncontrollable

${sample('none')}
`;

document.querySelector('#controls-prose').innerHTML = await renderMarkdown(source);
