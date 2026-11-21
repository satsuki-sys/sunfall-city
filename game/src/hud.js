// hud.js — everything the player reads: the health bar, cash and sun disc
// tally at the top left, the wanted stars and the bust meter at the top
// right, the objective banner across the top centre, toasts, the speed
// readout, the context prompt along the bottom, and the three full screens
// (title, pause, downed/busted). The DOM itself lives in index.html; this
// class finds the elements, wires the buttons, and keeps the text current,
// touching the DOM only when a value actually changes.

function el(id) {
  return document.getElementById(id);
}

export class Hud {
  constructor() {
    this.healthFill = el('health-fill');
    this.cashEl = el('cash');
    this.discsEl = el('discs');
    this.starsOn = el('stars-on');
    this.starsOff = el('stars-off');
    this.bustWrap = el('bust');
    this.bustFill = el('bust-fill');
    this.objTitle = el('obj-title');
    this.objText = el('obj-text');
    this.objDist = el('obj-dist');
    this.toastEl = el('toast');
    this.speedEl = el('speed');
    this.hintEl = el('hint');
    this.promptEl = el('prompt');
    this.crosshair = el('crosshair');
    this.titleScreen = el('title-screen');
    this.pauseScreen = el('pause-screen');
    this.endScreen = el('end-screen');
    this.endTitle = el('end-title');
    this.endText = el('end-text');
    this.pauseStats = el('pause-stats');
    this.continueBtn = el('btn-continue');

    this.cache = {};
    this.toastTimer = null;

    // Button callbacks are assigned by main.js / the world.
    this.onNewGame = null;
    this.onContinue = null;
    this.onResume = null;
    this.onRespawn = null;
    el('btn-new').addEventListener('click', () => this.onNewGame?.());
    this.continueBtn.addEventListener('click', () => this.onContinue?.());
    el('btn-resume').addEventListener('click', () => this.onResume?.());
    el('btn-respawn').addEventListener('click', () => this.onRespawn?.());
  }

  setText(key, node, value) {
    if (this.cache[key] !== value) {
      this.cache[key] = value;
      node.textContent = value;
    }
  }

  setObjective(title, text) {
    this.setText('objTitle', this.objTitle, title || '');
    this.setText('objText', this.objText, text || '');
    if (!title && !text) this.setText('objDist', this.objDist, '');
  }

  setObjectiveDistance(metres) {
    this.setText('objDist', this.objDist, metres == null ? '' : `${Math.round(metres)} m`);
  }

  // A line of flavour text across the middle of the screen ("Sun disc
  // found — 1/12 · +$25"), gone again in a few seconds.
  toast(text, ms = 2600) {
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = '1';
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toastEl.style.opacity = '0'; }, ms);
  }

  // Called every frame with a plain snapshot of the game's state.
  update(s) {
    this.healthFill.style.width = `${Math.max(0, Math.min(100, s.health))}%`;
    this.healthFill.style.background = s.health < 30 ? '#e0483c' : '#7ed957';
    this.setText('cash', this.cashEl, `$${s.cash}`);
    this.setText('discs', this.discsEl, `◆ SUN DISCS ${s.discs}/12`);
    this.setText('starsOn', this.starsOn, '★'.repeat(s.stars));
    this.setText('starsOff', this.starsOff, '☆'.repeat(5 - s.stars));
    const bustVisible = s.bust > 0.02;
    if (this.cache.bustVisible !== bustVisible) {
      this.cache.bustVisible = bustVisible;
      this.bustWrap.style.opacity = bustVisible ? '1' : '0';
    }
    this.bustFill.style.width = `${Math.round(s.bust * 100)}%`;
    if (s.speedKmh == null) {
      if (this.cache.speed !== '') { this.cache.speed = ''; this.speedEl.textContent = ''; }
    } else {
      this.setText('speed', this.speedEl, `${Math.round(s.speedKmh)} km/h`);
    }
    this.setText('hint', this.hintEl, s.driving
      ? 'W/S drive · A/D steer · Space handbrake · F get out · H horn · P pause'
      : 'WASD move · mouse look · Shift sprint · F car · click shoot · P pause');
    this.setText('prompt', this.promptEl, s.prompt || '');
    const cross = s.playing && !s.driving;
    if (this.cache.cross !== cross) {
      this.cache.cross = cross;
      this.crosshair.style.opacity = cross ? '0.9' : '0';
    }
  }

  showTitle(hasSave) {
    this.titleScreen.style.display = 'flex';
    this.pauseScreen.style.display = 'none';
    this.endScreen.style.display = 'none';
    this.continueBtn.style.display = hasSave ? 'inline-block' : 'none';
  }

  showPause(statsLine) {
    this.pauseStats.textContent = statsLine;
    this.pauseScreen.style.display = 'flex';
  }

  hidePause() {
    this.pauseScreen.style.display = 'none';
  }

  showEnd(kind, text) {
    this.endTitle.textContent = kind === 'busted' ? 'BUSTED' : 'DOWNED';
    this.endText.textContent = text;
    this.endScreen.style.display = 'flex';
  }

  hideScreens() {
    this.titleScreen.style.display = 'none';
    this.pauseScreen.style.display = 'none';
    this.endScreen.style.display = 'none';
  }
}
