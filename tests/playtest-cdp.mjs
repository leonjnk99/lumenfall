// LUMENFALL automated playtest via raw CDP (dev-only, not part of the game entry).
// Usage: node tests/playtest-cdp.mjs
// The CDP browser must already run on CDP_PORT (default 9226); see tests/chrome.sh.
// Drives the real game with keyboard/mouse: title -> play -> level-up -> pause ->
// death -> restart -> debug boss -> victory. Fails loudly on errors.
// Runs against tests/bundle.html via file:// (see tests/bundle.mjs for why).
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { connectCDP } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = `file://${path.join(ROOT, 'tests', 'bundle.html')}`;

execSync('node tests/bundle.mjs', { cwd: ROOT, stdio: 'inherit' });

const failures = [];
function check(name, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures.push(name);
}

const cdp = await connectCDP();
try {
  const tab = await cdp.openTab(`${BUNDLE}?seed=7`);
  const screen = () => tab.eval(`window.__lumenfall.screen()`);
  // Click by LOGICAL 1280x720 coordinates: the headless viewport is 1280x639,
  // so the field is letterboxed (scale 0.8875) and CSS pixels != logical ones.
  async function logicalClick(lx, ly) {
    const g = await tab.eval(`(() => { const c = document.getElementById('game'); return { w: c.clientWidth, h: c.clientHeight }; })()`);
    const scale = Math.min(g.w / 1280, g.h / 720);
    const ox = (g.w - 1280 * scale) / 2;
    const oy = (g.h - 720 * scale) / 2;
    await tab.click(ox + lx * scale, oy + ly * scale);
  }
  const state = () => tab.eval(`(() => { const s = window.__lumenfall.world.state; return { wave: s.wave, score: s.score, kills: s.kills, hp: Math.round(s.player.hp), level: s.player.level, enemies: s.enemies.filter((e) => e.active).length, over: s.over, won: s.won, choices: s.choices ? s.choices.length : 0 }; })()`);
  await sleep(1500);

  check('title screen on load', (await screen()) === 'title', await screen());
  await logicalClick(640, 480); // START button (logical coords)
  await sleep(800);
  check('start button begins play', (await screen()) === 'play', await screen());
  const before = await state();
  await tab.holdKey('KeyD', 'd', 2500);
  await tab.holdKey('KeyW', 'w', 2000);
  await tab.press('Space', ' '); // dash (Space dashes while playing)
  await sleep(1200);
  await tab.holdKey('KeyA', 'a', 2500);
  await tab.holdKey('KeyS', 's', 2500);
  await sleep(1500);
  const after = await state();
  check('world alive (enemies or kills)', after.enemies > 0 || after.kills > 0, JSON.stringify(after));
  check('kills or score advanced', after.kills > 0 || after.score > before.score, `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  check('player alive early', after.hp > 0, `hp=${after.hp}`);

  // Force a level-up: plant a fat shard on the player.
  await tab.eval(`(() => { const w = window.__lumenfall.world; const s = w.state.shards.find((x) => !x.active); s.active = true; s.x = w.state.player.x; s.y = w.state.player.y; s.vx = 0; s.vy = 0; s.value = 50; s.big = true; s.bob = 0; })()`);
  await sleep(700);
  check('level-up screen appears', (await screen()) === 'levelup', await screen());
  const lv = await state();
  check('level-up offers 3 choices', lv.choices === 3, `choices=${lv.choices}`);
  // The fat shard can queue several level-ups at once; keep picking until play resumes.
  for (let i = 0; i < 5 && (await screen()) === 'levelup'; i += 1) {
    await tab.press('Digit1', '1');
    await sleep(500);
  }
  check('picking cards resumes play', (await screen()) === 'play', await screen());

  await tab.press('KeyP', 'p');
  await sleep(400);
  check('P pauses', (await screen()) === 'paused', await screen());
  await tab.press('KeyP', 'p');
  await sleep(400);
  check('P resumes', (await screen()) === 'play', await screen());
  await tab.press('KeyM', 'm');
  await sleep(200);
  check('M mute toggles without error', tab.consoleErrors().length === 0, tab.consoleErrors().join(' | ').slice(0, 200));

  // Force death: drop HP and put a brute on top of the player.
  await tab.eval(`(() => { const w = window.__lumenfall.world; w.state.player.hp = 5; w.state.player.invuln = 0; const e = w.state.enemies.find((x) => !x.active) || w.state.enemies[0]; e.active = true; e.kind = 'brute'; e.x = w.state.player.x; e.y = w.state.player.y; e.radius = 22; e.hp = 95; e.maxHp = 95; e.speed = 0; e.damage = 50; e.xp = 3; e.score = 30; e.elite = false; e.boss = false; e.color = '#ff3d81'; e.flash = 0; e.slowTimer = 0; e.touchTimer = 0; })()`);
  await sleep(1200);
  check('death reaches game-over screen', (await screen()) === 'over', await screen());
  check('game over records the run', (await state()).over === true);
  await tab.press('KeyR', 'r');
  await sleep(600);
  const restarted = await state();
  check('R restarts a fresh run', (await screen()) === 'play' && restarted.hp > 0 && restarted.wave === 1, await screen());
  check('no console errors during play', tab.consoleErrors().length === 0, tab.consoleErrors().join(' | ').slice(0, 400));
  check('no failed/external requests during play', tab.failedRequests().length === 0 && tab.externalRequests('file://').length === 0, [...tab.failedRequests(), ...tab.externalRequests('file://')].join(' | ').slice(0, 300));
  tab.close();

  // Victory path via the debug hooks.
  console.log('\n== victory (debug) ==');
  const tab2 = await cdp.openTab(`${BUNDLE}?debug=1&seed=7`);
  await sleep(800);
  check('debug run starts at wave 9', (await tab2.eval(`window.__lumenfall.world.state.wave`)) === 9, String(await tab2.eval(`window.__lumenfall.world.state.wave`)));
  await tab2.eval(`window.__lumenfall.world.debugSpawnBoss()`);
  await sleep(4000);
  check('boss kill reaches victory screen', (await tab2.eval(`window.__lumenfall.screen()`)) === 'win', await tab2.eval(`window.__lumenfall.screen()`));
  check('victory: no console errors', tab2.consoleErrors().length === 0, tab2.consoleErrors().join(' | ').slice(0, 300));
  tab2.close();
} finally {
  cdp.close();
}
console.log(failures.length === 0 ? '\nALL CHECKS PASSED' : `\n${failures.length} CHECK(S) FAILED: ${failures.join(', ')}`);
process.exit(failures.length === 0 ? 0 : 1);
