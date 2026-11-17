// Particles and floating damage numbers. Both are fixed pools allocated once,
// so a busy fight allocates nothing.
import { POOL } from './config.js';

export function createParticles() {
  const list = [];
  for (let i = 0; i < POOL.particles; i += 1) {
    list.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#fff', drag: 0.9, glow: false });
  }
  const numbers = [];
  for (let i = 0; i < POOL.numbers; i += 1) {
    numbers.push({ active: false, x: 0, y: 0, life: 0, maxLife: 1, text: '', color: '#fff', size: 14 });
  }

  function spawn(x, y, vx, vy, life, size, color, glow = true) {
    for (const p of list) {
      if (p.active) continue;
      p.active = true;
      p.x = x; p.y = y; p.vx = vx; p.vy = vy;
      p.life = life; p.maxLife = life; p.size = size; p.color = color; p.glow = glow;
      return;
    }
  }

  return {
    list,
    numbers,
    burst(x, y, color, count, speed = 180, size = 3) {
      for (let i = 0; i < count; i += 1) {
        const a = Math.random() * Math.PI * 2;
        const s = speed * (0.3 + Math.random() * 0.7);
        spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.35 + Math.random() * 0.4, size * (0.6 + Math.random() * 0.8), color);
      }
    },
    ring(x, y, color, count = 26, speed = 260) {
      for (let i = 0; i < count; i += 1) {
        const a = (i / count) * Math.PI * 2;
        spawn(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 0.5, 3.5, color);
      }
    },
    trail(x, y, color) {
      spawn(x, y, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0.3, 2.5, color);
    },
    damageNumber(x, y, value, color = '#fff', size = 14) {
      for (const n of numbers) {
        if (n.active) continue;
        n.active = true;
        n.x = x + (Math.random() - 0.5) * 14; n.y = y - 6;
        n.life = 0.8; n.maxLife = 0.8;
        n.text = String(Math.round(value)); n.color = color; n.size = size;
        return;
      }
    },
    step(dt) {
      for (const p of list) {
        if (!p.active) continue;
        p.life -= dt;
        if (p.life <= 0) { p.active = false; continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.92; p.vy *= 0.92;
      }
      for (const n of numbers) {
        if (!n.active) continue;
        n.life -= dt;
        if (n.life <= 0) { n.active = false; continue; }
        n.y -= 42 * dt;
      }
    },
    clear() {
      for (const p of list) p.active = false;
      for (const n of numbers) n.active = false;
    },
  };
}
