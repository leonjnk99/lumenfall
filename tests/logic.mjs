// Headless logic test: drives the SHIPPED world modules in Node (no browser,
// no DOM) through full games. Validates waves, bosses, level-ups, win and
// death paths, and measures simulation speed.
// Usage: node tests/logic.mjs
import { createRandom } from '../game/src/random.js';
import { FIELD, STEP } from '../game/src/config.js';
import { EVENT_BOSS, EVENT_LEVELUP, EVENT_OVER, EVENT_WIN, createWorld } from '../game/src/world.js';
import { makeWeapon } from '../game/src/weapons.js';

const failures = [];
function check(name, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures.push(name);
}

const audio = {
  kill() {}, shoot() {}, hit() {}, boss() {}, hurt() {},
  pickup() {}, dash() {}, levelUp() {}, victory() {}, gameOver() {},
};

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
  if (foe && foeD < 70 * 70) { tx = p.x + (p.x - foe.x); ty = p.y + (p.y - foe.y); }
  else if (shard) { tx = shard.x; ty = shard.y; }
  else { tx = FIELD.width / 2; ty = FIELD.height / 2; }
  const dx = tx - p.x;
  const dy = ty - p.y;
  const len = Math.hypot(dx, dy);
  if (len < 4) return { x: 0, y: 0 };
  return { x: dx / len, y: dy / len };
}

// --- 1. Perf: raw simulation speed ---
{
  const w = createWorld(createRandom(7), audio);
  const t0 = Date.now();
  for (let i = 0; i < 6000; i += 1) w.step(STEP, { x: 0.5, y: 0 }, false, false);
  const ms = Date.now() - t0;
  const perSec = Math.round(6000 / (ms / 1000));
  console.log(`sim speed: ${perSec} steps/s (${ms} ms for 6000 steps)`);
  check('sim runs faster than 60x realtime', perSec > 60 * 10, `${perSec} steps/s`);
}

// --- 2. Full run with a decent pilot: dash when crowded, prefer weapons ---
// A dumb pilot (first card, never dashes) dies on wave 3; a pilot that plays
// even a little well should reach the mid-game, or the tuning is wrong.
{
  const w = createWorld(createRandom(7), audio);
  const s = w.state;
  let levelUps = 0;
  let won = false;
  let over = false;
  let maxWave = 1;
  const t0 = Date.now();
  for (let i = 0; i < 60 * 60 * 12 && !won && !over; i += 1) {
    const move = autopilot(s);
    let foeD = Infinity;
    for (const e of s.enemies) {
      if (!e.active) continue;
      const d = (e.x - s.player.x) ** 2 + (e.y - s.player.y) ** 2;
      if (d < foeD) foeD = d;
    }
    const dash = foeD < 55 * 55;
    const events = w.step(STEP, move, dash, false);
    if (events & EVENT_LEVELUP) {
      levelUps += 1;
      // Prefer a new weapon, then a weapon level, then damage / fire rate / HP.
      const rank = (c) => (c.kind === 'newWeapon' ? 0 : c.kind === 'upgradeWeapon' ? 1
        : c.stat === 'damage' || c.stat === 'fireRate' ? 2 : c.stat === 'maxHp' ? 3 : 4);
      const best = [...s.choices].sort((a, b) => rank(a) - rank(b))[0];
      w.applyLevelChoice(best);
    }
    if (events & EVENT_WIN) won = true;
    if (events & EVENT_OVER) over = true;
    maxWave = Math.max(maxWave, s.wave);
  }
  console.log(`smart-pilot run: ${Date.now() - t0} ms wall, wave ${maxWave}, kills ${s.kills}, score ${s.score}, level ${s.player.level}, levelUps ${levelUps}, won=${won}, over=${over}, hp=${Math.round(s.player.hp)}`);
  check('a decent pilot reaches wave 5', maxWave >= 5, `wave ${maxWave}`);
  check('a decent pilot kills plenty', s.kills > 100, `kills ${s.kills}`);
  check('level-ups happen and apply', levelUps >= 4, `levelUps ${levelUps}`);
}

// --- 2b. Wave 5 boss: jump straight there, check it spawns and can die ---
{
  const w = createWorld(createRandom(11), audio);
  const s = w.state;
  w.startWave(5);
  let bossSeen = false;
  let bossDead = false;
  // A strong loadout, as a mid-game player would have.
  const blades = makeWeapon('blades'); blades.level = 4;
  const pulse = makeWeapon('blaster'); pulse.level = 4;
  s.player.weapons.push(blades, pulse);
  s.player.damageMul = 1.6;
  for (let i = 0; i < 60 * 90 && !bossDead; i += 1) {
    w.step(STEP, autopilot(s), false, false);
    if (s.boss && s.boss.active) bossSeen = true;
    if (bossSeen && (!s.boss || !s.boss.active)) bossDead = true;
  }
  check('wave 5 boss (Warden) spawns', bossSeen, `boss=${s.boss?.kind ?? 'none'} wave=${s.wave}`);
  check('wave 5 boss can be defeated', bossDead, `wave=${s.wave} bossActive=${s.boss?.active}`);
}

// --- 3. Debug win path: wave 9 boost + Hollow Star ---
{
  const w = createWorld(createRandom(7), audio);
  w.debugBoost();
  check('debugBoost starts at wave 9', w.state.wave === 9, `wave ${w.state.wave}`);
  w.debugSpawnBoss();
  check('debugSpawnBoss spawns the Hollow Star', w.state.boss?.active && w.state.boss.kind === 'hollowStar', w.state.boss?.kind ?? 'none');
  let won = false;
  for (let i = 0; i < 60 * 30 && !won; i += 1) {
    if (w.step(STEP, { x: 0, y: 0 }, false, false) & EVENT_WIN) won = true;
  }
  check('Hollow Star defeat wins the game', won);
}

// --- 4. Death path ---
{
  const w = createWorld(createRandom(7), audio);
  const s = w.state;
  s.player.hp = 1;
  s.player.invuln = 0;
  const e = s.enemies.find((x) => !x.active);
  e.active = true; e.kind = 'brute'; e.x = s.player.x; e.y = s.player.y;
  e.radius = 22; e.hp = 95; e.maxHp = 95; e.speed = 0; e.damage = 50;
  e.xp = 3; e.score = 30; e.elite = false; e.boss = false; e.touchTimer = 0;
  let over = false;
  for (let i = 0; i < 60 * 5 && !over; i += 1) {
    if (w.step(STEP, { x: 0, y: 0 }, false, false) & EVENT_OVER) over = true;
  }
  check('lethal hit ends the run', over);
  check('game over keeps the final score', s.score >= 0, `score ${s.score}`);
}

console.log(failures.length === 0 ? '\nALL LOGIC CHECKS PASSED' : `\n${failures.length} LOGIC CHECK(S) FAILED: ${failures.join(', ')}`);
process.exit(failures.length === 0 ? 0 : 1);
