// LUMENFALL — Neon Survivor. Every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical arena; the renderer scales it to the
// window, so no rule below depends on the screen size.
export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** One wave lasts this long (seconds); waves 5 and 10 end early when their boss dies. */
export const WAVE_SECONDS = 42;
/** The last wave. Defeating its boss wins the game. */
export const FINAL_WAVE = 10;
/** Short breather between waves, in seconds. */
export const INTERMISSION_SECONDS = 4;

export const PLAYER = {
  radius: 14,
  speed: 265,
  maxHp: 100,
  dashSpeed: 720,
  dashTime: 0.16,
  dashCooldown: 2.2,
  dashInvuln: 0.35,
  pickupRadius: 26,
  magnetRadius: 110,
  contactDamage: 0,
};

export const ENEMY = {
  // drifter: slow chaser. skitter: fast and fragile. spitter: keeps its distance, shoots orbs.
  // brute: slow, tough, hits hard. warden: wave-5 boss. hollowStar: wave-10 boss.
  drifter: { radius: 14, hp: 22, speed: 78, damage: 10, xp: 1, score: 10, color: '#ff5d73' },
  skitter: { radius: 10, hp: 12, speed: 158, damage: 7, xp: 1, score: 15, color: '#ffb02e' },
  spitter: { radius: 13, hp: 26, speed: 62, damage: 8, xp: 2, score: 20, color: '#c77dff' },
  brute: { radius: 22, hp: 95, speed: 48, damage: 18, xp: 3, score: 30, color: '#ff3d81' },
  warden: { radius: 34, hp: 950, speed: 56, damage: 22, xp: 25, score: 500, color: '#ff2e63' },
  hollowStar: { radius: 44, hp: 2400, speed: 62, damage: 26, xp: 60, score: 2000, color: '#f8f32b' },
};

/** Spawn budget and mix per wave. count grows; elites appear from wave 3. */
export function wavePlan(wave) {
  return {
    count: 14 + wave * 9,
    interval: Math.max(0.32, 1.15 - wave * 0.07),
    eliteEvery: wave >= 3 ? Math.max(6, 12 - wave) : 0,
    brutes: wave >= 2 ? 1 + Math.floor(wave / 2) : 0,
    spitters: wave >= 2 ? Math.floor(wave / 2) : 0,
  };
}

/** XP needed to reach the next level (level is 1-based). */
export function xpForLevel(level) {
  return Math.floor(6 + (level - 1) * 5 + (level - 1) * (level - 1) * 0.9);
}

/** How many enemies, shards, projectiles, particles and damage numbers can exist at once. */
export const POOL = { enemies: 200, shards: 260, shots: 320, orbs: 120, particles: 420, numbers: 48 };

export const COMBO = { window: 2.5, perKill: 0.06, maxMult: 3 };

export const PALETTE = {
  backdrop: '#05070f',
  arena: '#0a0f22',
  arenaEdge: '#1b2b52',
  grid: '#111a38',
  player: '#39f5d6',
  playerCore: '#eafffb',
  shard: '#7df9ff',
  shardBig: '#ffd166',
  panel: '#0d1329',
  panelEdge: '#2b3f7a',
  text: '#eef3ff',
  muted: '#93a1c6',
  gold: '#ffd166',
  danger: '#ff5d73',
  heal: '#5dffa0',
  boss: '#f8f32b',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'lumenfall.best';
/** Where the best wave reached is kept. */
export const BEST_WAVE_KEY = 'lumenfall.bestWave';
