// audio.js — every sound in Sunfall City is synthesized live in WebAudio;
// there is not one audio file in the game. An engine that climbs five gears
// through a low-pass filter, a handbrake screech, two-tone sirens that swell
// as cruisers close in, horns, gunshots and the two-note chime of a found
// Sun Disc. The context is created lazily on the first user gesture, and
// every method is safe to call before that: silence is a valid sound.

import { clamp } from './config.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineNodes = null;
    this.screechNodes = null;
    this.sirenNodes = null;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  // --- one-shots -----------------------------------------------------------

  blip(freq, dur, type = 'sine', gain = 0.2, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  noise(dur, gain = 0.3, freq = 1200, q = 0.8, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const len = Math.max(1, (dur * this.ctx.sampleRate) | 0);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = freq; filter.Q.value = q;
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(t);
  }

  horn() { this.blip(370, 0.28, 'square', 0.12); this.blip(466, 0.28, 'square', 0.1); }
  shot() { this.noise(0.14, 0.5, 900, 0.4); this.blip(120, 0.1, 'triangle', 0.3); }
  distantShot() { this.noise(0.18, 0.18, 500, 0.5); }
  jingle() { this.blip(1318, 0.16, 'sine', 0.22); this.blip(1760, 0.3, 'sine', 0.22, 0.09); }
  cash() { this.blip(988, 0.1, 'sine', 0.18); this.blip(1318, 0.18, 'sine', 0.18, 0.07); }
  bump() { this.noise(0.1, 0.25, 240, 0.6); }
  door() { this.blip(180, 0.08, 'triangle', 0.15); }
  fail() { this.blip(220, 0.25, 'sawtooth', 0.12); this.blip(185, 0.35, 'sawtooth', 0.12, 0.12); }

  // --- loops ---------------------------------------------------------------
  // The engine: a sawtooth whose pitch follows RPM through five gears, fed
  // through a low-pass filter that opens as the revs climb.

  setEngine(on, rpm01 = 0) {
    if (!this.ctx) return;
    if (on && !this.engineNodes) {
      const osc = this.ctx.createOscillator(); osc.type = 'sawtooth';
      const sub = this.ctx.createOscillator(); sub.type = 'square';
      const filter = this.ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = 2;
      const g = this.ctx.createGain(); g.gain.value = 0;
      osc.connect(filter); sub.connect(filter); filter.connect(g); g.connect(this.master);
      osc.start(); sub.start();
      this.engineNodes = { osc, sub, filter, g };
    }
    if (!this.engineNodes) return;
    const { osc, sub, filter, g } = this.engineNodes;
    const t = this.ctx.currentTime;
    if (!on) { g.gain.setTargetAtTime(0, t, 0.1); return; }
    const gear = Math.min(4, Math.floor(rpm01 * 5));
    const inGear = rpm01 * 5 - gear;
    const freq = 55 + gear * 14 + inGear * 46;
    osc.frequency.setTargetAtTime(freq, t, 0.03);
    sub.frequency.setTargetAtTime(freq / 2, t, 0.03);
    filter.frequency.setTargetAtTime(300 + rpm01 * 1600, t, 0.05);
    g.gain.setTargetAtTime(0.05 + rpm01 * 0.05, t, 0.05);
  }

  setScreech(on) {
    if (!this.ctx) return;
    if (on && !this.screechNodes) {
      const len = this.ctx.sampleRate | 0;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass'; filter.frequency.value = 900; filter.Q.value = 6;
      const g = this.ctx.createGain(); g.gain.value = 0;
      src.connect(filter); filter.connect(g); g.connect(this.master);
      src.start();
      this.screechNodes = { src, g };
    }
    if (this.screechNodes) {
      this.screechNodes.g.gain.setTargetAtTime(on ? 0.06 : 0, this.ctx.currentTime, 0.05);
    }
  }

  // A two-tone siren whose volume follows the nearest cruiser's distance.
  setSiren(nearestDist) {
    if (!this.ctx) return;
    const audible = nearestDist !== null && nearestDist < 90;
    if (audible && !this.sirenNodes) {
      const osc = this.ctx.createOscillator(); osc.type = 'triangle';
      const g = this.ctx.createGain(); g.gain.value = 0;
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.7;
      const lfoGain = this.ctx.createGain(); lfoGain.gain.value = 140;
      lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
      osc.frequency.value = 830;
      osc.connect(g); g.connect(this.master);
      osc.start(); lfo.start();
      this.sirenNodes = { osc, g, lfo };
    }
    if (this.sirenNodes) {
      const vol = audible ? clamp(0.11 * (1 - nearestDist / 90), 0, 0.11) : 0;
      this.sirenNodes.g.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.15);
    }
  }
}
