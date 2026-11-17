// The screenshot scenes behind ?shot=start|play|levelup|end. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered by
// a simple autopilot (chase the nearest shard, keep clear of the nearest foe),
// so the frame is what a real game looks like and the same seed always gives
// the same frame.
import { FIELD, STEP } from './config.js';
import { SCREEN_LEVELUP, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { EVENT_OVER } from './world.js';

const START_SECONDS = 12;
// 100 s = wave 3, ~12 s in: the mix is up (skitters, spitters, brutes, elites)
// and the field is at its busiest. 34 s landed in the wave-1 lull (field
// cleared, 8 s left on the timer); 55 s was wave 2 but thinner.
const PLAY_SECONDS = 100;
const LEVELUP_LIMIT_SECONDS = 150;
const END_LIMIT_SECONDS = 300;

/** Move toward the nearest shard, fleeing anything closer than 70px. */
function autopilot(state) {
  const p = state.player;
  let shard = null;
  let shardD = Infinity;
  for (const s of state.shards) {
    if (!s.active) continue;
    const d = (s.x - p.x) ** 2 + (s.y - p.y) ** 2;
    if (d < shardD) { shardD = d; shard = s; }
  }
  let foe = null;
  let foeD = Infinity;
  for (const e of state.enemies) {
    if (!e.active) continue;
    const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
    if (d < foeD) { foeD = d; foe = e; }
  }
  let tx = p.x;
  let ty = p.y;
  if (foe && foeD < 70 * 70) {
    tx = p.x + (p.x - foe.x);
    ty = p.y + (p.y - foe.y);
  } else if (shard) {
    tx = shard.x;
    ty = shard.y;
  } else {
    tx = FIELD.width / 2;
    ty = FIELD.height / 2;
  }
  const dx = tx - p.x;
  const dy = ty - p.y;
  const len = Math.hypot(dx, dy);
  if (len < 4) return { x: 0, y: 0 };
  return { x: dx / len, y: dy / len };
}

/** Walk straight into the nearest foe: the end scene's hurried player. */
function reckless(state) {
  const p = state.player;
  let foe = null;
  let foeD = Infinity;
  for (const e of state.enemies) {
    if (!e.active) continue;
    const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
    if (d < foeD) { foeD = d; foe = e; }
  }
  if (!foe) return { x: 0, y: 0 };
  const dx = foe.x - p.x;
  const dy = foe.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/**
 * Set `world` to the named scene (start, play, levelup or end; any other name is
 * start) and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  if (name !== 'play' && name !== 'levelup' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, { x: 0, y: 0 }, false, true);
    return { screen: SCREEN_TITLE, best: 12340 };
  }
  if (name === 'levelup') {
    for (let i = 0; i < LEVELUP_LIMIT_SECONDS / STEP; i += 1) {
      world.step(STEP, autopilot(state), false, false);
      if (state.choices) break;
      if (state.over) break;
    }
    if (state.choices) return { screen: SCREEN_LEVELUP, best: state.score };
    return { screen: SCREEN_PLAY, best: state.score };
  }
  if (name === 'end') {
    for (let i = 0; i < END_LIMIT_SECONDS / STEP; i += 1) {
      if (world.step(STEP, reckless(state), false, false) & EVENT_OVER) break;
    }
    return { screen: SCREEN_OVER, best: state.score };
  }
  for (let i = 0; i < PLAY_SECONDS / STEP; i += 1) {
    world.step(STEP, autopilot(state), false, false);
    if (state.over) break;
  }
  return { screen: SCREEN_PLAY, best: state.score };
}
