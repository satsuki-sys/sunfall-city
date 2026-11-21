// The HUD is plain DOM over the canvas: health and cash top-left, wanted stars
// top-right, the mission objective under the top centre, a banner for story
// messages, an interaction prompt, a speedometer, and a damage vignette.

export class Hud {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.root = $('hud');
    this.healthBar = $('health-bar');
    this.cashEl = $('cash');
    this.starsEl = $('stars');
    this.objectiveEl = $('objective');
    this.objectiveTitle = $('objective-title');
    this.objectiveText = $('objective-text');
    this.objectiveDist = $('objective-dist');
    this.bannerEl = $('banner');
    this.promptEl = $('prompt');
    this.speedEl = $('speed');
    this.crosshairEl = $('crosshair');
    this.vignetteEl = $('vignette');
    this.toastEl = $('toast');
    this.toastTitle = $('toast-title');
    this.toastSub = $('toast-sub');
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
    this.healthBar.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
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
    this.objectiveDist.textContent = dist === null || dist === undefined ? '' : `${Math.round(dist)} m`;
  }

  clearObjective() { this.objectiveEl.style.display = 'none'; }

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
