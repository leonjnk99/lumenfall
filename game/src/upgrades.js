// Level-up choices. A choice is a card: a new weapon, a weapon level, or a
// stat boost. rollChoices picks 3 distinct cards the player can still use.
import { MAX_WEAPON_LEVEL, WEAPON_DEFS, makeWeapon } from './weapons.js';

export const STAT_CHOICES = [
  { kind: 'stat', stat: 'maxHp', name: 'Reinforced Core', icon: '♥', blurb: '+25 max HP and heal 25.', color: '#5dffa0' },
  { kind: 'stat', stat: 'speed', name: 'Ion Thrusters', icon: '»', blurb: '+12% move speed.', color: '#7df9ff' },
  { kind: 'stat', stat: 'magnet', name: 'Shard Magnet', icon: '◎', blurb: '+45% pickup radius.', color: '#ffd166' },
  { kind: 'stat', stat: 'damage', name: 'Overcharge', icon: '▲', blurb: '+15% weapon damage.', color: '#ff5d73' },
  { kind: 'stat', stat: 'fireRate', name: 'Rapid Cycler', icon: '≋', blurb: '+12% fire rate.', color: '#c77dff' },
  { kind: 'stat', stat: 'dash', name: 'Phase Dash', icon: '↯', blurb: 'Dash recharges 25% faster.', color: '#39f5d6' },
];

/**
 * Roll 3 distinct level-up cards for the player. Weapons the player owns can
 * appear as an upgrade until level 5; new weapons appear until all five are held.
 */
export function rollChoices(random, weapons) {
  const pool = [];
  for (const id of Object.keys(WEAPON_DEFS)) {
    const owned = weapons.find((w) => w.id === id);
    if (!owned) {
      pool.push({ kind: 'newWeapon', weapon: id, name: WEAPON_DEFS[id].name, icon: WEAPON_DEFS[id].icon, blurb: WEAPON_DEFS[id].blurb, color: WEAPON_DEFS[id].color });
    } else if (owned.level < MAX_WEAPON_LEVEL) {
      pool.push({ kind: 'upgradeWeapon', weapon: id, name: `${WEAPON_DEFS[id].name} II+`, icon: WEAPON_DEFS[id].icon, blurb: `Raise ${WEAPON_DEFS[id].name} to level ${owned.level + 1}.`, color: WEAPON_DEFS[id].color });
    }
  }
  for (const s of STAT_CHOICES) pool.push({ ...s });
  const picks = [];
  const bag = [...pool];
  while (picks.length < 3 && bag.length > 0) {
    const i = Math.floor(random() * bag.length);
    picks.push(bag.splice(i, 1)[0]);
  }
  return picks;
}

/** Apply a chosen card to the player object. Returns a short label for the log. */
export function applyChoice(player, choice) {
  if (choice.kind === 'newWeapon') {
    player.weapons.push(makeWeapon(choice.weapon));
    return `${WEAPON_DEFS[choice.weapon].name} acquired!`;
  }
  if (choice.kind === 'upgradeWeapon') {
    const w = player.weapons.find((x) => x.id === choice.weapon);
    if (w) w.level = Math.min(MAX_WEAPON_LEVEL, w.level + 1);
    return `${WEAPON_DEFS[choice.weapon].name} → level ${w ? w.level : 1}`;
  }
  if (choice.stat === 'maxHp') {
    player.maxHp += 25;
    player.hp = Math.min(player.maxHp, player.hp + 25);
  } else if (choice.stat === 'speed') player.speedMul *= 1.12;
  else if (choice.stat === 'magnet') player.magnetMul *= 1.45;
  else if (choice.stat === 'damage') player.damageMul *= 1.15;
  else if (choice.stat === 'fireRate') player.rateMul *= 1.12;
  else if (choice.stat === 'dash') player.dashCooldownMul *= 0.75;
  return choice.name;
}
