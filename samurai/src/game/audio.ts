/**
 * The soundtrack: a synthesized feudal battlefield in WebAudio, so the game
 * ships zero audio files. Its own kit, shared with none of our other slots:
 *
 *   - the koto: a plucked silk zither, built subtractively, a bright saw
 *     with a soft octave through a resonant lowpass that snaps shut, the
 *     scrape of the plectrum on the string, and the koto player's press:
 *     the string pushed behind the bridge after the pluck, bending the note
 *     up into the next step of the scale.
 *   - taiko: the big barrel drum, a sine skin whose pitch drops as it
 *     booms, a felt thump of low noise and the crack of the stick.
 *   - hyoshigi: the two hardwood clappers of the theatre, a click of noise
 *     ringing through two narrow wooden resonances, for the reel stops and
 *     the buttons.
 *   - the blade: a sword leaving its scabbard, steel noise sweeping up and
 *     four inharmonic partials ringing on with a slow shimmer, for the
 *     samurai taking his reel.
 *   - the gong: a bronze temple gong of nine inharmonic modes, the higher
 *     ones blooming later and dying sooner, the whole pitch sinking a hair
 *     as it rings, struck with a soft mallet.
 *   - the horagai: the conch war horn, a nasal PeriodicWave voice that
 *     scoops up into its note through a breathy formant.
 *   - the space: a mountain valley echo, three fixed taps and no feedback,
 *     each one further, darker and from another side, the hills answering.
 *     Every other set of ours used a delay, an echo, a slapback, a stone
 *     hall or a ping-pong echo.
 *
 * Reel stops travel left to right across the stereo field. The tunes use
 * the in scale on D (D, E flat, G, A, B flat), the hirajoshi tuning of the
 * koto, and the big moments land on the open fifth of D and A over the
 * drums. The fruit slots used C and A major pentatonic, the papyrus temple
 * D minor, the barn G major, the reef E Lydian, the voyage D Phrygian
 * dominant, the house of the sun E double harmonic major, the fairy tale A
 * flat major.
 *
 * Muting is remembered across visits. The AudioContext is only ever created
 * inside a user gesture (every cue is triggered by a click or key), so the
 * browser autoplay rules never block it.
 */

const STORE_KEY = 'samurai-sound';

// The in scale on D, in Hz ("b" for flat).
const NOTES = {
  d1: 36.71,
  d2: 73.42,
  a2: 110.0,
  d3: 146.83,
  eb3: 155.56,
  g3: 196.0,
  a3: 220.0,
  bb3: 233.08,
  d4: 293.66,
  eb4: 311.13,
  g4: 392.0,
  a4: 440.0,
  bb4: 466.16,
  d5: 587.33,
  eb5: 622.25,
  g5: 783.99,
  a5: 880.0,
  bb5: 932.33,
  d6: 1174.66,
  eb6: 1244.51,
  g6: 1567.98,
};

/** The scale from D3 up to G6, the koto's strings. */
const SCALE = [
  NOTES.d3, NOTES.eb3, NOTES.g3, NOTES.a3, NOTES.bb3, NOTES.d4, NOTES.eb4, NOTES.g4, NOTES.a4,
  NOTES.bb4, NOTES.d5, NOTES.eb5, NOTES.g5, NOTES.a5, NOTES.bb5, NOTES.d6, NOTES.eb6, NOTES.g6,
];

/** The count-up runs the top of the scale. */
const COUNT_RUN = [NOTES.d5, NOTES.eb5, NOTES.g5, NOTES.a5, NOTES.bb5, NOTES.d6, NOTES.eb6, NOTES.g6];

/** The low string of each reel as it lands, climbing the scale left to right. */
const REEL_NOTES = [NOTES.d3, NOTES.g3, NOTES.a3, NOTES.bb3, NOTES.d4];

/**
 * One koto figure per bet line: three strings from a step of the scale,
 * rising for lines 1-10 and falling for 11-20, the last note pressed up into
 * the next step.
 */
const LINE_PHRASES: number[][] = Array.from({ length: 20 }, (_, li) => {
  const i = 5 + (li % 10);
  return li < 10 ? [i, i + 1, i + 2] : [i + 2, i + 1, i];
});

/** The gong's modes: frequency ratios of a bronze temple gong, and how loud each starts. */
const GONG_MODES = [1, 1.47, 1.93, 2.31, 2.76, 3.19, 3.58, 4.11, 4.86];
const GONG_AMPS = [1, 0.7, 0.55, 0.42, 0.33, 0.26, 0.2, 0.15, 0.11];

/** The ring of a drawn blade: inharmonic partials, their levels and lives (s). */
const BLADE_PARTIALS = [2973, 4411, 5809, 7322];
const BLADE_AMPS = [1, 0.6, 0.45, 0.3];
const BLADE_LIVES = [1.1, 0.8, 0.6, 0.45];

/** The conch's harmonics: a strong fundamental and a nasal cluster above it. */
const CONCH_HARMONICS = [0, 1, 0.72, 0.55, 0.62, 0.38, 0.33, 0.2, 0.16, 0.1, 0.07];

/** Stereo position of reel 0-4, left to right. */
const reelPan = (reel: number): number => -0.6 + reel * 0.3;

function storedMute(): boolean {
  try {
    return localStorage.getItem(STORE_KEY) === 'off';
  } catch {
    return false;
  }
}

class SoundBank {
  private ctx: AudioContext | null = null;
  /** every voice plays into this; it feeds the dry path and the valley echo */
  private bus: GainNode | null = null;
  /** two seconds of white noise, shared by every noisy voice */
  private noise: AudioBuffer | null = null;
  private conchWave: PeriodicWave | null = null;
  private countTimer: number | null = null;
  muted = storedMute();

  /** Flip sound on/off; returns the new muted state. */
  toggle(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(STORE_KEY, this.muted ? 'off' : 'on');
    } catch {
      // private mode: the choice simply lasts for this visit
    }
    if (this.muted) this.countStop();
    return this.muted;
  }

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = 0.42;
      master.connect(ctx.destination);

      // The valley: three fixed echoes, no feedback, each later, darker and
      // from another side, a highpass in front so the drums stay dry.
      const pre = ctx.createBiquadFilter();
      pre.type = 'highpass';
      pre.frequency.value = 320;
      for (const { delay, gain, dark, pan } of [
        { delay: 0.29, gain: 0.28, dark: 4200, pan: -0.55 },
        { delay: 0.47, gain: 0.18, dark: 2700, pan: 0.6 },
        { delay: 0.71, gain: 0.11, dark: 1600, pan: -0.15 },
      ]) {
        const d = ctx.createDelay(1);
        d.delayTime.value = delay;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = dark;
        const g = ctx.createGain();
        g.gain.value = gain;
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        pre.connect(d);
        d.connect(lp);
        lp.connect(g);
        g.connect(p);
        p.connect(master);
      }

      const bus = ctx.createGain();
      bus.connect(master);
      bus.connect(pre);

      const sr = ctx.sampleRate;
      const noise = ctx.createBuffer(1, sr * 2, sr);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

      const real = new Float32Array(CONCH_HARMONICS.length);
      const imag = Float32Array.from(CONCH_HARMONICS);
      this.conchWave = ctx.createPeriodicWave(real, imag);
      this.ctx = ctx;
      this.bus = bus;
      this.noise = noise;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Route a voice to the bus, through a panner when it sits off centre. */
  private out(node: AudioNode, pan: number): void {
    if (!this.ctx || !this.bus) return;
    if (pan === 0) {
      node.connect(this.bus);
      return;
    }
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(panner);
    panner.connect(this.bus);
  }

  /** A slice of the shared noise, looped so long notes never run off its end. */
  private noiseSource(ctx: AudioContext): AudioBufferSourceNode {
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    return src;
  }

  /**
   * One koto string: a bright saw and a soft octave through a resonant
   * lowpass that closes fast, with the plectrum's scrape on top. `bend`
   * (semitones) is the press: after the pluck the note is pushed up into the
   * next step of the scale.
   */
  private koto(freq: number, dur: number, vol: number, when = 0, pan = 0, bend = 0): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const sum = ctx.createGain();
    sum.gain.value = vol;
    this.out(sum, pan);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 7;
    lp.frequency.setValueAtTime(Math.min(freq * 16, 14000), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.6, 180), t + Math.min(0.5, dur * 0.45));
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(1, t + 0.003);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(amp);
    amp.connect(sum);
    for (const [type, mult, level] of [
      ['sawtooth', 1, 0.6],
      ['triangle', 2, 0.25],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq * mult, t);
      if (bend) {
        osc.frequency.setValueAtTime(freq * mult, t + 0.07);
        osc.frequency.exponentialRampToValueAtTime(freq * mult * 2 ** (bend / 12), t + 0.2);
      }
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g);
      g.connect(lp);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }

    const src = this.noiseSource(ctx);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 3200;
    band.Q.value = 1.5;
    const pick = ctx.createGain();
    pick.gain.setValueAtTime(0.3, t);
    pick.gain.exponentialRampToValueAtTime(0.001, t + 0.006);
    src.connect(band);
    band.connect(pick);
    pick.connect(sum);
    src.start(t, Math.random() * 1.8, 0.012);
  }

  /** Scale steps `steps` (indices into SCALE) in turn, `gap` seconds apart, the last one pressed. */
  private phrase(steps: number[], gap: number, vol: number, when = 0, dur = 0.9, press = true): void {
    steps.forEach((i, n) => {
      const last = n === steps.length - 1;
      const k = Math.min(i, SCALE.length - 1);
      const up = press && last && k + 1 < SCALE.length ? 12 * Math.log2(SCALE[k + 1] / SCALE[k]) : 0;
      this.koto(SCALE[k], last ? dur * 1.4 : dur, vol, when + n * gap, -0.3 + (0.6 * n) / Math.max(1, steps.length - 1), up);
    });
  }

  /** The big drum: the skin's pitch falling as it booms, a felt thump, the crack of the stick. */
  private taiko(vol: number, when = 0, pan = 0, pitch = 1): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(140 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(52 * pitch, t + 0.32);
    const body = ctx.createGain();
    body.gain.setValueAtTime(0.0001, t);
    body.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    body.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    osc.connect(body);
    this.out(body, pan);
    osc.start(t);
    osc.stop(t + 0.95);

    const src = this.noiseSource(ctx);
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 260;
    const thump = ctx.createGain();
    thump.gain.setValueAtTime(vol * 0.8, t);
    thump.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(low);
    low.connect(thump);
    this.out(thump, pan);
    src.start(t, Math.random() * 1.8, 0.15);

    const src2 = this.noiseSource(ctx);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2200;
    band.Q.value = 1.2;
    const crack = ctx.createGain();
    crack.gain.setValueAtTime(vol * 0.25, t);
    crack.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
    src2.connect(band);
    band.connect(crack);
    this.out(crack, pan);
    src2.start(t, Math.random() * 1.8, 0.03);
  }

  /** The hyoshigi: a click of noise ringing through two narrow wooden resonances. */
  private clap(vol: number, when = 0, pan = 0, pitch = 1): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const src = this.noiseSource(ctx);
    const hit = ctx.createGain();
    hit.gain.setValueAtTime(1, t);
    hit.gain.exponentialRampToValueAtTime(0.001, t + 0.005);
    src.connect(hit);
    const sum = ctx.createGain();
    sum.gain.value = vol * 6; // narrow resonances keep little of the click
    this.out(sum, pan);
    for (const [f, q] of [
      [2650, 28],
      [3980, 24],
    ]) {
      const wood = ctx.createBiquadFilter();
      wood.type = 'bandpass';
      wood.frequency.value = f * pitch;
      wood.Q.value = q;
      hit.connect(wood);
      wood.connect(sum);
    }
    src.start(t, Math.random() * 1.8, 0.01);
  }

  /** A sweep of band-passed noise from `f0` to `f1` Hz: the air a swung blade cuts. */
  private whoosh(dur: number, vol: number, when = 0, f0 = 3000, f1 = 600, pan = 0): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const src = this.noiseSource(ctx);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 2.5;
    band.frequency.setValueAtTime(f0, t);
    band.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(vol, t + dur * 0.4);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(band);
    band.connect(amp);
    this.out(amp, pan);
    src.start(t, Math.random() * 1.8, dur + 0.05);
  }

  /** The blade drawn: steel noise sweeping up, then the metal ringing on with a slow shimmer. */
  private blade(vol: number, when = 0, pan = 0): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const src = this.noiseSource(ctx);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 4;
    band.frequency.setValueAtTime(2200, t);
    band.frequency.exponentialRampToValueAtTime(8500, t + 0.16);
    const scrape = ctx.createGain();
    scrape.gain.setValueAtTime(0.0001, t);
    scrape.gain.exponentialRampToValueAtTime(vol * 0.7, t + 0.12);
    scrape.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    src.connect(band);
    band.connect(scrape);
    this.out(scrape, pan);
    src.start(t, Math.random() * 1.8, 0.32);

    const ring = t + 0.09;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7;
    BLADE_PARTIALS.forEach((f, n) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = f;
      const depth = ctx.createGain();
      depth.gain.value = f * 0.003;
      lfo.connect(depth);
      depth.connect(osc.frequency);
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.0001, ring);
      amp.gain.exponentialRampToValueAtTime(vol * 0.25 * BLADE_AMPS[n], ring + 0.004);
      amp.gain.exponentialRampToValueAtTime(0.0001, ring + BLADE_LIVES[n]);
      osc.connect(amp);
      this.out(amp, pan);
      osc.start(ring);
      osc.stop(ring + BLADE_LIVES[n] + 0.02);
    });
    lfo.start(ring);
    lfo.stop(ring + BLADE_LIVES[0] + 0.05);
  }

  /** The bronze gong: nine modes, the high ones blooming late and dying early, the pitch sinking as it rings. */
  private gong(base: number, dur: number, vol: number, when = 0, pan = 0): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const sum = ctx.createGain();
    sum.gain.value = vol / 2.5;
    this.out(sum, pan);
    GONG_MODES.forEach((mode, n) => {
      const f = base * mode;
      if (f > 12000) return;
      const life = dur / (1 + 0.28 * n);
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(f * 1.012, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + dur * 0.6);
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(GONG_AMPS[n], t + 0.01 + n * 0.018);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + life);
      osc.connect(amp);
      amp.connect(sum);
      osc.start(t);
      osc.stop(t + life + 0.05);
    });
    const src = this.noiseSource(ctx);
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 500;
    const mallet = ctx.createGain();
    mallet.gain.setValueAtTime(1.4, t);
    mallet.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(low);
    low.connect(mallet);
    mallet.connect(sum);
    src.start(t, Math.random() * 1.8, 0.08);
  }

  /** The conch war horn: scooping up into `freq`, nasal and breathy, the vibrato easing in. */
  private conch(freq: number, dur: number, vol: number, when = 0, pan = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.conchWave) return;
    const t = ctx.currentTime + when;
    dur = Math.max(dur, 0.5);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(vol, t + 0.12);
    amp.gain.setValueAtTime(vol, t + dur - 0.25);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    this.out(amp, pan);

    const osc = ctx.createOscillator();
    osc.setPeriodicWave(this.conchWave);
    osc.frequency.setValueAtTime(freq * 2 ** (-3 / 12), t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.16);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.3;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.setValueAtTime(0, t + 0.3);
    depth.gain.linearRampToValueAtTime(freq * 0.006, t + 0.6);
    lfo.connect(depth);
    depth.connect(osc.frequency);

    const nasal = ctx.createBiquadFilter();
    nasal.type = 'bandpass';
    nasal.frequency.value = freq * 2.5;
    nasal.Q.value = 0.9;
    const soft = ctx.createBiquadFilter();
    soft.type = 'lowpass';
    soft.frequency.value = 1800;
    const mix = ctx.createGain();
    mix.gain.value = 0.7;
    osc.connect(nasal);
    osc.connect(soft);
    nasal.connect(mix);
    soft.connect(mix);
    mix.connect(amp);

    const src = this.noiseSource(ctx);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1100;
    band.Q.value = 0.8;
    const breath = ctx.createGain();
    breath.gain.setValueAtTime(0.0001, t);
    breath.gain.exponentialRampToValueAtTime(0.18, t + 0.06);
    breath.gain.exponentialRampToValueAtTime(0.05, t + 0.25);
    src.connect(band);
    band.connect(breath);
    breath.connect(amp);

    osc.start(t);
    osc.stop(t + dur + 0.05);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
    src.start(t, Math.random() * 1.8, dur + 0.05);
  }

  /** UI button tap: the clappers, barely touched. */
  click(): void {
    this.clap(0.05, 0, 0, 1.15);
  }

  /** The spin: a blade swung through the air and the koto strummed up the scale. */
  spin(): void {
    this.whoosh(0.22, 0.05, 0, 3000, 600);
    this.phrase([5, 6, 7, 8, 9], 0.028, 0.055, 0.02, 0.7, false);
  }

  /** Each free game: one drum stroke and one string. */
  freeSpin(): void {
    this.taiko(0.12, 0, 0, 1.25);
    this.koto(NOTES.d4, 0.6, 0.05, 0.02);
  }

  /** One reel landing: the clappers from that reel's side, and its low string up the scale. */
  reelStop(index: number): void {
    const pan = reelPan(index);
    this.clap(0.08, 0, pan);
    this.koto(REEL_NOTES[index % REEL_NOTES.length], 0.8, 0.045, 0.004, pan);
  }

  /** A GONG lands: it booms from its reel with a drum under it, each one higher than the last. */
  gongLand(n: number, reel: number): void {
    const pan = reelPan(reel);
    this.gong([NOTES.g3, NOTES.a3, NOTES.d4][Math.min(n, 2)], 2.6, 0.14, 0, pan);
    this.taiko(0.13, 0, pan);
  }

  /** Two GONGs are up and reel `reel` still rolls: the drums beat like a heart, a string trembling over them. */
  tease(reel: number): void {
    const step = Math.max(0, reel - 2);
    const pan = reelPan(reel);
    this.taiko(0.1 + step * 0.03, 0, pan, 0.9);
    this.taiko(0.08 + step * 0.03, 0.22, pan, 0.9);
    for (let i = 0; i < 6; i++) this.koto(NOTES.a3, 0.25, 0.02 + step * 0.006, 0.05 + i * 0.045, pan);
  }

  /** A winning line: its own koto figure, the last string pressed. */
  line(lineIndex: number): void {
    this.phrase(LINE_PHRASES[lineIndex % LINE_PHRASES.length], 0.07, 0.09, 0, 1.0);
  }

  /** Many lines at once: the koto runs up to a top set by the longest run; with a samurai reel the conch sounds. */
  lines(longest: number, count: number, wild: boolean): void {
    const top = longest >= 5 ? 15 : longest === 4 ? 13 : 10;
    this.phrase([5, 7, 8, 10, top], 0.05, 0.08, 0.02, 1.0);
    this.taiko(0.12 + Math.min(count, 10) * 0.004, 0);
    if (wild) this.conch(longest >= 5 ? NOTES.d4 : NOTES.a3, 0.9, 0.07, 0.05);
  }

  /** The GONGs pay: the great gong, the drums twice, and the koto rising higher for every gong. */
  scatter(count: number): void {
    const tops = [12, 13, 15];
    this.gong(NOTES.d3, 3.2, 0.18);
    this.taiko(0.15, 0);
    this.taiko(0.12, 0.2);
    this.phrase([5, 8, 10, tops[Math.min(Math.max(count, 3), 5) - 3]], 0.08, 0.08, 0.15, 1.1);
  }

  /** The samurai takes a reel: the blade drawn from that side, and a drum stroke behind it. */
  strike(reel: number): void {
    const pan = reelPan(reel);
    this.blade(0.16, 0, pan);
    this.taiko(0.14, 0.05, pan, 1.1);
  }

  /** The count-up: the koto runs the top of the scale, round and round, left and right. */
  countStart(): void {
    if (this.countTimer !== null || this.muted) return;
    let i = 0;
    this.countTimer = window.setInterval(() => {
      this.koto(COUNT_RUN[i % COUNT_RUN.length], 0.35, 0.045, 0, i % 2 ? 0.15 : -0.15);
      i++;
    }, 85);
  }

  countStop(): void {
    if (this.countTimer !== null) {
      clearInterval(this.countTimer);
      this.countTimer = null;
    }
  }

  /** BIG WIN: the drums roll faster and faster, the great gong, the conch calls, the open fifth of D and A. */
  bigwin(): void {
    let at = 0;
    for (let i = 0; i < 10; i++) {
      this.taiko(0.08 + i * 0.008, at, i % 2 ? 0.2 : -0.2, 1 + i * 0.02);
      at += 0.16 - (0.11 * i) / 9;
    }
    this.gong(NOTES.d3, 4.0, 0.2, at);
    this.conch(NOTES.d4, 1.2, 0.09, at + 0.05);
    this.conch(NOTES.a4, 1.5, 0.08, at + 0.75);
    for (let i = 0; i < 16; i++) this.koto(SCALE[i], 0.5, 0.05, at + 0.05 + i * 0.035, -0.5 + i / 16);
    this.koto(NOTES.d5, 2.0, 0.08, at + 1.0, -0.2);
    this.koto(NOTES.a5, 2.0, 0.07, at + 1.0, 0.2);
    this.taiko(0.18, at + 1.0, 0, 0.9);
  }

  /** The free games begin: the gong, the conch calling twice, the drums answering, then the koto's call to arms. */
  bonusStart(): void {
    this.gong(NOTES.g3, 3.5, 0.17);
    this.conch(NOTES.a3, 0.8, 0.09, 0.25);
    this.conch(NOTES.d4, 1.4, 0.1, 1.0);
    for (const [at, v] of [
      [0.2, 0.15],
      [0.55, 0.15],
      [0.9, 0.11],
      [1.0, 0.11],
      [1.25, 0.17],
    ]) {
      this.taiko(v, at);
    }
    // A, B flat, D, E flat, D, B flat, A
    this.phrase([8, 9, 10, 11, 10, 9, 8], 0.22, 0.09, 1.6, 0.9);
  }

  /** More free games: the drums twice, a short conch call and the koto running up. */
  retrigger(): void {
    this.taiko(0.15, 0);
    this.taiko(0.15, 0.12);
    this.conch(NOTES.d4, 0.6, 0.08, 0.1);
    this.phrase([10, 11, 12, 13, 14, 15], 0.05, 0.08, 0.15, 0.9);
  }

  /** Free games over: the koto walks down the scale and the gong rings it out. */
  bonusEnd(): void {
    this.phrase([15, 14, 13, 12, 11, 10, 9, 8, 7, 5], 0.1, 0.08, 0, 0.9, false);
    this.gong(NOTES.d3, 3.0, 0.1, 1.0);
    this.taiko(0.1, 1.0, 0, 0.85);
  }
}

export const sound = new SoundBank();
