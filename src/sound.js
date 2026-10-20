// Synthesized sound, no samples. Audio starts on the first key press or tap.
//
// The vortex: a Shepard tone that rises for ever and never gets any higher
// (the sound of chasing something you never reach), a sub-bass hum, wind
// that rushes harder the faster you fly, a thin hiss high up, and glitter:
// tiny high pings, one for a few of the sparkles going past.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

const PARTIALS = 6;   // octaves in the Shepard tone
const LEVEL = 0.7;

export const Sound = {
  ac: null, out: null, sfx: null, bed: null, noise: null,
  shep: [], phase: 0, wind: null, windF: null,
  muted: store.get('nt2-muted') === '1',

  init() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ac = new AC(); } catch { return; }
    const ac = this.ac;
    this.out = ac.createGain();
    this.out.gain.value = this.muted ? 0 : LEVEL;
    // Glue, so a crash on top of everything doesn't clip.
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 5;
    comp.connect(this.out);
    this.out.connect(ac.destination);
    this.sfx = ac.createGain(); this.sfx.connect(comp);
    this.bed = ac.createGain(); this.bed.gain.value = 0.6; this.bed.connect(comp);

    const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;

    // Shepard tone: sines an octave apart, each a pair a hair out of tune.
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1600;
    const sg = ac.createGain(); sg.gain.value = 0.9;
    lp.connect(sg); sg.connect(this.bed);
    for (let k = 0; k < PARTIALS; k++) {
      const g = ac.createGain(); g.gain.value = 0;
      const pair = [1, 1.004].map(m => {
        const o = ac.createOscillator();
        o.type = 'sine'; o.connect(g); o.start();
        return { o, m };
      });
      g.connect(lp);
      this.shep.push({ g, pair, oct: -1 });
    }

    // Sub hum.
    const sub = ac.createOscillator(); sub.frequency.value = 41.2;
    const subG = ac.createGain(); subG.gain.value = 0.07;
    sub.connect(subG); subG.connect(this.bed); sub.start();

    // Wind, its colour drifting slowly.
    const loop = (type, f, q, gain) => {
      const src = ac.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const bp = ac.createBiquadFilter(); bp.type = type; bp.frequency.value = f; bp.Q.value = q;
      const g = ac.createGain(); g.gain.value = gain;
      src.connect(bp); bp.connect(g); g.connect(this.bed); src.start();
      return { bp, g };
    };
    const wind = loop('bandpass', 300, 0.6, 0.05);
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = ac.createGain(); lfoG.gain.value = 110;
    lfo.connect(lfoG); lfoG.connect(wind.bp.frequency); lfo.start();
    this.wind = wind.g; this.windF = wind.bp;
    // The hiss high up, like the air in the video.
    loop('bandpass', 9000, 2.5, 0.018);
  },

  setMuted(m) {
    this.muted = m;
    store.set('nt2-muted', m ? '1' : '0');
    if (this.out) this.out.gain.setTargetAtTime(m ? 0 : LEVEL, this.ac.currentTime, 0.05);
  },

  suspend(p) { if (this.ac) (p ? this.ac.suspend() : this.ac.resume()); },

  ok() { return this.ac && !this.muted && this.ac.state === 'running'; },

  pan(p, node) {
    if (!p || !this.ac.createStereoPanner) return node;
    const s = this.ac.createStereoPanner(); s.pan.value = Math.max(-1, Math.min(1, p));
    s.connect(node);
    return s;
  },

  burst(dur, freq, gain, type = 'lowpass', q = 0.8, f1 = freq, pan = 0) {
    if (!this.ok()) return;
    const ac = this.ac, t = ac.currentTime;
    const src = ac.createBufferSource(); src.buffer = this.noise;
    const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.04, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.pan(pan, this.sfx));
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.02);
  },

  tone(f0, f1, dur, gain, type = 'sine', pan = 0, at = 0) {
    if (!this.ok()) return;
    const ac = this.ac, t = ac.currentTime + at;
    const o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.pan(pan, this.sfx));
    o.start(t); o.stop(t + dur + 0.02);
  },

  // Every frame: the Shepard tone climbs, the wind follows your speed, and the glitter falls.
  update(dt, speed, lateral) {
    if (!this.ac || this.ac.state !== 'running') return;
    const t = this.ac.currentTime;
    this.phase = (this.phase + dt * (0.01 + speed * 0.004)) % 1;
    for (let k = 0; k < PARTIALS; k++) {
      const p = this.shep[k];
      const oct = (k + this.phase) % PARTIALS;
      const f = 27.5 * Math.pow(2, oct);
      const wrapped = oct < p.oct;
      p.oct = oct;
      for (const { o, m } of p.pair) {
        if (wrapped) o.frequency.setValueAtTime(f * m, t);
        else o.frequency.setTargetAtTime(f * m, t, 0.03);
      }
      p.g.gain.setTargetAtTime(0.045 * Math.exp(-((oct - 3) ** 2) / (2 * 1.1 * 1.1)), t, 0.03);
    }
    this.wind.gain.setTargetAtTime(0.04 + speed * 0.011, t, 0.2);
    this.windF.frequency.setTargetAtTime(220 + speed * 42 + Math.abs(lateral) * 260, t, 0.2);
    this.bed.gain.setTargetAtTime(speed > 2 ? 1 : 0.6, t, 0.8);
    if (Math.random() < dt * (2.5 + speed * 0.6)) {
      this.tone(2400 + Math.random() * 4800, 2400 + Math.random() * 4800, 0.25 + Math.random() * 0.4,
        0.003 + Math.random() * 0.009, 'sine', Math.random() * 2 - 1);
    }
  },

  start() {
    this.burst(1.1, 260, 0.22, 'bandpass', 0.9, 3200);
    this.tone(196, 392, 0.9, 0.035, 'triangle');
  },
  nearMiss(side, k) {
    this.burst(0.5, 3400, 0.2 + 0.3 * k, 'bandpass', 1.4, 380, side * 0.75);
    this.tone(110, 52, 0.4, 0.08 * k, 'sine', side * 0.5);
  },
  crash(kind) {
    this.burst(1.3, 2200, 0.9, 'lowpass', 0.8, 55);
    this.tone(120, 28, 0.9, 0.4);
    if (kind === 'satellite' || kind === 'girder' || kind === 'shard') {
      // Metal: a few out-of-tune partials ringing on.
      for (const [f, g] of [[612, 0.06], [1033, 0.05], [1517, 0.04], [2290, 0.03], [3170, 0.02]]) {
        this.tone(f, f * 0.985, 1.4, g, 'sine');
      }
    }
  },
  chime() {
    this.tone(880, 880, 1.8, 0.025, 'sine', -0.3);
    this.tone(1318.5, 1318.5, 2.2, 0.018, 'sine', 0.3, 0.12);
  },
};

export { store };
