// Overlay screens: their layout in logical 1280x720 coordinates and the buttons
// they offer. Pure geometry and copy — no drawing here, so the main loop can
// hit-test a click against the same rects the renderer paints.
import { FIELD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_HOWTO = 'howto';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_LEVELUP = 'levelup';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const W = FIELD.width;
const H = FIELD.height;

function centreRect(w, h, y) {
  return { x: (W - w) / 2, y, w, h };
}

export function titleLayout() {
  return {
    panel: centreRect(680, 470, 105),
    buttons: [
      { id: 'start', label: '▶  START RUN', ...centreRect(300, 56, 452) },
      { id: 'howto', label: 'HOW TO PLAY', ...centreRect(300, 56, 520) },
    ],
    mute: { id: 'mute', label: '♪', x: W - 76, y: H - 100, w: 56, h: 40 },
  };
}

export function howtoLayout() {
  return {
    panel: centreRect(760, 520, 90),
    buttons: [
      { id: 'back', label: '←  BACK', ...centreRect(260, 52, 520) },
    ],
  };
}

export function pauseLayout() {
  return {
    panel: centreRect(520, 350, 170),
    buttons: [
      { id: 'resume', label: 'RESUME  (P)', ...centreRect(280, 52, 330) },
      { id: 'restart', label: 'RESTART  (R)', ...centreRect(280, 52, 396) },
      { id: 'quit', label: 'QUIT TO TITLE', ...centreRect(280, 52, 462) },
    ],
  };
}

export function levelUpLayout(choices) {
  const cards = [];
  const cardW = 300;
  const cardH = 250;
  const gap = 24;
  const total = choices.length * cardW + (choices.length - 1) * gap;
  let x = (W - total) / 2;
  const y = 235;
  choices.forEach((choice, i) => {
    cards.push({ choice, index: i, rect: { x, y, w: cardW, h: cardH } });
    x += cardW + gap;
  });
  return { cards };
}

export function overLayout() {
  return {
    panel: centreRect(620, 470, 130),
    buttons: [
      { id: 'again', label: '↻  RUN IT BACK  (R)', ...centreRect(320, 56, 478) },
      { id: 'title', label: 'TITLE SCREEN', ...centreRect(320, 52, 546) },
    ],
  };
}

export function winLayout() {
  return {
    panel: centreRect(680, 500, 115),
    buttons: [
      { id: 'again', label: '↻  PLAY AGAIN  (R)', ...centreRect(320, 56, 488) },
      { id: 'title', label: 'TITLE SCREEN', ...centreRect(320, 52, 556) },
    ],
  };
}

/** True when the logical point is inside the rect. */
export function hit(rect, x, y) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}
