// The game's rules and state, with no drawing and no browser in it: waves,
// spawning, weapons, collisions, XP and levelling, combo and score, bosses,
// victory and defeat. step() advances one fixed step and returns what happened
// as bit flags, so the caller can react without the world knowing about screens
// or sound. The pools are allocated once, at boot; nothing here allocates in
// the hot loop except short-lived zap visuals, which are capped.
import { COMBO, FIELD, FINAL_WAVE, INTERMISSION_SECONDS, PLAYER, POOL, WAVE_SECONDS, wavePlan, xpForLevel } from './config.js';
import { createRandom } from './random.js';
import { createPlayer, hurtPlayer, movePlayer, resetPlayer } from './player.js';
import { WEAPON_DEFS, makeWeapon, weaponStats } from './weapons.js';
import { applyChoice, rollChoices } from './upgrades.js';
import { initEnemy, moveEnemy, pickKind, spawnEdge } from './enemies.js';
import { createParticles } from './particles.js';

export const EVENT_HIT = 1;
export const EVENT_PICKUP = 2;
export const EVENT_LEVELUP = 4;
export const EVENT_OVER = 8;
export const EVENT_WIN = 16;
export const EVENT_WAVE = 32;
export const EVENT_BOSS = 64;
export const EVENT_KILL = 128;

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function createWorld(random, audio) {
  const particles = createParticles();
  const player = createPlayer();

  const enemies = [];
  for (let i = 0; i < POOL.enemies; i += 1) {
    enemies.push({ active: false, kind: 'drifter', x: 0, y: 0, radius: 10, hp: 1, maxHp: 1, speed: 0, damage: 0, xp: 0, score: 0, elite: false, boss: false, color: '#fff', flash: 0, slow: 0, slowTimer: 0, shootTimer: 0, touchTimer: 0, phase: 0, wobble: 0, novaMark: 0 });
  }
  const shards = [];
  for (let i = 0; i < POOL.shards; i += 1) shards.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, value: 1, big: false, bob: 0 });
  const shots = [];
  for (let i = 0; i < POOL.shots; i += 1) shots.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, damage: 0, radius: 5, pierce: 0, life: 0, color: '#39f5d6' });
  const orbs = [];
  for (let i = 0; i < POOL.orbs; i += 1) orbs.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, damage: 0, radius: 7, life: 0 });

  const state = {
    player,
    enemies,
    shards,
    shots,
    orbs,
    particles,
    zaps: [],
    rings: [],
    wave: 1,
    waveTime: 0,
    waveState: 'fight', // fight | intermission
    intermission: 0,
    toSpawn: 0,
    spawnTimer: 0,
    spawned: 0,
    bossSpawned: false,
    boss: null,
    score: 0,
    kills: 0,
    combo: 0,
    comboTimer: 0,
    comboMult: 1,
    elapsed: 0,
    time: 0,
    shake: 0,
    hitStop: 0,
    over: false,
    won: false,
    pendingLevels: 0,
    choices: null,
    banner: null, // { text, sub, timer }
    stats: { damageDealt: 0, levelUps: 0, shardsCollected: 0 },
    novaId: 0,
  };

  function setBanner(text, sub, seconds = 2.2) {
    state.banner = { text, sub, timer: seconds };
  }

  function freeEnemy() {
    for (const e of enemies) if (!e.active) return e;
    return null;
  }
  function freeShard() {
    for (const s of shards) if (!s.active) return s;
    return null;
  }
  function freeShot() {
    for (const s of shots) if (!s.active) return s;
    return null;
  }
  function freeOrb() {
    for (const o of orbs) if (!o.active) return o;
    return null;
  }

  function dropShards(x, y, value) {
    let left = value;
    let guard = 0;
    while (left > 0 && guard < 6) {
      const s = freeShard();
      if (!s) return;
      const v = left >= 5 ? 5 : left;
      left -= v;
      s.active = true;
      s.x = x + (random() - 0.5) * 24;
      s.y = y + (random() - 0.5) * 24;
      s.vx = (random() - 0.5) * 60;
      s.vy = (random() - 0.5) * 60;
      s.value = v;
      s.big = v >= 5;
      s.bob = random() * Math.PI * 2;
      guard += 1;
    }
  }

  function nearestEnemy(x, y, maxDist) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const e of enemies) {
      if (!e.active) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  function damageEnemy(e, damage, kx = 0, ky = 0) {
    if (!e.active) return false;
    e.hp -= damage;
    e.flash = 0.09;
    state.stats.damageDealt += damage;
    particles.damageNumber(e.x, e.y - e.radius, damage, '#fff', e.boss ? 20 : 13);
    if (kx !== 0 || ky !== 0) {
      const len = Math.hypot(kx, ky) || 1;
      e.x += (kx / len) * 6;
      e.y += (ky / len) * 6;
    }
    if (e.hp > 0) return false;
    e.active = false;
    state.kills += 1;
    state.combo += 1;
    state.comboTimer = COMBO.window;
    state.comboMult = Math.min(COMBO.maxMult, 1 + state.combo * COMBO.perKill);
    state.score += Math.round(e.score * state.comboMult);
    particles.burst(e.x, e.y, e.color, e.boss ? 60 : e.elite ? 26 : 12, e.boss ? 320 : 200);
    dropShards(e.x, e.y, e.xp);
    if (e.boss) {
      state.shake = Math.max(state.shake, 14);
      state.hitStop = 0.12;
      particles.ring(e.x, e.y, '#ffffff', 40, 420);
      audio.kill();
      if (e.kind === 'hollowStar') {
        state.won = true;
        return true;
      }
      if (state.waveState === 'fight' && state.wave === 5) {
        // The wave-5 boss dying ends the wave at once.
        state.waveTime = WAVE_SECONDS;
      }
    } else if (e.elite) {
      state.shake = Math.max(state.shake, 5);
      state.hitStop = Math.max(state.hitStop, 0.05);
      audio.kill();
    }
    return true;
  }

  function fireBlaster(w, stats) {
    const target = nearestEnemy(player.x, player.y, 620);
    if (!target) return;
    const baseAngle = Math.atan2(target.y - player.y, target.x - player.x);
    for (let i = 0; i < stats.count; i += 1) {
      const s = freeShot();
      if (!s) return;
      const spread = (i - (stats.count - 1) / 2) * 0.16;
      const a = baseAngle + spread;
      s.active = true;
      s.x = player.x + Math.cos(a) * (player.radius + 6);
      s.y = player.y + Math.sin(a) * (player.radius + 6);
      s.vx = Math.cos(a) * stats.speed;
      s.vy = Math.sin(a) * stats.speed;
      s.damage = stats.damage;
      s.radius = 5;
      s.pierce = player.weapons.find((x) => x.id === 'blaster').level >= 5 ? 1 : 0;
      s.life = 1.1;
      s.color = WEAPON_DEFS.blaster.color;
    }
    audio.shoot();
  }

  function fireLightning(w, stats) {
    let fromX = player.x;
    let fromY = player.y;
    let remaining = stats.count;
    let guard = 0;
    while (remaining > 0 && guard < 8) {
      guard += 1;
      const target = nearestEnemy(fromX, fromY, 460);
      if (!target) break;
      state.zaps.push({ x1: fromX, y1: fromY, x2: target.x, y2: target.y, life: 0.16, maxLife: 0.16 });
      if (state.zaps.length > 10) state.zaps.shift();
      damageEnemy(target, stats.damage);
      particles.burst(target.x, target.y, WEAPON_DEFS.lightning.color, 6, 140, 2.5);
      fromX = target.x;
      fromY = target.y;
      remaining -= 1;
    }
    if (guard > 0) audio.hit();
  }

  function fireNova(w, stats) {
    state.novaId += 1;
    const radius = 200 + w.level * 14;
    state.rings.push({ x: player.x, y: player.y, radius: 10, maxRadius: radius, life: 0.45, maxLife: 0.45, color: WEAPON_DEFS.nova.color });
    for (const e of enemies) {
      if (!e.active) continue;
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d <= radius + e.radius) {
        const kx = e.x - player.x;
        const ky = e.y - player.y;
        damageEnemy(e, stats.damage, kx, ky);
      }
    }
    state.shake = Math.max(state.shake, 4);
    audio.boss();
  }

  function frostTick(w, stats, dt) {
    const radius = 120 + w.level * 12;
    w.tick -= dt;
    if (w.tick > 0) return;
    w.tick = 0.5;
    for (const e of enemies) {
      if (!e.active) continue;
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d <= radius + e.radius) {
        e.slowTimer = 0.9;
        damageEnemy(e, stats.damage);
      }
    }
  }

  function bladesStep(w, stats, dt) {
    w.angle += dt * 3.4;
    const radius = 62 + w.level * 4;
    for (let i = 0; i < stats.count; i += 1) {
      const a = w.angle + (i / stats.count) * Math.PI * 2;
      const bx = player.x + Math.cos(a) * radius;
      const by = player.y + Math.sin(a) * radius;
      if (Math.random() < 0.35) particles.trail(bx, by, WEAPON_DEFS.blades.color);
      for (const e of enemies) {
        if (!e.active) continue;
        const d = Math.hypot(e.x - bx, e.y - by);
        if (d < e.radius + 13) damageEnemy(e, stats.damage * dt * 6, Math.cos(a), Math.sin(a));
      }
    }
  }

  function updateWeapons(dt) {
    for (const w of player.weapons) {
      const stats = weaponStats(w, player.damageMul, player.rateMul);
      if (w.id === 'blades') { bladesStep(w, stats, dt); continue; }
      if (w.id === 'frost') { frostTick(w, stats, dt); continue; }
      w.cooldown -= dt;
      if (w.cooldown > 0) continue;
      if (w.id === 'blaster') {
        w.cooldown = 1 / stats.rate;
        fireBlaster(w, stats);
      } else if (w.id === 'lightning') {
        w.cooldown = 1 / stats.rate;
        fireLightning(w, stats);
      } else if (w.id === 'nova') {
        w.cooldown = 1 / stats.rate;
        fireNova(w, stats);
      }
    }
  }

  function updateShots(dt) {
    for (const s of shots) {
      if (!s.active) continue;
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.life <= 0 || s.x < -20 || s.x > FIELD.width + 20 || s.y < -20 || s.y > FIELD.height + 20) {
        s.active = false;
        continue;
      }
      for (const e of enemies) {
        if (!e.active) continue;
        const rr = e.radius + s.radius;
        if (dist2(s.x, s.y, e.x, e.y) < rr * rr) {
          damageEnemy(e, s.damage, s.vx, s.vy);
          particles.burst(s.x, s.y, s.color, 3, 90, 2);
          if (s.pierce > 0) { s.pierce -= 1; }
          else { s.active = false; }
          break;
        }
      }
    }
    for (const o of orbs) {
      if (!o.active) continue;
      o.life -= dt;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      if (o.life <= 0 || o.x < -30 || o.x > FIELD.width + 30 || o.y < -30 || o.y > FIELD.height + 30) {
        o.active = false;
        continue;
      }
      const rr = player.radius + o.radius;
      if (dist2(o.x, o.y, player.x, player.y) < rr * rr) {
        o.active = false;
        if (hurtPlayer(player, o.damage) === 'dead') state.over = true;
        else if (player.hp > 0) { state.shake = Math.max(state.shake, 6); audio.hurt(); }
      }
    }
  }

  function updateShards(dt) {
    const magnetR = PLAYER.magnetRadius * player.magnetMul;
    const pickupR = PLAYER.pickupRadius;
    for (const s of shards) {
      if (!s.active) continue;
      s.bob += dt * 4;
      const d = Math.hypot(player.x - s.x, player.y - s.y);
      if (d < magnetR) {
        const pull = 560 * (1 - d / (magnetR + 1)) + 120;
        s.vx += ((player.x - s.x) / (d || 1)) * pull * dt * 4;
        s.vy += ((player.y - s.y) / (d || 1)) * pull * dt * 4;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.9;
      s.vy *= 0.9;
      if (d < pickupR + 6) {
        s.active = false;
        player.xp += s.value;
        state.stats.shardsCollected += 1;
        audio.pickup();
        particles.burst(s.x, s.y, '#7df9ff', 3, 80, 2);
        while (player.xp >= player.xpNext) {
          player.xp -= player.xpNext;
          player.level += 1;
          player.xpNext = xpForLevel(player.level);
          state.pendingLevels += 1;
          state.stats.levelUps += 1;
        }
      }
    }
  }

  function updateEnemies(dt) {
    for (const e of enemies) {
      if (!e.active) continue;
      if (e.flash > 0) e.flash -= dt;
      if (e.slowTimer > 0) e.slowTimer -= dt;
      if (e.touchTimer > 0) e.touchTimer -= dt;
      moveEnemy(e, player, dt, state.time);
      // Spitters shoot.
      if (e.kind === 'spitter') {
        e.shootTimer -= dt;
        if (e.shootTimer <= 0) {
          e.shootTimer = 2.2 + random() * 1.2;
          const o = freeOrb();
          if (o) {
            const d = Math.hypot(player.x - e.x, player.y - e.y) || 1;
            o.active = true;
            o.x = e.x; o.y = e.y;
            o.vx = ((player.x - e.x) / d) * 170;
            o.vy = ((player.y - e.y) / d) * 170;
            o.damage = e.damage;
            o.life = 4;
          }
        }
      }
      // Contact damage.
      const rr = e.radius + player.radius - 2;
      if (dist2(e.x, e.y, player.x, player.y) < rr * rr && e.touchTimer <= 0) {
        e.touchTimer = 0.8;
        const result = hurtPlayer(player, e.damage);
        if (result === 'dead') { state.over = true; return; }
        if (result === 'hurt') {
          state.shake = Math.max(state.shake, 7);
          state.combo = 0;
          state.comboMult = 1;
          audio.hurt();
          particles.burst(player.x, player.y, '#ff5d73', 14, 220);
        }
      }
    }
    // Gentle separation so enemies do not stack into one blob.
    for (let i = 0; i < enemies.length; i += 1) {
      const a = enemies[i];
      if (!a.active) continue;
      for (let j = i + 1; j < enemies.length; j += 1) {
        const b = enemies[j];
        if (!b.active) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const rr = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0.01 && d2 < rr * rr) {
          const d = Math.sqrt(d2);
          const push = (rr - d) / 2 / d;
          a.x -= dx * push * 0.5;
          a.y -= dy * push * 0.5;
          b.x += dx * push * 0.5;
          b.y += dy * push * 0.5;
        }
      }
    }
  }

  function startWave(wave) {
    state.wave = wave;
    state.waveTime = 0;
    state.waveState = 'fight';
    state.bossSpawned = false;
    state.boss = null;
    const plan = wavePlan(wave);
    state.toSpawn = plan.count;
    state.spawned = 0;
    state.spawnTimer = 0.5;
    if (wave === 5) setBanner('WAVE 5 — THE WARDEN COMES', 'Something huge is stirring in the dark.', 2.6);
    else if (wave === FINAL_WAVE) setBanner('FINAL WAVE — THE HOLLOW STAR', 'Defeat it and the arena is yours.', 2.6);
    else setBanner(`WAVE ${wave}`, wave >= 8 ? 'They are getting faster.' : 'Survive.', 1.8);
  }

  function spawnBoss(kind) {
    const e = freeEnemy();
    if (!e) return;
    const pos = spawnEdge(random);
    initEnemy(e, kind, pos.x, pos.y, state.wave, false);
    e.hp *= 1;
    state.boss = e;
    state.bossSpawned = true;
    audio.boss();
    setBanner(kind === 'hollowStar' ? 'THE HOLLOW STAR' : 'THE WARDEN', 'Its health bar is at the top. Do not stand still.', 2.6);
  }

  function reset() {
    resetPlayer(player);
    for (const e of enemies) e.active = false;
    for (const s of shards) s.active = false;
    for (const s of shots) s.active = false;
    for (const o of orbs) o.active = false;
    particles.clear();
    state.zaps = [];
    state.rings = [];
    state.wave = 1;
    state.waveTime = 0;
    state.waveState = 'fight';
    state.intermission = 0;
    state.score = 0;
    state.kills = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.comboMult = 1;
    state.elapsed = 0;
    state.time = 0;
    state.shake = 0;
    state.hitStop = 0;
    state.over = false;
    state.won = false;
    state.pendingLevels = 0;
    state.choices = null;
    state.banner = null;
    state.stats = { damageDealt: 0, levelUps: 0, shardsCollected: 0 };
    startWave(1);
  }

  function step(dt, move, dashPressed, harmless) {
    let events = 0;
    if (state.hitStop > 0) {
      state.hitStop -= dt;
      return events;
    }
    state.time += dt;
    state.elapsed += dt;
    if (state.banner) {
      state.banner.timer -= dt;
      if (state.banner.timer <= 0) state.banner = null;
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 26);
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) { state.combo = 0; state.comboMult = 1; }
    }
    for (const z of state.zaps) z.life -= dt;
    state.zaps = state.zaps.filter((z) => z.life > 0);
    for (const r of state.rings) {
      r.life -= dt;
      r.radius += (r.maxRadius - r.radius) * dt * 9;
    }
    state.rings = state.rings.filter((r) => r.life > 0);

    const dashed = movePlayer(player, move, dashPressed, dt);
    if (dashed) {
      audio.dash();
      particles.burst(player.x, player.y, '#39f5d6', 8, 120, 2.5);
    }

    if (harmless) {
      // Title-screen attract mode: the world plays itself, nothing can hurt the player.
      updateWeapons(dt);
      updateShots(dt);
      updateEnemiesAttract(dt);
      particles.step(dt);
      return events;
    }

    // Wave flow.
    if (state.waveState === 'fight') {
      state.waveTime += dt;
      const plan = wavePlan(state.wave);
      const bossWave = state.wave === 5 || state.wave === FINAL_WAVE;
      if (bossWave && !state.bossSpawned && state.waveTime >= 8) {
        spawnBoss(state.wave === FINAL_WAVE ? 'hollowStar' : 'warden');
        events |= EVENT_BOSS;
      }
      if (state.toSpawn > 0) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          state.spawnTimer = plan.interval * (0.7 + random() * 0.6);
          const batch = state.wave >= 6 ? 2 : 1;
          for (let b = 0; b < batch && state.toSpawn > 0; b += 1) {
            const e = freeEnemy();
            if (!e) break;
            const pos = spawnEdge(random);
            state.spawned += 1;
            state.toSpawn -= 1;
            const elite = plan.eliteEvery > 0 && state.spawned % plan.eliteEvery === 0;
            initEnemy(e, pickKind(random, state.wave), pos.x, pos.y, state.wave, elite);
            if (elite) particles.burst(pos.x, pos.y, '#ffd166', 10, 160);
          }
        }
      }
      const bossDead = bossWave && state.bossSpawned && (!state.boss || !state.boss.active);
      const timeUp = state.waveTime >= WAVE_SECONDS;
      if ((bossWave && bossDead) || (!bossWave && timeUp)) {
        if (state.wave >= FINAL_WAVE) {
          // Reached only via the boss dying; handled by state.won above.
        } else {
          state.waveState = 'intermission';
          state.intermission = INTERMISSION_SECONDS;
          state.score += 50 * state.wave;
          events |= EVENT_WAVE;
          setBanner(`WAVE ${state.wave} CLEARED`, `+${50 * state.wave} bonus. Catch your breath.`, 2);
        }
      }
    } else {
      state.intermission -= dt;
      if (state.intermission <= 0) {
        startWave(state.wave + 1);
        events |= EVENT_WAVE;
      }
    }

    updateWeapons(dt);
    updateShots(dt);
    updateEnemies(dt);
    updateShards(dt);
    particles.step(dt);

    if (state.won) {
      events |= EVENT_WIN;
      return events;
    }
    if (state.over) {
      events |= EVENT_OVER;
      return events;
    }
    if (state.pendingLevels > 0 && !state.choices) {
      state.choices = rollChoices(random, player.weapons);
      events |= EVENT_LEVELUP;
    }
    return events;
  }

  /** Attract mode: enemies drift and the demo player kites them, no damage, no score. */
  function updateEnemiesAttract(dt) {
    if (state.toSpawn > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        state.spawnTimer = 0.9;
        const e = freeEnemy();
        if (e) {
          const pos = spawnEdge(random);
          state.toSpawn -= 1;
          initEnemy(e, pickKind(random, 2), pos.x, pos.y, 2, false);
        }
      }
    }
    // Demo pilot: drift in a slow circle so the title backdrop stays alive.
    const cx = FIELD.width / 2;
    const cy = FIELD.height / 2;
    const a = state.time * 0.25;
    player.x = cx + Math.cos(a) * 220;
    player.y = cy + Math.sin(a * 1.3) * 150;
    for (const e of enemies) {
      if (!e.active) continue;
      moveEnemy(e, player, dt, state.time);
      const rr = e.radius + player.radius;
      if (dist2(e.x, e.y, player.x, player.y) < rr * rr) {
        e.active = false;
        particles.burst(e.x, e.y, e.color, 8, 160);
      }
    }
    updateShards(dt);
  }

  /** Apply a level-up choice. Returns fresh choices if another level is queued, else null. */
  function applyLevelChoice(choice) {
    const label = applyChoice(player, choice);
    state.pendingLevels -= 1;
    state.choices = null;
    audio.levelUp();
    particles.ring(player.x, player.y, '#ffd166', 30, 300);
    if (state.pendingLevels > 0) {
      state.choices = rollChoices(random, player.weapons);
      return { label, choices: state.choices };
    }
    return { label, choices: null };
  }

  /** Testing hook: a strong level-8 loadout dropped at wave 9. Never used in normal play. */
  function debugBoost() {
    player.level = 8;
    player.xp = 0;
    player.xpNext = xpForLevel(8);
    player.maxHp = 220;
    player.hp = 220;
    player.damageMul = 1.6;
    player.rateMul = 1.4;
    player.magnetMul = 1.5;
    player.weapons = [makeWeapon('blaster'), makeWeapon('blades'), makeWeapon('lightning'), makeWeapon('nova'), makeWeapon('frost')];
    player.weapons[0].level = 4;
    player.weapons[1].level = 3;
    player.weapons[2].level = 3;
    player.weapons[3].level = 2;
    player.weapons[4].level = 2;
    for (const e of enemies) e.active = false;
    for (const s of shards) s.active = false;
    startWave(9);
  }

  /** Testing hook: spawn the wave-10 boss at low HP. Never used in normal play. */
  function debugSpawnBoss() {
    spawnBoss('hollowStar');
    if (state.boss) state.boss.hp = 60;
  }

  reset();
  return { state, reset, step, applyLevelChoice, debugBoost, debugSpawnBoss, startWave };
}
