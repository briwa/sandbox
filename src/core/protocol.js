export const MSG_HEIGHT = '__sandboxHeight';

export const MSG_RESET_DONE = '__sandboxReset';

export const MSG_ERROR = '__sandboxError';

// A frame asking the page to show a line of a shared source block: `{ source, line }`,
// where `source` is the block's index among the page's shared js blocks.
export const MSG_GOTO = '__sandboxGoto';

export const MSG_BG = '__sbxBg';

export const MSG_VISIBLE = '__figvis';

export const MSG_PLAY = '__figplay';
export const MSG_PAUSE = '__figpause';
export const MSG_RESET = '__figreset';

export const MSG_CONSOLE = '__sandboxConsole';

// A figure reports the knobs its code declared once it has run; the host answers with values.
export const MSG_KNOBS = '__sandboxKnobs';
export const MSG_KNOB = '__sbxKnob';
// The page saying it is listening. A frame that already ran reported to no one, so it sends
// everything it has reported again: its height, its knobs, and the error it is showing.
export const MSG_HELLO = '__sbxHello';
