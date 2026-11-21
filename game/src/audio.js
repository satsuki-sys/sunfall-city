// audio.js — every sound in Sunfall City is synthesized live with WebAudio;
// there are no audio files. A SoundEngine owns one AudioContext and offers
// small one-shot voices (pickup jingle, gunshot, bump, horn, click) plus two
// continuous voices the world drives every frame: the car engine, whose
// oscillator climbs a five-step gearbox as speed rises and whose lowpass
// filter opens under load, and a tire screech that fades in while the
// handbrake is held through a slide. A distant siren voice swells with the
// nearest police car.

export class SoundEngine {
  constructor() {
    this.ctx = null;      // created lazily on the first user gesture
    this.master = null;
    this.engineNodes = null;
    this.screechNodes = null;
    this.sirenNodes = null;
    this.gear = 0;
  }

  // Browsers refuse to start an AudioContext before a gesture; the title
  // screen buttons call this. Safe to call repeatedly.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  get ready() {
    return !!this.ctx;
  }

  // A short burst of filtered noise or a tone blip; the building block for
  // the one-shot voices below.
  blip({ type = 'square', from = 440, to = from, dur = 0.12, gain = 0.2, noise = false }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.ctx.createGain();
    out.gain.setValueAtTime(gain, t);
    out.gain.exponentialRampToValueAtTime(0.001, t + dur);
    out.connect(this.master);
    if (noise) {
      const len = Math.max(1, (dur * this.ctx.sampleRate) | 0);
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = from;
      src.connect(filter).connect(out);
      src.start(t);
    } else {
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
      osc.connect(out);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
  }

  pickup() { // two bright notes, the sun disc jingle
    this.blip({ type: 'sine', from: 880, dur: 0.1, gain: 0.22 });
    setTimeout(() => this.blip({ type: 'sine', from: 1318, dur: 0.16, gain: 0.22 }), 70);
  }

  cash() { // a till-like double ding when money lands
    this.blip({ type: 'triangle', from: 1568, dur: 0.09, gain: 0.18 });
    setTimeout(() => this.blip({ type: 'triangle', from: 2093, dur: 0.14, gain: 0.18 }), 60);
  }

  shot() {
    this.blip({ noise: true, from: 1800, dur: 0.09, gain: 0.3 });
    this.blip({ type: 'sawtooth', from: 220, to: 60, dur: 0.08, gain: 0.15 });
  }

  bump(strength = 1) {
    this.blip({ noise: true, from: 300, dur: 0.14, gain: 0.16 * strength });
    this.blip({ type: 'sine', from: 90, to: 45, dur: 0.16, gain: 0.22 * strength });
  }

  horn() {
    this.blip({ type: 'square', from: 370, dur: 0.28, gain: 0.12 });
    this.blip({ type: 'square', from: 466, dur: 0.28, gain: 0.1 });
  }

  click() {
    this.blip({ type: 'sine', from: 660, dur: 0.05, gain: 0.12 });
  }

  toast() {
    this.blip({ type: 'sine', from: 1046, dur: 0.08, gain: 0.1 });
  }

  // --- continuous voices -------------------------------------------------

  startEngine() {
    if (!this.ctx || this.engineNodes) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const sub = this.ctx.createOscillator();
    sub.type = 'square';
    sub.frequency.value = 28;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    filter.Q.value = 2;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.0;
    osc.connect(filter); sub.connect(filter);
    filter.connect(gain).connect(this.master);
    osc.start(); sub.start();
    this.engineNodes = { osc, sub, filter, gain };
  }

  // speed01 is 0..1 of the car's top speed; load is throttle pressure.
  // The five gears divide the range; each gear's rpm sweeps its own band,
  // so the note drops at every shift, like a real gearbox.
  setEngine(speed01, load) {
    if (!this.engineNodes) return;
    const { osc, sub, filter, gain } = this.engineNodes;
    const t = this.ctx.currentTime;
    const gearEdges = [0, 0.18, 0.36, 0.55, 0.76, 1.01];
    let gear = 0;
    while (gear < 4 && speed01 > gearEdges[gear + 1]) gear++;
    this.gear = gear;
    const inGear = (speed01 - gearEdges[gear]) / (gearEdges[gear + 1] - gearEdges[gear]);
    const rpm = 0.25 + inGear * 0.75;               // 0.25..1 within the gear
    const freq = 50 + rpm * 130;                    // 82..180 Hz fundamental
    osc.frequency.setTargetAtTime(freq, t, 0.05);
    sub.frequency.setTargetAtTime(freq / 2, t, 0.05);
    filter.frequency.setTargetAtTime(280 + load * 900 + rpm * 500, t, 0.08);
    gain.gain.setTargetAtTime(0.05 + load * 0.05 + rpm * 0.02, t, 0.09);
  }

  stopEngine() {
    if (!this.engineNodes) return;
    const { osc, sub, gain } = this.engineNodes;
    gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    const nodes = this.engineNodes;
    setTimeout(() => { try { nodes.osc.stop(); nodes.sub.stop(); } catch { /* already stopped */ } }, 200);
    this.engineNodes = null;
  }

  setScreech(amount) {
    if (!this.ctx) return;
    if (!this.screechNodes) {
      const len = this.ctx.sampleRate | 0;
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buffer; src.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass'; filter.frequency.value = 950; filter.Q.value = 6;
      const gain = this.ctx.createGain(); gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.master);
      src.start();
      this.screechNodes = { src, gain };
    }
    this.screechNodes.gain.gain.setTargetAtTime(
      Math.min(0.14, amount * 0.14), this.ctx.currentTime, 0.06);
  }

  // A two-tone siren whose volume follows the nearest police car (0..1).
  setSiren(level) {
    if (!this.ctx) return;
    if (!this.sirenNodes) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle'; osc.frequency.value = 700;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.7;
      const lfoGain = this.ctx.createGain(); lfoGain.gain.value = 160;
      lfo.connect(lfoGain).connect(osc.frequency);
      const gain = this.ctx.createGain(); gain.gain.value = 0;
      osc.connect(gain).connect(this.master);
      osc.start(); lfo.start();
      this.sirenNodes = { osc, lfo, gain };
    }
    this.sirenNodes.gain.gain.setTargetAtTime(
      Math.min(0.06, level * 0.06), this.ctx.currentTime, 0.15);
  }
}
