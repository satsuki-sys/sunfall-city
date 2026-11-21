// The HUD is plain DOM layered over the canvas: health and cash at the top
// left, wanted stars at the top right, the mission objective under the top
// centre, a banner for story messages, an interaction prompt, a speedometer
// and a damage vignette. Setters cache their last value so unchanged readouts
// never touch the DOM twice.

export class Hud {
  constructor() {
    const byId = (id) => document.getElementById(id);
    this.root = byId('hud');
    this.healthBar = byId('health-bar');
    this.cashEl = byId('cash');
    this.starsEl = byId('stars');
    this.objectiveEl = byId('objective');
    this.objectiveTitle = byId('objective-title');
    this.objectiveText = byId('objective-text');
    this.objectiveDist = byId('objective-dist');
    this.bannerEl = byId('banner');
    this.promptEl = byId('prompt');
    this.speedEl = byId('speed');
    this.crosshairEl = byId('crosshair');
    this.vignetteEl = byId('vignette');
    this.toastEl = byId('toast');
    this.toastTitle = byId('toast-title');
    this.toastSub = byId('toast-sub');
    this.bannerQueue = [];
    this.bannerTimer = 0;
    this.toastTimer = 0;
    this.vignette = 0;
    this.lastStars = -1;
    this.lastCash = null;
  }

  show() { this.root.style.display = 'block'; }
  hide() { this.root.style.display = 'none'; }

  setHealth(frac) {
    const clamped = Math.max(0, Math.min(1, frac));
    this.healthBar.style.width = `${clamped * 100}%`;
    this.healthBar.style.background = frac < 0.3 ? '#e5534b' : frac < 0.6 ? '#f2c14e' : '#7bc96f';
  }

  setCash(n) {
    if (n === this.lastCash) return;
    this.lastCash = n;
    this.cashEl.textContent = `$${Math.floor(n).toLocaleString('en-US')}`;
  }

  setWanted(n) {
    if (n === this.lastStars) return;
    this.lastStars = n;
    this.starsEl.textContent = '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
    this.starsEl.style.opacity = n === 0 ? '0.25' : '1';
  }

  setObjective(title, text, dist) {
    this.objectiveEl.style.display = 'block';
    this.objectiveTitle.textContent = title;
    this.objectiveText.textContent = text;
    const hasDist = dist !== null && dist !== undefined;
    this.objectiveDist.textContent = hasDist ? `${Math.round(dist)} m` : '';
  }

  clearObjective() { this.objectiveEl.style.display = 'none'; }

  /** Queue a story banner; queued banners play one after another in update(). */
  message(text, color = '#ffe9c9') {
    this.bannerQueue.push({ text, color });
  }

  toast(title, sub = '') {
    this.toastTitle.textContent = title;
    this.toastSub.textContent = sub;
    this.toastEl.style.opacity = '1';
    this.toastTimer = 3.2;
  }

  setPrompt(text) {
    if (text) {
      this.promptEl.textContent = text;
      this.promptEl.style.display = 'block';
    } else this.promptEl.style.display = 'none';
  }

  setSpeed(kmh) {
    if (kmh === null) { this.speedEl.style.display = 'none'; return; }
    this.speedEl.style.display = 'block';
    this.speedEl.textContent = `${Math.round(Math.abs(kmh))} km/h`;
  }

  setCrosshair(on) { this.crosshairEl.style.display = on ? 'block' : 'none'; }

  damageFlash() { this.vignette = 0.75; }

  /** Advance the banner queue, the toast fade and the damage vignette. */
  update(dt) {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.bannerEl.style.opacity = '0';
    } else if (this.bannerQueue.length > 0) {
      const next = this.bannerQueue.shift();
      this.bannerEl.textContent = next.text;
      this.bannerEl.style.color = next.color;
      this.bannerEl.style.opacity = '1';
      this.bannerTimer = 2.8;
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.style.opacity = '0';
    }
    if (this.vignette > 0) {
      this.vignette = Math.max(0, this.vignette - dt * 1.4);
      this.vignetteEl.style.opacity = String(this.vignette);
    }
  }
}
