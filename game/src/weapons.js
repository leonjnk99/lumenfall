// The five weapons. Each is auto-firing: the player moves and dodges, the
// arsenal does the shooting. A weapon has a level (1..5); levelling it up
// raises its damage, count or rate as its `perLevel` table says.
export const WEAPON_DEFS = {
  blaster: {
    name: 'Pulse Blaster', icon: '◈', color: '#39f5d6',
    blurb: 'Fires plasma bolts at the nearest foe.',
    base: { damage: 14, rate: 2.6, count: 1, speed: 520 },
    perLevel: { damage: 6, rate: 0.35, count: 0 },
    countAt: (level) => (level >= 4 ? 3 : level >= 2 ? 2 : 1),
  },
  blades: {
    name: 'Orbit Blades', icon: '✦', color: '#ffd166',
    blurb: 'Blades circle you, shredding what they touch.',
    base: { damage: 12, rate: 0, count: 2, speed: 260 },
    perLevel: { damage: 5, rate: 0, count: 0 },
    countAt: (level) => 1 + level,
  },
  nova: {
    name: 'Nova Burst', icon: '✺', color: '#ff5d73',
    blurb: 'A shockwave erupts around you every few seconds.',
    base: { damage: 26, rate: 0.42, count: 1, speed: 0 },
    perLevel: { damage: 12, rate: 0.07, count: 0 },
    countAt: () => 1,
  },
  lightning: {
    name: 'Chain Lightning', icon: '⚡', color: '#7df9ff',
    blurb: 'Lightning arcs between the nearest foes.',
    base: { damage: 20, rate: 0.8, count: 3, speed: 0 },
    perLevel: { damage: 9, rate: 0.12, count: 0 },
    countAt: (level) => 2 + Math.floor(level / 2),
  },
  frost: {
    name: 'Frost Field', icon: '❄', color: '#a5b4ff',
    blurb: 'A freezing aura slows and bites nearby foes.',
    base: { damage: 7, rate: 2, count: 1, speed: 0 },
    perLevel: { damage: 3, rate: 0.25, count: 0 },
    countAt: () => 1,
  },
};

export const MAX_WEAPON_LEVEL = 5;

/** A fresh weapon instance at level 1. */
export function makeWeapon(id) {
  return { id, level: 1, cooldown: 0.4, angle: 0, tick: 0 };
}

/** Effective stats of a weapon at its level, with the player's damage/fire-rate multipliers applied. */
export function weaponStats(weapon, damageMul, rateMul) {
  const def = WEAPON_DEFS[weapon.id];
  const lvl = weapon.level - 1;
  return {
    damage: (def.base.damage + def.perLevel.damage * lvl) * damageMul,
    rate: (def.base.rate + def.perLevel.rate * lvl) * rateMul,
    count: def.countAt(weapon.level),
    speed: def.base.speed,
  };
}
