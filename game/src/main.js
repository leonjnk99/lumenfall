// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between seven screens: title, how-to,
// play, paused, level-up, game over and victory.
//
// ?seed=N fixes the random pattern. ?shot=start|play|levelup|end (with &seed=N)
// stages that scene instead of running the loop, keeps painting it, and sets
// window.__shotReady for a screenshot. ?debug=1 starts a boosted run at wave 9
// (a testing shortcut, never part of normal play). ?fps=1 shows a frame-rate
// counter.
import { BEST_KEY, BEST_WAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { EVENT_LEVELUP, EVENT_OVER, EVENT_WIN, createWorld } from './world.js';
import {
  ACTION_CONFIRM, ACTION_DASH, ACTION_HOWTO, ACTION_MUTE, ACTION_PAUSE,
  ACTION_RESTART, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import {
  SCREEN_HOWTO, SCREEN_LEVELUP, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY,
  SCREEN_TITLE, SCREEN_WIN, createRenderer, hit, howtoLayout, levelUpLayout,
  overLayout, pauseLayout, titleLayout, winLayout,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const debug = params.get('debug') === '1';
const showFps = params.get('fps') === '1';
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();
const world = createWorld(createRandom(seed), audio);
const renderer = createRenderer(canvas);

function readBest(key) {
  try {
    return Number.parseInt(window.localStorage.getItem(key) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Storage can be off (private windows): the best then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, 3, false, null);
    painted += 1;
    if (painted === 2) window.__shotReady = true;
    // Keep repainting: a window resize clears the canvas, and the scene must
    // still be on it whenever the screenshot is taken, not just on frame two.
    requestAnimationFrame(paint);
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest(BEST_KEY);
  let bestWave = readBest(BEST_WAVE_KEY);
  let accumulator = 0;
  let last = performance.now();
  let dashQueued = false;
  let fpsFrames = 0;
  let fpsTime = 0;
  let fps = 0;

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Survive ten waves.');
  }

  function toTitle() {
    world.reset();
    screen = SCREEN_TITLE;
    announce('Lumenfall. Press Space or click Start to play.');
  }

  function finishRun(won) {
    const s = world.state;
    if (s.score > best) {
      best = s.score;
      saveBest(BEST_KEY, best);
    }
    if (s.wave > bestWave) {
      bestWave = s.wave;
      saveBest(BEST_WAVE_KEY, bestWave);
    }
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (won) audio.victory();
    else audio.gameOver();
    announce(won
      ? `Victory. Score ${s.score}. Best ${best}.`
      : `Game over on wave ${s.wave}. Score ${s.score}. Best ${best}.`);
  }

  function applyPick(index) {
    const choices = world.state.choices;
    if (!choices || index < 0 || index >= choices.length) return;
    const result = world.applyLevelChoice(choices[index]);
    announce(result.label);
    if (!result.choices) screen = SCREEN_PLAY;
  }

  function handleClick(logical) {
    if (screen === SCREEN_TITLE) {
      const layout = titleLayout();
      for (const b of layout.buttons) {
        if (hit(b, logical.x, logical.y)) {
          if (b.id === 'start') startGame();
          else if (b.id === 'howto') screen = SCREEN_HOWTO;
          return;
        }
      }
      if (hit(layout.mute, logical.x, logical.y)) {
        audio.unlock();
        audio.toggleMute();
      }
    } else if (screen === SCREEN_HOWTO) {
      for (const b of howtoLayout().buttons) {
        if (hit(b, logical.x, logical.y) && b.id === 'back') screen = SCREEN_TITLE;
      }
    } else if (screen === SCREEN_PAUSED) {
      for (const b of pauseLayout().buttons) {
        if (!hit(b, logical.x, logical.y)) continue;
        if (b.id === 'resume') screen = SCREEN_PLAY;
        else if (b.id === 'restart') startGame();
        else if (b.id === 'quit') toTitle();
        return;
      }
    } else if (screen === SCREEN_LEVELUP) {
      for (const card of levelUpLayout(world.state.choices ?? []).cards) {
        if (hit(card.rect, logical.x, logical.y)) {
          applyPick(card.index);
          return;
        }
      }
    } else if (screen === SCREEN_OVER || screen === SCREEN_WIN) {
      const layout = screen === SCREEN_OVER ? overLayout() : winLayout();
      for (const b of layout.buttons) {
        if (!hit(b, logical.x, logical.y)) continue;
        if (b.id === 'again') startGame();
        else if (b.id === 'title') toTitle();
        return;
      }
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    const pick = input.takePick();
    const click = input.takeClick();
    if (actions & ACTION_DASH) dashQueued = true;
    if (click) handleClick(renderer.toLogical(click.x, click.y));
    if (actions & ACTION_MUTE) {
      audio.unlock();
      audio.toggleMute();
    }
    if (screen === SCREEN_LEVELUP) {
      if (pick > 0) applyPick(pick - 1);
      return;
    }
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE) startGame();
      else if (screen === SCREEN_HOWTO) screen = SCREEN_TITLE;
      else if (screen === SCREEN_OVER || screen === SCREEN_WIN) startGame();
      else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
    }
    if (actions & ACTION_HOWTO && (screen === SCREEN_TITLE || screen === SCREEN_HOWTO)) {
      screen = screen === SCREEN_TITLE ? SCREEN_HOWTO : SCREEN_TITLE;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (actions & ACTION_RESTART && (screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      startGame();
    }
  }

  function step() {
    if (screen === SCREEN_TITLE || screen === SCREEN_HOWTO) {
      world.step(STEP, { x: 0, y: 0 }, false, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const move = input.move();
    const dash = dashQueued;
    dashQueued = false;
    const events = world.step(STEP, move, dash, false);
    if (events & EVENT_WIN) finishRun(true);
    else if (events & EVENT_OVER) finishRun(false);
    else if (events & EVENT_LEVELUP) {
      screen = SCREEN_LEVELUP;
      announce(`Level ${world.state.player.level}. Choose an upgrade.`);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (showFps) {
      fpsFrames += 1;
      fpsTime += frameDt;
      if (fpsTime >= 0.5) {
        fps = Math.round(fpsFrames / fpsTime);
        fpsFrames = 0;
        fpsTime = 0;
      }
    }
    // Dash is a one-shot press: take it here, once per frame, and hand it to the steps.
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_HOWTO || screen === SCREEN_PLAY) {
      accumulator += frameDt;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_HOWTO || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
      if (accumulator > STEP * 4) accumulator = 0;
    } else {
      accumulator = 0;
    }
    const hover = renderer.toLogical(input.pointer.x, input.pointer.y);
    renderer.draw(world.state, screen, best, bestWave, audio.muted, hover);
    if (showFps) {
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.font = '16px monospace';
      ctx.fillStyle = '#7df9ff';
      ctx.textAlign = 'left';
      ctx.fillText(`${fps} fps`, 12, 24);
    }
  }

  // Leaving the tab pauses a running game rather than letting the swarm feed unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  if (debug) {
    world.debugBoost();
    screen = SCREEN_PLAY;
    announce('Debug run at wave 9.');
  } else {
    announce('Lumenfall. Press Space or click Start to play.');
  }

  // A handle for automated testing (Playwright/puppeteer): read-only state, never used by the game.
  window.__lumenfall = {
    world,
    screen: () => screen,
    best: () => best,
    fps: () => fps,
  };

  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
