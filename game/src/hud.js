// hud.js — everything the player reads: the cash, the stars, the bust meter
// filling at the worst moment, the Sun Disc tally, the objective and its
// timer, toasts, briefings, and the three menu screens. All DOM, all built
// in index.html; this file only drives it.

import { clamp } from './config.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.cashEl = $('hud-cash');
    this.starsEl = $('hud-stars');
    this.discsEl = $('hud-discs');
    this.objectiveEl = $('hud-objective');
    this.timerEl = $('hud-timer');
    this.bustWrap = $('hud-bust');
    this.bustFill = $('hud-bust-fill');
    this.healthFill = $('hud-health-fill');
    this.speedEl = $('hud-speed');
    this.toastsEl = $('toasts');
    this.briefingEl = $('briefing');
    this.briefingTitle = $('briefing-title');
    this.briefingBody = $('briefing-body');
    this.damageEl = $('damage-flash');
    this.briefingFor = 0;
    this.damageFor = 0;
  }

  toast(text, ms = 4200) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    this.toastsEl.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, ms);
    while (this.toastsEl.children.length > 3) this.toastsEl.firstChild.remove();
  }

  showBriefing(title, body) {
    this.briefingTitle.textContent = title;
    this.briefingBody.textContent = body;
    this.briefingEl.classList.add('show');
    this.briefingFor = 7;
  }

  flashDamage() { this.damageFor = 0.35; }

  update(dt, world) {
    const save = world.save;
    this.cashEl.textContent = `$${save.cash}`;
    const stars = world.wanted;
    this.starsEl.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    this.starsEl.style.opacity = stars > 0 ? 1 : 0.25;
    this.discsEl.textContent = `◆ SUN DISCS ${save.discs.length}/12`;
    const obj = world.missions.currentObjective();
    this.objectiveEl.textContent = obj.text;
    const timer = world.missions.currentTimer();
    if (timer !== null && timer !== undefined) {
      const s = Math.max(0, Math.ceil(timer));
      this.timerEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      this.timerEl.style.color = s < 20 ? '#ff7a5e' : '';
    } else this.timerEl.textContent = '';

    const bust = world.bust;
    this.bustWrap.style.opacity = bust > 0.02 ? 1 : 0;
    this.bustFill.style.width = `${clamp(bust * 100, 0, 100)}%`;
    this.healthFill.style.width = `${clamp(world.player.hp, 0, 100)}%`;
    this.healthFill.style.background = world.player.hp < 30 ? '#e84a30' : '#7fc95e';

    if (world.player.driving) {
      const kmh = Math.round(Math.abs(world.player.car.speed) * 3.6);
      this.speedEl.textContent = `${kmh} km/h`;
      this.speedEl.style.opacity = 1;
    } else this.speedEl.style.opacity = 0;

    if (this.briefingFor > 0) {
      this.briefingFor -= dt;
      if (this.briefingFor <= 0) this.briefingEl.classList.remove('show');
    }
    if (this.damageFor > 0) {
      this.damageFor -= dt;
      this.damageEl.style.opacity = clamp(this.damageFor * 1.8, 0, 0.55);
    } else this.damageEl.style.opacity = 0;
  }
}

// The menu screens: title, pause, and the two ways a run ends. World wires
// the buttons; this helper just flips which screen is up.
export function showScreen(id) {
  for (const el of document.querySelectorAll('.screen')) el.classList.remove('show');
  if (id) { const el = $(id); if (el) el.classList.add('show'); }
}

export function fillStats(world) {
  const s = world.save;
  const label = s.stage >= 3 ? 'Story complete'
    : s.stage === 0 && world.missions.phase === 'meet' ? 'First Run — meet Dalia'
    : ['First Light Run', 'Borrowed Light', 'The Long Pier'][s.stage] || 'Free roam';
  $('pause-stats').textContent = `Cash $${s.cash} · Taxi fares ${s.fares} · Sun discs ${s.discs.length}/12 · ${label}`;
}
