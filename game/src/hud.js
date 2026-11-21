// The HUD: DOM elements declared in index.html, driven from here. Cash,
// discs, stars, the bust meter, the objective line, toasts and briefing
// cards — everything the player reads while the city moves underneath.

export class Hud {
  constructor() {
    const el = (id) => document.getElementById(id);
    this.cashEl = el('cash-val');
    this.discEl = el('disc-val');
    this.starsEl = el('stars');
    this.bustWrap = el('bust-wrap');
    this.bustFill = el('bust-fill');
    this.objTitle = el('objective-title');
    this.objSub = el('objective-sub');
    this.objTimer = el('objective-timer');
    this.toastZone = el('toast-zone');
    this.briefCard = el('brief-card');
    this.briefTitle = el('brief-title');
    this.briefText = el('brief-text');
    this.speedWrap = el('speed-wrap');
    this.speedVal = el('speed-val');
    this.healthFill = el('health-fill');
    this.crosshair = el('crosshair');
    this.vignette = el('damage-vignette');
    this.briefT = null;
    this.lastObj = '';
  }

  setCash(n) {
    this.cashEl.textContent = `$${n.toLocaleString('en-US')}`;
  }
  setDiscs(n) {
    this.discEl.textContent = `◆ SUN DISCS ${n}/12`;
  }
  setStars(n) {
    this.starsEl.textContent = n > 0 ? '★'.repeat(n) + '☆'.repeat(5 - n) : '';
    this.starsEl.style.opacity = n > 0 ? '1' : '0';
  }
  setBust(v) {
    if (v === null || v <= 0.01) {
      this.bustWrap.style.opacity = '0';
      return;
    }
    this.bustWrap.style.opacity = '1';
    this.bustFill.style.width = `${Math.round(v * 100)}%`;
  }
  setObjective(title, sub) {
    const key = `${title}|${sub}`;
    if (key === this.lastObj) return;
    this.lastObj = key;
    this.objTitle.textContent = title;
    this.objSub.textContent = sub ?? '';
  }
  setTimer(sec) {
    if (sec === null || sec === undefined) {
      this.objTimer.style.display = 'none';
      return;
    }
    this.objTimer.style.display = 'block';
    const s = Math.max(0, Math.ceil(sec));
    const mm = Math.floor(s / 60), ss = String(s % 60).padStart(2, '0');
    this.objTimer.textContent = `${mm}:${ss}`;
    this.objTimer.style.color = sec < 20 ? '#ff7a5c' : '#ffd34d';
  }
  setSpeed(kmh) {
    if (kmh === null) {
      this.speedWrap.style.opacity = '0';
      return;
    }
    this.speedWrap.style.opacity = '1';
    this.speedVal.textContent = `${Math.round(kmh)}`;
  }
  setHealth(frac) {
    this.healthFill.style.width = `${Math.round(Math.max(0, frac) * 100)}%`;
    this.healthFill.style.background = frac < 0.3 ? '#e2483d' : '#7dd069';
  }
  showCrosshair(on) {
    this.crosshair.style.opacity = on ? '1' : '0';
  }
  flashDamage() {
    this.vignette.style.opacity = '0.55';
    setTimeout(() => {
      this.vignette.style.opacity = '0';
    }, 130);
  }
  toast(msg, ms = 3600) {
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = msg;
    this.toastZone.appendChild(div);
    requestAnimationFrame(() => div.classList.add('show'));
    setTimeout(() => {
      div.classList.remove('show');
      setTimeout(() => div.remove(), 400);
    }, ms);
    while (this.toastZone.children.length > 3) this.toastZone.firstChild.remove();
  }
  brief(title, text) {
    this.briefTitle.textContent = title;
    this.briefText.textContent = text;
    this.briefCard.classList.add('show');
    clearTimeout(this.briefT);
    this.briefT = setTimeout(() => this.briefCard.classList.remove('show'), 8200);
  }
  hideBrief() {
    this.briefCard.classList.remove('show');
  }
}
