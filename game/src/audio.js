// Every sound in Sunfall City is synthesised with WebAudio — there are no
// audio files at all. A soft island pad drifts underneath everything, and
// the rest are small oscillator and noise recipes: an engine with audible
// gear steps, tire screech, a two-tone siren, horns, gunshots, coins.
// Nothing sounds until start() runs from a user gesture, and every method
// stays harmless when audio is unavailable (headless screenshot runs never
// start it).

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineFilter = null;
    this.engineGain = null;
    this.engineGear = -1;
    this.screechGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLFO = null;
  }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.#pad();
    this.#engine();
    this.#screech();
    this.#siren();
  }

  /** Two detuned triangles behind a slowly sweeping filter: evening chords. */
  #pad() {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0.035;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    filter.connect(gain).connect(this.master);
    const chord = [196, 246.9, 293.7];
    chord.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = i * 4 - 4;
      osc.connect(filter);
      osc.start();
    });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
  }

  /** A single sawtooth through a lowpass — the engine the gears play through. */
  #engine() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
  }

  /**
   * Feed the engine a speed ratio 0..1 while driving, or null to idle it
   * back to silence. The rev range splits into five gears: pitch sweeps up
   * inside a gear, then drops as the next one engages — the arcade step.
   */
  engine(speedRatio) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    if (speedRatio === null) {
      this.engineGain.gain.setTargetAtTime(0, t, 0.1);
      this.engineGear = -1;
      return;
    }
    const GEARS = 5;
    const scaled = Math.min(0.999, Math.max(0, speedRatio)) * GEARS;
    const gear = Math.floor(scaled);
    const sweep = scaled - gear;
    const freq = 52 + gear * 17 + sweep * 34;
    // Gear changes move pitch faster, so the step down lands as a step.
    const glide = gear !== this.engineGear ? 0.03 : 0.06;
    this.engineGear = gear;
    this.engineOsc.frequency.setTargetAtTime(freq, t, glide);
    this.engineFilter.frequency.setTargetAtTime(380 + speedRatio * 950, t, 0.09);
    this.engineGain.gain.setTargetAtTime(0.05 + speedRatio * 0.05, t, 0.08);
  }

  /** Looping filtered noise, kept silent until screech() opens its gain. */
  #screech() {
    const ctx = this.ctx;
    const len = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 950;
    band.Q.value = 2.4;
    this.screechGain = ctx.createGain();
    this.screechGain.gain.value = 0;
    src.connect(band).connect(this.screechGain).connect(this.master);
    src.start();
  }

  /** level 0..1 — how hard the tires protest a handbrake slide. */
  screech(level) {
    if (!this.ctx || !this.screechGain) return;
    this.screechGain.gain.setTargetAtTime(level * 0.06, this.ctx.currentTime, 0.05);
  }

  /** A triangle with an LFO rocking its pitch: the classic two-tone wail. */
  #siren() {
    const ctx = this.ctx;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 800;
    this.sirenLFO = ctx.createOscillator();
    this.sirenLFO.frequency.value = 0.65;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 260;
    this.sirenLFO.connect(lfoGain).connect(this.sirenOsc.frequency);
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain).connect(this.master);
    this.sirenOsc.start();
    this.sirenLFO.start();
  }

  /** level 0..1 — how present the nearest police siren should sound. */
  siren(level) {
    if (!this.ctx || !this.sirenGain) return;
    this.sirenGain.gain.setTargetAtTime(level * 0.055, this.ctx.currentTime, 0.2);
  }

  /** Shared one-shot: glide from freqA to freqB under a quick decay. */
  #blip(freqA, freqB, seconds, type = 'square', volume = 0.12) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(freqA, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqB), t + seconds);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  horn() { this.#blip(370, 340, 0.22, 'square', 0.07); }
  pickup() { this.#blip(660, 990, 0.14, 'sine', 0.14); }
  /** A brighter two-note sparkle, reserved for the sun discs. */
  collect() {
    this.#blip(1040, 1560, 0.12, 'sine', 0.13);
    setTimeout(() => this.#blip(1320, 1980, 0.16, 'sine', 0.11), 60);
  }
  cash() { this.#blip(880, 1320, 0.16, 'sine', 0.13); setTimeout(() => this.#blip(1100, 1560, 0.18, 'sine', 0.1), 70); }
  bump() { this.#blip(120, 55, 0.16, 'triangle', 0.2); }
  door() { this.#blip(210, 140, 0.09, 'triangle', 0.12); }
  fail() { this.#blip(300, 130, 0.4, 'sawtooth', 0.1); }

  /** A gunshot: a burst of filtered noise under a fast-falling envelope. */
  shot() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 0.14);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2600;
    const gain = ctx.createGain();
    gain.gain.value = 0.22;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
  }
}
