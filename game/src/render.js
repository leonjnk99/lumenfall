// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 playfield is scaled to fit the window and centred, the margin filled
// with the backdrop colour. Neon glow is faked with layered strokes and the
// 'lighter' composite — no images, no fonts to load, nothing from the network.
import { FIELD, FONT, PALETTE, FINAL_WAVE } from './config.js';
import { WEAPON_DEFS } from './weapons.js';
import {
  SCREEN_HOWTO, SCREEN_LEVELUP, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY,
  SCREEN_TITLE, SCREEN_WIN, hit, howtoLayout, levelUpLayout, overLayout,
  pauseLayout, titleLayout, winLayout,
} from './ui.js';

export { SCREEN_HOWTO, SCREEN_LEVELUP, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN };

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, cssScale: 1 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
    view.cssScale = width / window.innerWidth;
  }

  function font(size, bold = false) {
    const key = `${bold ? 'b' : ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align = 'left', bold = false) {
    context.font = font(size, bold);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function glowCircle(x, y, r, color, alpha = 0.35) {
    context.globalAlpha = alpha;
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, r * 1.9, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
  }

  function poly(x, y, radius, sides, rotation) {
    context.beginPath();
    for (let i = 0; i < sides; i += 1) {
      const a = rotation + (i / sides) * Math.PI * 2;
      const px = x + Math.cos(a) * radius;
      const py = y + Math.sin(a) * radius;
      if (i === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
  }

  function star(x, y, radius, rotation) {
    context.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const r = i % 2 === 0 ? radius : radius * 0.45;
      const a = rotation + (i / 10) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
  }

  function drawField(state) {
    context.fillStyle = PALETTE.arena;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // Grid.
    context.strokeStyle = PALETTE.grid;
    context.lineWidth = 1;
    context.beginPath();
    for (let x = 0; x <= FIELD.width; x += 64) { context.moveTo(x, 0); context.lineTo(x, FIELD.height); }
    for (let y = 0; y <= FIELD.height; y += 64) { context.moveTo(0, y); context.lineTo(FIELD.width, y); }
    context.stroke();
    // Arena edge glow.
    context.strokeStyle = PALETTE.arenaEdge;
    context.lineWidth = 3;
    context.strokeRect(1.5, 1.5, FIELD.width - 3, FIELD.height - 3);
    context.strokeStyle = 'rgba(57,245,214,0.25)';
    context.lineWidth = 1;
    context.strokeRect(6, 6, FIELD.width - 12, FIELD.height - 12);
  }

  function drawShards(state) {
    for (const s of state.shards) {
      if (!s.active) continue;
      const bob = Math.sin(s.bob) * 2;
      const color = s.big ? PALETTE.shardBig : PALETTE.shard;
      context.save();
      context.translate(s.x, s.y + bob);
      context.rotate(Math.PI / 4);
      context.fillStyle = color;
      const r = s.big ? 7 : 5;
      context.fillRect(-r, -r, r * 2, r * 2);
      context.restore();
    }
  }

  function drawOrbs(state) {
    for (const o of state.orbs) {
      if (!o.active) continue;
      glowCircle(o.x, o.y, o.radius, '#c77dff', 0.5);
      context.fillStyle = '#e9d5ff';
      context.beginPath();
      context.arc(o.x, o.y, o.radius, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawShots(state) {
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (const s of state.shots) {
      if (!s.active) continue;
      glowCircle(s.x, s.y, s.radius + 2, s.color, 0.55);
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(s.x, s.y, s.radius * 0.7, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function drawEnemy(e, time) {
    const flash = e.flash > 0;
    const color = flash ? '#ffffff' : e.color;
    const angleToPlayer = Math.atan2(stateRef.player.y - e.y, stateRef.player.x - e.x);
    context.save();
    context.translate(e.x, e.y);
    if (e.elite) {
      context.strokeStyle = '#ffd166';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(0, 0, e.radius + 6 + Math.sin(time * 6) * 2, 0, Math.PI * 2);
      context.stroke();
    }
    glowCircle(0, 0, e.radius, e.color, e.boss ? 0.5 : 0.28);
    context.fillStyle = color;
    context.strokeStyle = color;
    context.lineWidth = 2;
    if (e.kind === 'drifter') {
      context.rotate(Math.PI / 4);
      context.fillRect(-e.radius * 0.8, -e.radius * 0.8, e.radius * 1.6, e.radius * 1.6);
    } else if (e.kind === 'skitter') {
      poly(0, 0, e.radius, 3, angleToPlayer);
      context.fill();
    } else if (e.kind === 'spitter') {
      poly(0, 0, e.radius, 6, time * 0.8);
      context.fill();
      context.fillStyle = '#0a0f22';
      context.beginPath();
      context.arc(0, 0, e.radius * 0.4, 0, Math.PI * 2);
      context.fill();
    } else if (e.kind === 'brute') {
      context.fillRect(-e.radius, -e.radius, e.radius * 2, e.radius * 2);
      context.strokeRect(-e.radius * 0.55, -e.radius * 0.55, e.radius * 1.1, e.radius * 1.1);
    } else if (e.kind === 'warden') {
      poly(0, 0, e.radius, 5, time * 0.5);
      context.fill();
      context.fillStyle = '#0a0f22';
      poly(0, 0, e.radius * 0.45, 5, -time * 0.5);
      context.fill();
    } else {
      // hollowStar: a five-pointed star, slowly turning.
      star(0, 0, e.radius, time * 0.4);
      context.fill();
    }
    context.restore();
    // Boss / elite health bar.
    if ((e.boss || e.elite) && e.hp < e.maxHp) {
      const w = e.boss ? 90 : 44;
      const y = e.y - e.radius - 12;
      context.fillStyle = 'rgba(0,0,0,0.55)';
      context.fillRect(e.x - w / 2, y, w, 6);
      context.fillStyle = e.boss ? PALETTE.boss : '#ffd166';
      context.fillRect(e.x - w / 2, y, w * Math.max(0, e.hp / e.maxHp), 6);
    }
  }

  let stateRef = null;

  function drawPlayer(state, time) {
    const p = state.player;
    if (p.invuln > 0 && p.dashTimer <= 0 && Math.floor(p.invuln * 12) % 2 === 0) return; // blink
    const angle = Math.atan2(p.aimY, p.aimX);
    context.save();
    context.translate(p.x, p.y);
    glowCircle(0, 0, p.radius + 8, PALETTE.player, 0.5);
    context.rotate(angle);
    context.fillStyle = PALETTE.player;
    poly(0, 0, p.radius + 4, 3, 0);
    context.fill();
    context.fillStyle = PALETTE.playerCore;
    context.beginPath();
    context.arc(0, 0, 5.5, 0, Math.PI * 2);
    context.fill();
    context.restore();
    if (p.hurtFlash > 0) {
      context.strokeStyle = `rgba(255,93,115,${p.hurtFlash * 2})`;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(p.x, p.y, p.radius + 10, 0, Math.PI * 2);
      context.stroke();
    }
  }

  function drawBlades(state) {
    const p = state.player;
    const blades = p.weapons.find((w) => w.id === 'blades');
    if (!blades) return;
    const count = 1 + blades.level;
    const radius = 62 + blades.level * 4;
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (let i = 0; i < count; i += 1) {
      const a = blades.angle + (i / count) * Math.PI * 2;
      const bx = p.x + Math.cos(a) * radius;
      const by = p.y + Math.sin(a) * radius;
      glowCircle(bx, by, 10, WEAPON_DEFS.blades.color, 0.5);
      context.fillStyle = '#fff3c4';
      context.beginPath();
      context.arc(bx, by, 5, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function drawParticles(state) {
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (const pt of state.particles.list) {
      if (!pt.active) continue;
      context.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      context.fillStyle = pt.color;
      context.beginPath();
      context.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    context.globalAlpha = 1;
    for (const n of state.particles.numbers) {
      if (!n.active) continue;
      context.globalAlpha = Math.max(0, n.life / n.maxLife);
      text(n.text, n.x, n.y, n.size, n.color, 'center', true);
    }
    context.globalAlpha = 1;
  }

  function drawZapsAndRings(state) {
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (const z of state.zaps) {
      context.globalAlpha = Math.max(0, z.life / z.maxLife);
      context.strokeStyle = '#aefcff';
      context.lineWidth = 2.5;
      context.beginPath();
      const mx = (z.x1 + z.x2) / 2 + (Math.random() - 0.5) * 30;
      const my = (z.y1 + z.y2) / 2 + (Math.random() - 0.5) * 30;
      context.moveTo(z.x1, z.y1);
      context.lineTo(mx, my);
      context.lineTo(z.x2, z.y2);
      context.stroke();
    }
    for (const r of state.rings) {
      context.globalAlpha = Math.max(0, r.life / r.maxLife);
      context.strokeStyle = r.color;
      context.lineWidth = 5;
      context.beginPath();
      context.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
    context.globalAlpha = 1;
  }

  function bar(x, y, w, h, frac, fill, back = 'rgba(0,0,0,0.55)') {
    context.fillStyle = back;
    context.fillRect(x, y, w, h);
    context.fillStyle = fill;
    context.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  }

  function drawHud(state, best, muted) {
    const p = state.player;
    // XP bar across the very top.
    bar(0, 0, FIELD.width, 7, p.xp / p.xpNext, '#7df9ff', '#101736');
    // HP.
    text('HP', 22, 44, 17, PALETTE.muted, 'left', true);
    bar(56, 30, 230, 18, p.hp / p.maxHp, p.hp / p.maxHp > 0.3 ? '#5dffa0' : '#ff5d73');
    context.strokeStyle = 'rgba(255,255,255,0.25)';
    context.lineWidth = 1;
    context.strokeRect(56, 30, 230, 18);
    text(`${Math.max(0, Math.ceil(p.hp))} / ${p.maxHp}`, 296, 44, 15, PALETTE.text, 'left');
    text(`LV ${p.level}`, 22, 72, 17, PALETTE.gold, 'left', true);
    // Wave + timer, centred.
    const waveLabel = state.waveState === 'intermission'
      ? `WAVE ${state.wave} CLEARED — NEXT IN ${Math.ceil(state.intermission)}`
      : `WAVE ${state.wave} / ${FINAL_WAVE}`;
    text(waveLabel, FIELD.width / 2, 44, 20, PALETTE.text, 'center', true);
    if (state.waveState === 'fight') {
      const left = Math.max(0, 42 - state.waveTime);
      text(`0:${String(Math.floor(left)).padStart(2, '0')}`, FIELD.width / 2, 68, 15, PALETTE.muted, 'center');
    }
    // Boss bar.
    if (state.boss && state.boss.active) {
      const name = state.boss.kind === 'hollowStar' ? 'THE HOLLOW STAR' : 'THE WARDEN';
      text(name, FIELD.width / 2, 100, 16, PALETTE.boss, 'center', true);
      bar(FIELD.width / 2 - 260, 108, 520, 12, state.boss.hp / state.boss.maxHp, PALETTE.boss);
    }
    // Score + combo, right.
    text(`SCORE ${state.score}`, FIELD.width - 22, 44, 20, PALETTE.text, 'right', true);
    text(`BEST ${best}`, FIELD.width - 22, 68, 15, PALETTE.muted, 'right');
    if (state.combo >= 5) {
      text(`COMBO x${state.comboMult.toFixed(2)}  (${state.combo})`, FIELD.width - 22, 94, 17, '#ffd166', 'right', true);
    }
    // Weapons, bottom left.
    let wx = 22;
    text('ARSENAL', wx, FIELD.height - 52, 13, PALETTE.muted, 'left', true);
    for (const w of p.weapons) {
      const def = WEAPON_DEFS[w.id];
      text(`${def.icon} ${def.name} ${'●'.repeat(w.level)}${'○'.repeat(5 - w.level)}`, wx, FIELD.height - 28, 15, def.color, 'left');
      wx += 230;
    }
    // Dash cooldown, bottom right.
    const dashFrac = p.dashCooldown <= 0 ? 1 : 1 - p.dashCooldown / (2.2 * p.dashCooldownMul);
    text(p.dashCooldown <= 0 ? 'DASH READY  [SPACE]' : 'DASH…', FIELD.width - 22, FIELD.height - 28, 15, dashFrac >= 1 ? '#39f5d6' : PALETTE.muted, 'right', true);
    bar(FIELD.width - 172, FIELD.height - 20, 150, 6, dashFrac, '#39f5d6');
    if (muted) text('MUTED  [M]', FIELD.width - 22, FIELD.height - 52, 13, PALETTE.muted, 'right');
    // Boss off-screen indicator.
    if (state.boss && state.boss.active) {
      const b = state.boss;
      if (b.x < 0 || b.x > FIELD.width || b.y < 0 || b.y > FIELD.height) {
        const cx = Math.max(30, Math.min(FIELD.width - 30, b.x));
        const cy = Math.max(90, Math.min(FIELD.height - 30, b.y));
        const a = Math.atan2(b.y - cy, b.x - cx);
        context.save();
        context.translate(cx, cy);
        context.rotate(a);
        context.fillStyle = PALETTE.boss;
        poly(0, 0, 14, 3, 0);
        context.fill();
        context.restore();
      }
    }
    // Banner.
    if (state.banner) {
      const alpha = Math.min(1, state.banner.timer);
      context.globalAlpha = alpha;
      text(state.banner.text, FIELD.width / 2, 190, 34, '#ffffff', 'center', true);
      if (state.banner.sub) text(state.banner.sub, FIELD.width / 2, 220, 17, PALETTE.muted, 'center');
      context.globalAlpha = 1;
    }
  }

  function panel(rect, title, titleColor = PALETTE.text) {
    context.fillStyle = 'rgba(5,8,18,0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    context.fillRect(rect.x, rect.y, rect.w, rect.h);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(rect.x, rect.y, rect.w, rect.h);
    text(title, FIELD.width / 2, rect.y + 62, 40, titleColor, 'center', true);
  }

  function button(rect, label, hovered) {
    context.fillStyle = hovered ? '#2b3f7a' : '#1a2342';
    context.fillRect(rect.x, rect.y, rect.w, rect.h);
    context.strokeStyle = hovered ? '#39f5d6' : PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(rect.x, rect.y, rect.w, rect.h);
    text(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 7, 19, hovered ? '#ffffff' : PALETTE.text, 'center', true);
  }

  function drawTitle(state, best, bestWave, hover) {
    const layout = titleLayout();
    panel(layout.panel, 'LUMENFALL', '#39f5d6');
    text('N E O N   S U R V I V O R', FIELD.width / 2, layout.panel.y + 100, 18, PALETTE.gold, 'center', true);
    text('The dark is full of teeth. Your light is loaded.', FIELD.width / 2, layout.panel.y + 138, 17, PALETTE.muted, 'center');
    text('Survive 10 waves. Slay the Hollow Star.', FIELD.width / 2, layout.panel.y + 166, 17, PALETTE.text, 'center');
    if (best > 0) text(`BEST  SCORE ${best}  ·  WAVE ${bestWave}`, FIELD.width / 2, layout.panel.y + 200, 16, PALETTE.gold, 'center', true);
    text('WASD / Arrows — move      SPACE — dash      P — pause      M — mute', FIELD.width / 2, layout.panel.y + 238, 15, PALETTE.muted, 'center');
    text('Weapons fire on their own. Grab shards, level up, pick your build.', FIELD.width / 2, layout.panel.y + 262, 15, PALETTE.muted, 'center');
    for (const b of layout.buttons) button(b, b.label, hover && hit(b, hover.x, hover.y));
    button(layout.mute, '♪', hover && hit(layout.mute, hover.x, hover.y));
    // Below the panel, clear of both buttons: the footer used to sit inside
    // the HOW TO PLAY button's rect.
    text('v1.0 — an original game. No downloads, no accounts, no ads.', FIELD.width / 2, layout.panel.y + layout.panel.h + 26, 13, PALETTE.muted, 'center');
  }

  function drawHowto(hover) {
    const layout = howtoLayout();
    panel(layout.panel, 'HOW TO PLAY');
    const lines = [
      ['MOVE', 'WASD or Arrow keys'],
      ['DASH', 'SPACE — a burst of speed with brief invulnerability'],
      ['PAUSE', 'P or Esc'],
      ['MUTE', 'M'],
      ['GOAL', 'Survive each 42-second wave. Waves 5 and 10 bring bosses.'],
      ['LEVEL UP', 'Collect glowing shards. Pick 1 of 3 cards with mouse or keys 1-3.'],
      ['WEAPONS', 'Pulse Blaster · Orbit Blades · Nova Burst · Chain Lightning · Frost Field'],
      ['ENEMIES', 'Drifters chase · Skitters zig-zag · Spitters shoot · Brutes hit hard'],
      ['ELITES', 'Gold-ringed foes drop 5x shards. Bosses drop a flood of them.'],
      ['WIN', 'Defeat the Hollow Star on wave 10.'],
    ];
    let y = layout.panel.y + 108;
    for (const [k, v] of lines) {
      text(k, layout.panel.x + 40, y, 16, PALETTE.gold, 'left', true);
      text(v, layout.panel.x + 170, y, 16, PALETTE.text, 'left');
      y += 34;
    }
    for (const b of layout.buttons) button(b, b.label, hover && hit(b, hover.x, hover.y));
  }

  function drawPaused(hover) {
    const layout = pauseLayout();
    panel(layout.panel, 'PAUSED');
    text('The swarm waits. Breathe.', FIELD.width / 2, layout.panel.y + 108, 17, PALETTE.muted, 'center');
    for (const b of layout.buttons) button(b, b.label, hover && hit(b, hover.x, hover.y));
  }

  function drawLevelUp(state, hover) {
    const layout = levelUpLayout(state.choices);
    context.fillStyle = 'rgba(5,8,18,0.66)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    text('LEVEL UP!', FIELD.width / 2, 150, 44, PALETTE.gold, 'center', true);
    text(`You reached level ${state.player.level}. Choose one.`, FIELD.width / 2, 190, 18, PALETTE.text, 'center');
    for (const card of layout.cards) {
      const r = card.rect;
      const hov = hover && hit(r, hover.x, hover.y);
      context.fillStyle = hov ? '#18224a' : PALETTE.panel;
      context.fillRect(r.x, r.y, r.w, r.h);
      context.strokeStyle = hov ? card.choice.color : PALETTE.panelEdge;
      context.lineWidth = hov ? 3 : 2;
      context.strokeRect(r.x, r.y, r.w, r.h);
      text(card.choice.icon, r.x + r.w / 2, r.y + 74, 44, card.choice.color, 'center');
      text(card.choice.name, r.x + r.w / 2, r.y + 118, 19, PALETTE.text, 'center', true);
      // Wrap the blurb to two lines.
      const words = card.choice.blurb.split(' ');
      let line = '';
      let lineY = r.y + 152;
      const lines = [];
      for (const word of words) {
        if ((line + ' ' + word).trim().length > 30) { lines.push(line.trim()); line = word; }
        else line = `${line} ${word}`;
      }
      lines.push(line.trim());
      for (const ln of lines.slice(0, 3)) { text(ln, r.x + r.w / 2, lineY, 15, PALETTE.muted, 'center'); lineY += 22; }
      text(`Press ${card.index + 1}`, r.x + r.w / 2, r.y + r.h - 20, 14, card.choice.color, 'center', true);
    }
  }

  function statLines(state, best) {
    return [
      `Score  ${state.score}`,
      `Best  ${Math.max(best, state.score)}`,
      `Wave reached  ${state.wave} / ${FINAL_WAVE}`,
      `Kills  ${state.kills}`,
      `Level  ${state.player.level}`,
      `Time survived  ${Math.floor(state.elapsed / 60)}:${String(Math.floor(state.elapsed % 60)).padStart(2, '0')}`,
      `Damage dealt  ${Math.round(state.stats.damageDealt)}`,
    ];
  }

  function drawOver(state, best, hover) {
    const layout = overLayout();
    panel(layout.panel, 'THE LIGHT FADES', '#ff5d73');
    text(`The swarm takes wave ${state.wave}.`, FIELD.width / 2, layout.panel.y + 100, 17, PALETTE.muted, 'center');
    let y = layout.panel.y + 148;
    for (const line of statLines(state, best)) {
      text(line, FIELD.width / 2, y, 17, PALETTE.text, 'center');
      y += 30;
    }
    for (const b of layout.buttons) button(b, b.label, hover && hit(b, hover.x, hover.y));
  }

  function drawWin(state, best, hover) {
    const layout = winLayout();
    panel(layout.panel, 'THE HOLLOW STAR FALLS', PALETTE.boss);
    text('All ten waves survived. The arena is yours, Lumin.', FIELD.width / 2, layout.panel.y + 100, 17, PALETTE.muted, 'center');
    let y = layout.panel.y + 148;
    for (const line of statLines(state, best)) {
      text(line, FIELD.width / 2, y, 17, PALETTE.text, 'center');
      y += 30;
    }
    for (const b of layout.buttons) button(b, b.label, hover && hit(b, hover.x, hover.y));
  }

  /** Paint one frame. `hover` is the pointer in logical coords, or null. */
  function draw(state, screen, best, bestWave, muted, hover) {
    stateRef = state;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    drawField(state);
    drawShards(state);
    drawOrbs(state);
    drawBlades(state);
    drawShots(state);
    for (const e of state.enemies) if (e.active) drawEnemy(e, state.time);
    drawPlayer(state, state.time);
    drawZapsAndRings(state);
    drawParticles(state);
    if (screen === SCREEN_TITLE) {
      drawHud(state, best, muted);
      drawTitle(state, best, bestWave, hover);
    } else if (screen === SCREEN_HOWTO) {
      drawHud(state, best, muted);
      drawHowto(hover);
    } else if (screen === SCREEN_PLAY) {
      drawHud(state, best, muted);
    } else if (screen === SCREEN_PAUSED) {
      drawHud(state, best, muted);
      drawPaused(hover);
    } else if (screen === SCREEN_LEVELUP) {
      drawHud(state, best, muted);
      if (state.choices) drawLevelUp(state, hover);
    } else if (screen === SCREEN_OVER) {
      drawHud(state, best, muted);
      drawOver(state, best, hover);
    } else if (screen === SCREEN_WIN) {
      drawHud(state, best, muted);
      drawWin(state, best, hover);
    }
  }

  resize();
  window.addEventListener('resize', resize);

  return {
    draw,
    /** CSS-pixel pointer position → logical playfield coords. */
    toLogical(cssX, cssY) {
      return {
        x: (cssX * view.cssScale - view.x) / view.scale,
        y: (cssY * view.cssScale - view.y) / view.scale,
      };
    },
  };
}
