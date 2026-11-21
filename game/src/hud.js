// The HUD is plain DOM floating over the canvas: health, cash and the
// sun-disc tally at the top left, wanted stars at the top right, the mission
// objective centred under the top edge, a queue of story banners, an
// interaction prompt, a speedometer, a bust meter that fills while the law
// closes in on foot, and a damage vignette. Every setter remembers the last
// value it wrote, so a readout that has not changed never touches the DOM.

export class Hud {
  constructor() {
    const byId = (id) => document.getElementById(id);
    this.root = byId('hud');
    this.healthBar = byId('health-bar');
    this.cashEl = byId('cash');
    this.packagesEl = byId('packages');
    this.starsEl = byId('stars');
    this.objectiveEl = byId('objective');
    this.objectiveTitle = byId('objective-title');
    this.objectiveText = byId('objective-text');
    this.objectiveDist = byId('objective-dist');
    this.bannerEl = byId('banner');
    this.promptEl = byId('prompt');
    this.speedEl = byId('speed');
    this.bustWrap = byId('bust-wrap');
    this.bustBar = byId('bust-bar');
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
    this.lastPackages = -1;
    this.lastBust = -1;
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

  /** The tally under the cash line: discs found out of the city's total. */
  setPackages(found, total) {
    if (found === this.lastPackages) return;
    this.lastPackages = found;
    this.packagesEl.textContent = `◆ SUN DISCS ${found}/${total}`;
    this.packagesEl.style.color = found >= total ? '#ffd23e' : 'rgba(255,233,200,.8)';
  }

  setWanted(n) {
    if (n === this.lastStars) return;
    this.lastStars = n;
    this.starsEl.textContent = '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
    this.starsEl.style.opacity = n === 0 ? '0.25' : '1';
  }

  /** The bust meter stays hidden until it starts to fill (frac > 0). */
  setBust(frac) {
    const shown = frac > 0.01;
    const rounded = Math.round(frac * 40);
    if (rounded === this.lastBust) return;
    this.lastBust = rounded;
    this.bustWrap.style.display = shown ? 'block' : 'none';
    if (shown) this.bustBar.style.width = `${Math.min(100, frac * 100)}%`;
  }

  setObjective(title, text, dist) {
    this.objectiveEl.style.display = 'block';
    this.objectiveTitle.textContent = title;
    this.objectiveText.textContent = text;
    const hasDist = dist !== null && dist !== undefined;
    this.objectiveDist.textContent = hasDist ? `${Math.round(dist)} m` : '';
  }

  clearObjective() { this.objectiveEl.style.display = 'none'; }

  /** Queue a story banner; update() plays the queue one banner at a time. */
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

  /** Tick the banner queue, the toast fade and the damage vignette. */
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
