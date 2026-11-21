// Every sound in Sunfall City is synthesized in WebAudio — there is not one
// audio file in the repo. The engine is two detuned oscillators through a
// lowpass whose pitch climbs five gear bands as the car speeds up; the rest
// are one-shot voices (horn, shot, jingle, siren wash) built from noise and
// simple oscillators. Nothing here runs until the first user gesture.

import { clamp, lerp } from './config.js';

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engine = null;   // { oscA, oscB, filter, gain }
    this.screech = null;  // { src, gain, filter }
    this.siren = null;    // { osc, lfo, gain }
    this.noiseBuf = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      // One shared noise buffer for shots, screech and crashes.
      const len = this.ctx.sampleRate * 1.2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  // --- the engine: call every frame while driving ---------------------------
  setEngine(on, speedRatio, handbrake) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (on && !this.engine) {
      const oscA = this.ctx.createOscillator();
      oscA.type = 'sawtooth';
      const oscB = this.ctx.createOscillator();
      oscB.type = 'square';
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 2.5;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      const subGain = this.ctx.createGain();
      subGain.gain.value = 0.4;
      oscA.connect(filter);
      oscB.connect(subGain);
      subGain.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      oscA.start();
      oscB.start();
      this.engine = { oscA, oscB, filter, gain };
      // Screech loop rides alongside, silent until the handbrake bites.
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 6;
      const sg = this.ctx.createGain();
      sg.gain.value = 0;
      src.connect(bp);
      bp.connect(sg);
      sg.connect(this.master);
      src.start();
      this.screech = { src, gain: sg };
    }
    if (!on && this.engine) {
      const e = this.engine;
      e.gain.gain.setTargetAtTime(0, t, 0.06);
      e.oscA.stop(t + 0.25);
      e.oscB.stop(t + 0.25);
      this.engine = null;
      if (this.screech) {
        this.screech.gain.gain.setTargetAtTime(0, t, 0.05);
        this.screech.src.stop(t + 0.2);
        this.screech = null;
      }
      return;
    }
    if (this.engine) {
      // Five gears: the ratio folds into a band, pitch sweeps inside it, and
      // the filter opens as the revs climb — the sweep IS the gear change.
      const band = 1 / 5;
      const gear = Math.min(4, Math.floor(speedRatio / band));
      const inGear = (speedRatio - gear * band) / band;
      const rpm = 0.25 + inGear * 0.75;
      const freq = 55 + rpm * 165 + gear * 6;
      const e = this.engine;
      e.oscA.frequency.setTargetAtTime(freq, t, 0.05);
      e.oscB.frequency.setTargetAtTime(freq * 0.5 + 1.5, t, 0.05);
      e.filter.frequency.setTargetAtTime(300 + rpm * 2400 + speedRatio * 900, t, 0.08);
      e.gain.gain.setTargetAtTime(0.05 + speedRatio * 0.075, t, 0.09);
      if (this.screech) {
        const bite = handbrake && speedRatio > 0.18 ? 0.05 : 0;
        this.screech.gain.gain.setTargetAtTime(bite, t, 0.04);
      }
    }
  }

  // --- the siren wash: gain follows the nearest cruiser ---------------------
  setSiren(level) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (level > 0.01 && !this.siren) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 820;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.55;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 130;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(this.master);
      osc.start();
      lfo.start();
      this.siren = { osc, lfo, gain };
    }
    if (this.siren) {
      this.siren.gain.gain.setTargetAtTime(clamp(level, 0, 1) * 0.045, t, 0.15);
      if (level <= 0.01) {
        const s = this.siren;
        s.osc.stop(t + 0.4);
        s.lfo.stop(t + 0.4);
        this.siren = null;
      }
    }
  }

  // --- one-shots --------------------------------------------------------------
  blip(freqA, freqB, dur, type, vol, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqA, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqB), t + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noiseBurst(dur, filterFreq, vol, type = 'lowpass') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  horn(dur = 0.35) {
    this.blip(392, 385, dur, 'square', 0.05);
    this.blip(494, 486, dur, 'square', 0.035, 0.01);
  }
  shoot() {
    this.noiseBurst(0.16, 2600, 0.5, 'highpass');
    this.blip(160, 45, 0.14, 'triangle', 0.4);
  }
  dryFire() {
    this.blip(1200, 900, 0.05, 'square', 0.08);
  }
  crash(strength) {
    this.noiseBurst(0.3, 500, clamp(strength, 0.05, 0.5));
    this.blip(90, 40, 0.25, 'sine', clamp(strength, 0.05, 0.4));
  }
  pickup() {
    this.blip(1318, 1318, 0.1, 'sine', 0.16);
    this.blip(1760, 1760, 0.16, 'sine', 0.16, 0.09);
  }
  jingle() {
    // The story beat chime: three notes up, one held.
    this.blip(659, 659, 0.14, 'triangle', 0.18);
    this.blip(880, 880, 0.14, 'triangle', 0.18, 0.12);
    this.blip(1174, 1174, 0.3, 'triangle', 0.2, 0.24);
  }
  cash() {
    this.blip(988, 988, 0.08, 'square', 0.1);
    this.blip(1318, 1318, 0.18, 'square', 0.1, 0.07);
  }
  busted() {
    this.blip(392, 392, 0.22, 'triangle', 0.2);
    this.blip(311, 311, 0.22, 'triangle', 0.2, 0.2);
    this.blip(262, 240, 0.45, 'triangle', 0.22, 0.4);
  }
  hurt() {
    this.blip(220, 110, 0.15, 'sawtooth', 0.15);
  }
}
