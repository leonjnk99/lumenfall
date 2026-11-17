// Enemies: spawning, movement and contact. Each enemy is one pooled object;
// the world owns the pools, this module owns the per-type behaviour.
import { ENEMY, FIELD } from './config.js';
import { pickWeighted } from './random.js';

export const KIND = {
  drifter: 'drifter',
  skitter: 'skitter',
  spitter: 'spitter',
  brute: 'brute',
  warden: 'warden',
  hollowStar: 'hollowStar',
};

const MIX = {
  1: [{ value: 'drifter', weight: 10 }, { value: 'skitter', weight: 3 }],
  2: [{ value: 'drifter', weight: 8 }, { value: 'skitter', weight: 5 }, { value: 'spitter', weight: 2 }],
  3: [{ value: 'drifter', weight: 7 }, { value: 'skitter', weight: 6 }, { value: 'spitter', weight: 3 }, { value: 'brute', weight: 2 }],
  4: [{ value: 'drifter', weight: 6 }, { value: 'skitter', weight: 6 }, { value: 'spitter', weight: 4 }, { value: 'brute', weight: 3 }],
  5: [{ value: 'drifter', weight: 5 }, { value: 'skitter', weight: 6 }, { value: 'spitter', weight: 4 }, { value: 'brute', weight: 4 }],
};

function mixFor(wave) {
  return MIX[Math.min(wave, 5)];
}

/** Spawn position just outside a random arena edge. */
export function spawnEdge(random) {
  const side = Math.floor(random() * 4);
  const m = 30;
  if (side === 0) return { x: random() * FIELD.width, y: -m };
  if (side === 1) return { x: FIELD.width + m, y: random() * FIELD.height };
  if (side === 2) return { x: random() * FIELD.width, y: FIELD.height + m };
  return { x: -m, y: random() * FIELD.height };
}

export function pickKind(random, wave) {
  return pickWeighted(random, mixFor(wave));
}

/** Fill a pooled enemy object as a fresh enemy of `kind` at `x, y`. */
export function initEnemy(e, kind, x, y, wave, elite) {
  const def = ENEMY[kind];
  const hpScale = 1 + (wave - 1) * 0.22 + (elite ? 2.2 : 0);
  e.active = true;
  e.kind = kind;
  e.x = x; e.y = y;
  e.radius = def.radius * (elite ? 1.35 : 1);
  e.hp = def.hp * hpScale;
  e.maxHp = e.hp;
  e.speed = def.speed * (0.9 + Math.random() * 0.2) * (elite ? 0.9 : 1);
  e.damage = def.damage * (elite ? 1.5 : 1);
  e.xp = def.xp * (elite ? 5 : 1);
  e.score = def.score * (elite ? 5 : 1);
  e.elite = elite;
  e.boss = kind === 'warden' || kind === 'hollowStar';
  e.color = def.color;
  e.flash = 0;
  e.slow = 0;
  e.slowTimer = 0;
  e.shootTimer = 1 + Math.random() * 1.5;
  e.touchTimer = 0;
  e.phase = Math.random() * Math.PI * 2;
  e.wobble = 0;
}

/** One step of enemy movement toward the player. Returns nothing; sets e.x/e.y. */
export function moveEnemy(e, player, dt, time) {
  const dx = player.x - e.x;
  const dy = player.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  let speed = e.speed;
  if (e.slowTimer > 0) speed *= 0.55;
  if (e.kind === 'spitter') {
    // Spitters hold a ring around the player instead of charging in.
    const want = 260;
    const radial = dist > want + 40 ? 1 : dist < want - 40 ? -1 : 0;
    const tangent = Math.sin(time * 0.7 + e.phase) > 0 ? 1 : -1;
    e.x += ((dx / dist) * radial + (-dy / dist) * tangent * 0.6) * speed * dt;
    e.y += ((dy / dist) * radial + (dx / dist) * tangent * 0.6) * speed * dt;
  } else if (e.kind === 'skitter') {
    // Skitters zig-zag as they close in.
    const wob = Math.sin(time * 5 + e.phase) * 0.6;
    e.x += ((dx / dist) + (-dy / dist) * wob) * speed * dt;
    e.y += ((dy / dist) + (dx / dist) * wob) * speed * dt;
  } else {
    e.x += (dx / dist) * speed * dt;
    e.y += (dy / dist) * speed * dt;
  }
  // Bosses drift in a slow spiral on top of the chase.
  if (e.boss) {
    e.x += Math.cos(time * 0.9 + e.phase) * 22 * dt;
    e.y += Math.sin(time * 0.9 + e.phase) * 22 * dt;
  }
  e.x = Math.max(-60, Math.min(FIELD.width + 60, e.x));
  e.y = Math.max(-60, Math.min(FIELD.height + 60, e.y));
}
