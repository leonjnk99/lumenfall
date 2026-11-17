// Keyboard, mouse and touch input. Held keys give a movement vector; one-shot
// presses (confirm, pause, dash, mute, restart, upgrade picks) are queued as bit
// flags and taken once by the loop, so a press between two frames is never lost
// and never counted twice. Pointer position is tracked for menus and aiming.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_DASH = 4;
export const ACTION_MUTE = 8;
export const ACTION_RESTART = 16;
export const ACTION_HOWTO = 32;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Enter']);
// Space is both: confirm on menus, dash while playing. The main loop only
// acts on the confirm flag on menu screens and only dashes on the play
// screen, so one key doing both is unambiguous — and the HUD promises
// "DASH READY [SPACE]".
const CONFIRM_AND_DASH = new Set(['Space']);
const PAUSE = new Set(['KeyP', 'Escape']);
const DASH = new Set(['ShiftLeft', 'ShiftRight']);
const MUTE = new Set(['KeyM']);
const RESTART = new Set(['KeyR']);
const HOWTO = new Set(['KeyH']);
const PICK = new Set(['Digit1', 'Digit2', 'Digit3']);

export function createInput(canvas) {
  const held = { up: false, down: false, left: false, right: false };
  let actions = 0;
  let pick = 0; // 1..3, consumed once
  const pointer = { x: 0, y: 0, down: false, clicked: false };
  let clickX = 0;
  let clickY = 0;

  function keyDown(event) {
    const code = event.code;
    if (UP.has(code)) held.up = true;
    else if (DOWN.has(code)) held.down = true;
    else if (LEFT.has(code)) held.left = true;
    else if (RIGHT.has(code)) held.right = true;
    else if (CONFIRM.has(code)) { if (!event.repeat) actions |= ACTION_CONFIRM; }
    else if (CONFIRM_AND_DASH.has(code)) { if (!event.repeat) actions |= ACTION_CONFIRM | ACTION_DASH; }
    else if (PAUSE.has(code)) { if (!event.repeat) actions |= ACTION_PAUSE; }
    else if (DASH.has(code)) { if (!event.repeat) actions |= ACTION_DASH; }
    else if (MUTE.has(code)) { if (!event.repeat) actions |= ACTION_MUTE; }
    else if (RESTART.has(code)) { if (!event.repeat) actions |= ACTION_RESTART; }
    else if (HOWTO.has(code)) { if (!event.repeat) actions |= ACTION_HOWTO; }
    else if (PICK.has(code)) { if (!event.repeat) pick = Number(code.slice(-1)); }
    else return;
    event.preventDefault();
  }
  function keyUp(event) {
    const code = event.code;
    if (UP.has(code)) held.up = false;
    else if (DOWN.has(code)) held.down = false;
    else if (LEFT.has(code)) held.left = false;
    else if (RIGHT.has(code)) held.right = false;
  }

  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', () => {
    held.up = held.down = held.left = held.right = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
    pointer.down = true;
    pointer.clicked = true;
    clickX = pointer.x;
    clickY = pointer.y;
  });
  window.addEventListener('pointerup', () => { pointer.down = false; });

  return {
    pointer,
    /** Normalised movement vector {x, y} from held keys. */
    move() {
      const x = (held.right ? 1 : 0) - (held.left ? 1 : 0);
      const y = (held.down ? 1 : 0) - (held.up ? 1 : 0);
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const len = Math.hypot(x, y);
      return { x: x / len, y: y / len };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The upgrade pick (1..3) since the last call, or 0. */
    takePick() {
      const taken = pick;
      pick = 0;
      return taken;
    },
    /** The last click position since the last call, or null. Consumed once. */
    takeClick() {
      if (!pointer.clicked) return null;
      pointer.clicked = false;
      return { x: clickX, y: clickY };
    },
  };
}
