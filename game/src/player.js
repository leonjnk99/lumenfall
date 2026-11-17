// The player: position, health, movement and the dash. The world owns the
// rules around the player; this module owns the player's own numbers.
import { FIELD, PLAYER } from './config.js';
import { makeWeapon } from './weapons.js';

export function createPlayer() {
  return {
    x: FIELD.width / 2,
    y: FIELD.height / 2,
    radius: PLAYER.radius,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    level: 1,
    xp: 0,
    xpNext: 6,
    speedMul: 1,
    magnetMul: 1,
    damageMul: 1,
    rateMul: 1,
    dashCooldownMul: 1,
    weapons: [makeWeapon('blaster')],
    dashTimer: 0,
    dashCooldown: 0,
    dashX: 0,
    dashY: 0,
    invuln: 0,
    aimX: 1,
    aimY: 0,
    moving: false,
    hurtFlash: 0,
  };
}

export function resetPlayer(p) {
  const fresh = createPlayer();
  Object.assign(p, fresh);
  p.weapons = fresh.weapons;
}

/** Move the player one step. Dash overrides normal movement while it lasts. */
export function movePlayer(p, move, dashPressed, dt) {
  p.moving = move.x !== 0 || move.y !== 0;
  if (move.x !== 0 || move.y !== 0) {
    p.aimX = move.x;
    p.aimY = move.y;
  }
  if (p.dashCooldown > 0) p.dashCooldown -= dt;
  if (p.invuln > 0) p.invuln -= dt;
  if (p.hurtFlash > 0) p.hurtFlash -= dt;
  if (dashPressed && p.dashCooldown <= 0 && p.dashTimer <= 0) {
    p.dashTimer = PLAYER.dashTime;
    p.dashCooldown = PLAYER.dashCooldown * p.dashCooldownMul;
    p.invuln = Math.max(p.invuln, PLAYER.dashInvuln);
    const len = Math.hypot(move.x, move.y);
    if (len > 0) { p.dashX = move.x / len; p.dashY = move.y / len; }
    else { p.dashX = p.aimX; p.dashY = p.aimY; }
    return true; // dashed
  }
  if (p.dashTimer > 0) {
    p.dashTimer -= dt;
    p.x += p.dashX * PLAYER.dashSpeed * dt;
    p.y += p.dashY * PLAYER.dashSpeed * dt;
  } else {
    const speed = PLAYER.speed * p.speedMul;
    p.x += move.x * speed * dt;
    p.y += move.y * speed * dt;
  }
  p.x = Math.max(p.radius, Math.min(FIELD.width - p.radius, p.x));
  p.y = Math.max(p.radius, Math.min(FIELD.height - p.radius, p.y));
  return false;
}

/** Damage the player. Returns 'dead' when HP hits zero, 'hurt' when it lands, 'immune' otherwise. */
export function hurtPlayer(p, damage) {
  if (p.invuln > 0 || p.dashTimer > 0) return 'immune';
  p.hp -= damage;
  p.invuln = 0.6;
  p.hurtFlash = 0.25;
  return p.hp <= 0 ? 'dead' : 'hurt';
}
