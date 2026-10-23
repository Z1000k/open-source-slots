/**
 * The soundtrack: a synthesized royal court in WebAudio, so the game ships
 * zero audio files. Its own kit, shared with none of our other slots:
 *
 *   - the harpsichord: a quill plucking two unison strings tuned a breath
 *     apart. Its tone is a PeriodicWave with the comb of a string plucked
 *     near its end (the partials with a node at the plucking point go
 *     missing), it drops fast after the pluck and then rings on darkening,
 *     and the jack clicks as the quill passes the string.
 *   - the natural trumpets: Chowning FM brass, a sine carrier and modulator
 *     at 1:1 with the modulation index riding the loudness, so the tone
 *     brightens as it speaks and blares on the attack, the lip finding the
 *     pitch from a hair under. They play only notes of the harmonic series
 *     of E flat, as a valveless trumpet can.
 *   - the kettledrums: tuned timpani, the membrane modes in the near
 *     harmonic ratios the air in the kettle pulls them into plus the dull
 *     thud of the lowest, a felt mallet, the pitch settling as the head
 *     relaxes from the blow; rolls for the tease and the big moments.
 *   - the organ: a principal chorus of flue pipes (8, 4, 2 2/3, 2 and 1 foot
 *     in one PeriodicWave), the wind filling them as the chord speaks, a
 *     chiff of breath as each pipe starts, no two pipes quite in tune.
 *   - the side drum: the guard's rope drum, a skin and a rattle of gut
 *     snares, played as ruffs, two grace strokes into the main one.
 *   - the space: the throne room, an algorithmic Schroeder reverb, four
 *     damped feedback combs into two allpasses per side, the right side a
 *     little longer and darker. Every other set of ours used a delay, an
 *     echo, a slapback, a convolution hall, a ping-pong echo or a valley
 *     echo.
 *
 * Reel stops travel left to right across the stereo field. The music is in
 * E flat major, the key of the trumpets and the drums, and the big moments
 * close on a suspended dominant resolving home. The fruit slots used C and A
 * major pentatonic, the papyrus temple D minor, the barn G major, the reef E
 * Lydian, the voyage D Phrygian dominant, the house of the sun E double
 * harmonic major, the fairy tale A flat major, the samurai the in scale on D.
 *
 * Muting is remembered across visits. The AudioContext is only ever created
 * inside a user gesture (every cue is triggered by a click or key), so the
 * browser autoplay rules never block it.
 */
import type { Heir } from '../engine';

const STORE_KEY = 'the-dynasty-sound';

/** Semitones of each degree of a major scale above its tonic. */
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const EB2 = 77.782;
/** Degree `d` of E flat major counted up from E flat 2: 0 is Eb2, 7 is Eb3, 14 Eb4, 21 Eb5, 28 Eb6. */
const deg = (d: number): number => EB2 * 2 ** ((12 * Math.floor(d / 7) + MAJOR[((d % 7) + 7) % 7]) / 12);

/** The kettledrums: the tonic on the small drum, the dominant below it on the big one. */
const TONIC = deg(7);
const DOMINANT = deg(4);

/** The low string of each reel as it lands: E flat, G, B flat, C, E flat. */
const REEL_DEGREES = [7, 9, 11, 12, 14];

/** The count-up: a broken chord of E flat high on the harpsichord, round and round. */
const COUNT_FIGURE = [21, 25, 23, 25];

/**
 * The quill's comb: the partials of a string plucked at 12% of its length,
 * each weighted by how far that point sits from a node of it.
 */
const PLUCK = 0.12;
const QUILL_PARTIALS = Array.from({ length: 30 }, (_, i) =>
  i === 0 ? 0 : Math.abs(Math.sin(Math.PI * i * PLUCK)) / i ** 0.8,
);

/** A principal chorus of flue pipes: 8', 4', 2 2/3', 2', 1 3/5' and 1' on harmonics 1, 2, 3, 4, 5 and 8. */
const PIPE_PARTIALS = [0, 1, 0.62, 0.3, 0.42, 0.1, 0.18, 0.04, 0.2, 0.03, 0.05];

/**
 * The kettledrum's modes as [ratio to the strike note, level, life in s]:
 * the dull (0,1) thud below, the strike note and its near-harmonic
 * partners, and the weak inharmonic (1,2) between them.
 */
const TIMP_MODES: [number, number, number][] = [
  [0.83, 0.55, 0.16],
  [1, 1, 1.8],
  [1.5, 0.5, 1.3],
  [1.74, 0.12, 0.5],
  [1.98, 0.32, 1.0],
  [2.44, 0.18, 0.75],
  [2.94, 0.1, 0.55],
];

/** The throne room: comb delays (s), the time a sound takes to die away (s). */
const COMBS = [0.0297, 0.0371, 0.0411, 0.0437];
const ALLPASSES = [0.005, 0.0034];
const RT60 = 1.9;

/** The herald's call for each heir: the top trumpet and the second, as scale degrees, three short and one long. */
const TUCKETS: Record<Heir, { top: number[]; low: number[] }> = {
  HEIRESS: { top: [21, 21, 21, 25], low: [18, 18, 18, 23] },
  HEIR: { top: [18, 18, 18, 21], low: [14, 14, 14, 16] },
};

/** The note each heir sounds as it lands, climbing with every one of its kind. */
const HEIR_CALLS: Record<Heir, number[]> = {
  HEIRESS: [18, 21, 23, 25, 28],
  HEIR: [14, 16, 18, 21, 23],
};

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
  /** every voice plays into this; it feeds the dry path and the throne room */
  private bus: GainNode | null = null;
  /** two seconds of white noise, shared by every noisy voice */
  private noise: AudioBuffer | null = null;
  private quillWave: PeriodicWave | null = null;
  private pipeWave: PeriodicWave | null = null;
  private countTimer: number | null = null;
  private tick = 0;
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

      const bus = ctx.createGain();
      bus.connect(master);
      this.throneRoom(ctx, bus, master);

      const sr = ctx.sampleRate;
      const noise = ctx.createBuffer(1, sr * 2, sr);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

      this.quillWave = ctx.createPeriodicWave(new Float32Array(QUILL_PARTIALS.length), Float32Array.from(QUILL_PARTIALS));
      this.pipeWave = ctx.createPeriodicWave(new Float32Array(PIPE_PARTIALS.length), Float32Array.from(PIPE_PARTIALS));
      this.ctx = ctx;
      this.bus = bus;
      this.noise = noise;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /**
   * The throne room: a Schroeder reverb. The bus, summed to mono after a
   * short pre-delay and a highpass, feeds four feedback combs per side, each
   * loop damped by a lowpass so the highs die first; the combs sum into two
   * allpasses that thicken the echoes into a wash; the right side runs a
   * hair longer and darker so the room opens out in stereo.
   */
  private throneRoom(ctx: AudioContext, input: AudioNode, output: AudioNode): void {
    const pre = ctx.createDelay(0.1);
    pre.delayTime.value = 0.021;
    const mono = ctx.createGain();
    mono.channelCount = 1;
    mono.channelCountMode = 'explicit';
    const low = ctx.createBiquadFilter();
    low.type = 'highpass';
    low.frequency.value = 240;
    input.connect(pre);
    pre.connect(mono);
    mono.connect(low);

    const merger = ctx.createChannelMerger(2);
    const wet = ctx.createGain();
    wet.gain.value = 0.24;
    merger.connect(wet);
    wet.connect(output);

    for (const side of [0, 1]) {
      const spread = side * 0.0011;
      const combs = ctx.createGain();
      combs.gain.value = 0.25;
      for (const d of COMBS) {
        const delay = d + spread;
        const sum = ctx.createGain();
        const line = ctx.createDelay(0.1);
        line.delayTime.value = delay;
        const damp = ctx.createBiquadFilter();
        damp.type = 'lowpass';
        damp.frequency.value = side ? 2700 : 3400;
        damp.Q.value = -3.01; // no peak at the cutoff, so the loop can never ring up
        const fb = ctx.createGain();
        fb.gain.value = 10 ** ((-3 * delay) / RT60);
        low.connect(sum);
        sum.connect(line);
        line.connect(damp);
        damp.connect(fb);
        fb.connect(sum);
        line.connect(combs);
      }
      let node: AudioNode = combs;
      for (const d of ALLPASSES) node = this.allpass(ctx, node, d + spread * 0.3, 0.7);
      node.connect(merger, 0, side);
    }
  }

  /** A Schroeder allpass: w = x + g w[n-D], y = -g w + w[n-D]. Every loop runs through a delay, as WebAudio requires. */
  private allpass(ctx: AudioContext, input: AudioNode, delay: number, g: number): AudioNode {
    const w = ctx.createGain();
    const line = ctx.createDelay(0.05);
    line.delayTime.value = delay;
    const fb = ctx.createGain();
    fb.gain.value = g;
    const ff = ctx.createGain();
    ff.gain.value = -g;
    const y = ctx.createGain();
    input.connect(w);
    w.connect(line);
    line.connect(fb);
    fb.connect(w);
    w.connect(ff);
    ff.connect(y);
    line.connect(y);
    return y;
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
   * One harpsichord note: two unison strings a breath apart (and the 4-foot
   * an octave up when `four`), a fast drop after the pluck, then a long
   * darkening ring, and the jack's click.
   */
  private harpsi(freq: number, dur: number, vol: number, when = 0, pan = 0, four = false): void {
    const ctx = this.ensure();
    if (!ctx || !this.quillWave) return;
    const t = ctx.currentTime + when;
    const sum = ctx.createGain();
    sum.gain.value = vol;
    this.out(sum, pan);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = -3.01;
    lp.frequency.setValueAtTime(Math.min(16000, freq * 22), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(freq * 3, 900), t + dur * 0.7);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(1, t + 0.002);
    amp.gain.exponentialRampToValueAtTime(0.3, t + 0.07);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(amp);
    amp.connect(sum);

    const strings: [number, number][] = [
      [freq * 0.9994, 0.5],
      [freq * 1.0006, 0.5],
    ];
    if (four) strings.push([freq * 2.0009, 0.3]);
    for (const [f, level] of strings) {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(this.quillWave);
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g);
      g.connect(lp);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }

    const src = this.noiseSource(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4500;
    const click = ctx.createGain();
    click.gain.setValueAtTime(0.2, t);
    click.gain.exponentialRampToValueAtTime(0.001, t + 0.004);
    src.connect(hp);
    hp.connect(click);
    click.connect(sum);
    src.start(t, Math.random() * 1.8, 0.01);
  }

  /** Harpsichord notes on scale degrees, `gap` s apart, panned across. */
  private run(degrees: number[], gap: number, vol: number, when = 0, dur = 0.6, four = false): void {
    degrees.forEach((d, n) => {
      const pan = degrees.length > 1 ? -0.35 + (0.7 * n) / (degrees.length - 1) : 0;
      this.harpsi(deg(d), dur, vol, when + n * gap, pan, four);
    });
  }

  /**
   * One natural trumpet note: FM brass at 1:1, the index riding the
   * loudness with a blare on the attack, the lip finding the pitch.
   */
  private trumpet(freq: number, dur: number, vol: number, when = 0, pan = 0): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    dur = Math.max(dur, 0.14);
    const end = t + dur;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    for (const osc of [car, mod]) {
      osc.frequency.setValueAtTime(freq * 0.985, t);
      osc.frequency.exponentialRampToValueAtTime(freq, t + 0.05);
    }
    const peak = freq * 4.6;
    const index = ctx.createGain();
    index.gain.setValueAtTime(0, t);
    index.gain.linearRampToValueAtTime(peak, t + 0.035);
    index.gain.linearRampToValueAtTime(peak * 0.62, t + 0.12);
    index.gain.setValueAtTime(peak * 0.62, end - 0.09);
    index.gain.linearRampToValueAtTime(0, end + 0.02);
    mod.connect(index);
    index.connect(car.frequency);

    const bell = ctx.createBiquadFilter();
    bell.type = 'lowpass';
    bell.frequency.value = 5200;
    bell.Q.value = -3.01;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(vol, t + 0.03);
    amp.gain.exponentialRampToValueAtTime(vol * 0.78, t + 0.12);
    amp.gain.setValueAtTime(vol * 0.78, end - 0.09);
    amp.gain.exponentialRampToValueAtTime(0.0001, end + 0.03);
    car.connect(bell);
    bell.connect(amp);
    this.out(amp, pan);
    car.start(t);
    mod.start(t);
    car.stop(end + 0.05);
    mod.stop(end + 0.05);
  }

  /** Two trumpets in a tucket: three short notes and a long one, the second trumpet under the first. */
  private tucket(top: number[], low: number[], vol: number, when = 0, pan = 0): void {
    const at = [0, 0.11, 0.22, 0.34];
    const len = [0.09, 0.09, 0.1, 0.8];
    for (let i = 0; i < at.length; i++) {
      this.trumpet(deg(top[i]), len[i], vol, when + at[i], pan + 0.12);
      this.trumpet(deg(low[i]), len[i], vol * 0.8, when + at[i] + 0.004, pan - 0.12);
    }
  }

  /**
   * One kettledrum stroke tuned to `pitch`: the modes struck a hair sharp
   * and settling, the mallet's felt thump. `ring` shortens the modes for
   * the quick strokes of a roll.
   */
  private timp(pitch: number, vol: number, when = 0, pan = 0, ring = 1): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const sum = ctx.createGain();
    sum.gain.value = vol * 0.45;
    this.out(sum, pan);
    for (const [ratio, level, life] of TIMP_MODES) {
      const f = pitch * ratio;
      const dies = life * ring;
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(f * 1.015, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + 0.07);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(level, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dies);
      osc.connect(g);
      g.connect(sum);
      osc.start(t);
      osc.stop(t + dies + 0.02);
    }
    const src = this.noiseSource(ctx);
    const felt = ctx.createBiquadFilter();
    felt.type = 'lowpass';
    felt.frequency.value = 650;
    const thump = ctx.createGain();
    thump.gain.setValueAtTime(1.2, t);
    thump.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    src.connect(felt);
    felt.connect(thump);
    thump.connect(sum);
    src.start(t, Math.random() * 1.8, 0.05);
  }

  /** A kettledrum roll on `pitch`, `dur` s long, swelling from `from` to `to`, the sticks alternating. */
  private roll(pitch: number, dur: number, from: number, to: number, when = 0, pan = 0): void {
    const strokes = Math.max(2, Math.round(dur / 0.056));
    for (let i = 0; i < strokes; i++) {
      const k = i / (strokes - 1);
      const v = (from + (to - from) * k) * (0.85 + Math.random() * 0.3);
      this.timp(pitch, v, when + i * 0.056 + (Math.random() - 0.5) * 0.008, pan + (i % 2 ? 0.08 : -0.08), 0.42);
    }
  }

  /**
   * A chord on the organ: each pipe from the principal chorus, the wind
   * filling them, a chiff of breath as each speaks, no two quite in tune.
   */
  private organ(freqs: number[], dur: number, vol: number, when = 0, pan = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.pipeWave) return;
    const t = ctx.currentTime + when;
    const end = t + dur;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(vol, t + 0.08);
    amp.gain.setValueAtTime(vol, end);
    amp.gain.linearRampToValueAtTime(0.0001, end + 0.25);
    this.out(amp, pan);
    const each = 0.6 / Math.sqrt(freqs.length);
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(this.pipeWave);
      osc.frequency.value = f * (1 + (Math.random() - 0.5) * 0.002);
      const g = ctx.createGain();
      g.gain.value = each;
      osc.connect(g);
      g.connect(amp);
      osc.start(t);
      osc.stop(end + 0.3);

      const src = this.noiseSource(ctx);
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = Math.min(f * 4, 9000);
      band.Q.value = 4;
      const chiff = ctx.createGain();
      chiff.gain.setValueAtTime(0.0001, t);
      chiff.gain.exponentialRampToValueAtTime(each * 0.8, t + 0.012);
      chiff.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      src.connect(band);
      band.connect(chiff);
      chiff.connect(amp);
      src.start(t, Math.random() * 1.8, 0.12);
    }
  }

  /** A chord of scale degrees on the organ. */
  private chord(degrees: number[], dur: number, vol: number, when = 0, pan = 0): void {
    this.organ(degrees.map(deg), dur, vol, when, pan);
  }

  /** One stroke on the side drum: the batter head and the gut snares rattling under it. */
  private drum(vol: number, when = 0, pan = 0): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(240, t);
    osc.frequency.exponentialRampToValueAtTime(165, t + 0.05);
    const head = ctx.createGain();
    head.gain.setValueAtTime(0.0001, t);
    head.gain.exponentialRampToValueAtTime(vol * 0.7, t + 0.002);
    head.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(head);
    this.out(head, pan);
    osc.start(t);
    osc.stop(t + 0.1);

    const src = this.noiseSource(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 4200;
    band.Q.value = 0.7;
    const snares = ctx.createGain();
    snares.gain.setValueAtTime(0.0001, t);
    snares.gain.exponentialRampToValueAtTime(vol, t + 0.003);
    snares.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    src.connect(hp);
    hp.connect(band);
    band.connect(snares);
    this.out(snares, pan);
    src.start(t, Math.random() * 1.8, 0.2);
  }

  /** A ruff: two grace strokes into the main one. */
  private ruff(vol: number, when = 0, pan = 0): void {
    this.drum(vol * 0.35, when, pan);
    this.drum(vol * 0.45, when + 0.04, pan);
    this.drum(vol, when + 0.085, pan);
  }

  /** The soft wooden knock of a reel coming to rest. */
  private thock(vol: number, when = 0, pan = 0): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(72, t + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    osc.connect(g);
    this.out(g, pan);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  /** The suspended dominant resolving home on the organ, the kettledrums under the last chord. */
  private cadence(vol: number, when = 0, hold = 1.6): void {
    this.chord([4, 7, 8, 11], 0.5, vol, when);
    this.chord([4, 6, 8, 11], 0.5, vol, when + 0.55);
    this.chord([0, 7, 9, 11, 14], hold, vol * 1.1, when + 1.1);
    this.timp(DOMINANT, 0.12, when + 0.55);
    this.timp(TONIC, 0.16, when + 1.1);
  }

  /** UI button tap: a single high harpsichord string, barely touched. */
  click(): void {
    this.harpsi(deg(28), 0.22, 0.025);
  }

  /** The spin: the guard's drum ruffs and the harpsichord runs up into it. */
  spin(): void {
    this.ruff(0.06, 0, -0.1);
    this.run([14, 16, 18, 21], 0.028, 0.032, 0.02, 0.5);
  }

  /** Each free game: one kettledrum stroke on the tonic and one string. */
  freeSpin(): void {
    this.timp(TONIC, 0.08, 0, 0, 0.6);
    this.harpsi(deg(14), 0.5, 0.035, 0.02);
  }

  /** One reel landing: its low string from that side, climbing the chord left to right, and a soft knock. */
  reelStop(index: number): void {
    const pan = reelPan(index);
    this.harpsi(deg(REEL_DEGREES[index % REEL_DEGREES.length]), 0.9, 0.05, 0.004, pan);
    this.thock(0.06, 0, pan);
  }

  /** An heir lands: a trumpet from its reel, higher for every one of its kind, the drums under it. */
  heirLand(heir: Heir, n: number, reel: number): void {
    const pan = reelPan(reel);
    const notes = HEIR_CALLS[heir];
    this.trumpet(deg(notes[Math.min(n, notes.length - 1)]), 0.42, 0.07, 0, pan);
    this.timp(n >= 2 ? TONIC : DOMINANT, 0.08 + Math.min(n, 3) * 0.025, 0, pan);
  }

  /** Two of one heir are up and reel `reel` still rolls: the kettledrums roll, swelling. */
  tease(reel: number): void {
    const step = Math.max(0, reel - 2);
    this.roll(DOMINANT, 0.56, 0.05 + step * 0.015, 0.11 + step * 0.03, 0, reelPan(reel));
  }

  /** An heir is crowned: the organ swells, a trumpet rings out above it, the harpsichord runs up. */
  crown(reel: number): void {
    const pan = reelPan(reel);
    this.chord([7, 9, 11, 14], 0.9, 0.07, 0, pan * 0.5);
    this.trumpet(deg(18), 0.1, 0.05, 0.05, pan);
    this.trumpet(deg(21), 0.55, 0.06, 0.17, pan);
    this.run([21, 22, 23, 24, 25, 26, 27, 28], 0.022, 0.025, 0.02, 0.35);
    this.timp(TONIC, 0.11, 0, pan);
  }

  /** 3+ of one heir call the free games: the drum ruffs and the trumpets sound that heir's call. */
  call(heir: Heir, count: number): void {
    const { top, low } = TUCKETS[heir];
    this.ruff(0.09, 0);
    this.tucket(top, low, 0.07, 0.12);
    this.timp(DOMINANT, 0.12, 0.12);
    this.timp(TONIC, 0.15 + Math.min(count - 3, 2) * 0.02, 0.46);
  }

  /**
   * A winning line: its own harpsichord figure, a mordent on the first note,
   * rising for lines 1-10 and falling for 11-20; a trumpet answers when the
   * monarch doubled it.
   */
  line(lineIndex: number, doubled: boolean): void {
    const i = 14 + (lineIndex % 10);
    const figure = lineIndex % 20 < 10 ? [i, i + 1, i, i + 2, i + 4] : [i + 4, i + 5, i + 4, i + 2, i];
    const at = [0, 0.04, 0.08, 0.16, 0.24];
    figure.forEach((d, n) => this.harpsi(deg(d), n === figure.length - 1 ? 0.9 : 0.4, 0.05, at[n], -0.25 + n * 0.12));
    if (doubled) {
      this.trumpet(deg(18), 0.1, 0.05, 0.26);
      this.trumpet(deg(21), 0.4, 0.06, 0.37);
    }
  }

  /** Many lines at once: the harpsichord rolls a chord up to a top set by the longest run, the drums, the trumpets when doubled. */
  lines(longest: number, count: number, doubled: boolean): void {
    const top = longest >= 5 ? 28 : longest === 4 ? 25 : 23;
    this.run([14, 16, 18, 21, top], 0.045, 0.05, 0.02, 0.9, true);
    this.timp(TONIC, 0.11 + Math.min(count, 10) * 0.004, 0);
    if (doubled) this.tucket([21, 21, 21, 25], [18, 18, 18, 23], 0.055, 0.12);
  }

  /** The calling heir pays in the free games: the trumpets, the organ and the drums, more for every heir. */
  scatter(count: number): void {
    const tops = [23, 25, 28];
    const k = Math.min(Math.max(count, 3), 5) - 3;
    this.tucket([21, 21, 21, tops[k]], [18, 18, 18, 21], 0.07);
    this.chord([7, 11, 14, 16, 18], 1.1, 0.06, 0.34);
    this.roll(TONIC, 0.3 + k * 0.25, 0.06, 0.13);
  }

  /** The count-up: the harpsichord's broken chord of E flat, round and round, left and right. */
  countStart(): void {
    if (this.countTimer !== null || this.muted) return;
    let i = 0;
    this.countTimer = window.setInterval(() => {
      this.harpsi(deg(COUNT_FIGURE[i % COUNT_FIGURE.length]), 0.3, 0.032, 0, i % 2 ? 0.15 : -0.15);
      i++;
    }, 85);
  }

  countStop(): void {
    if (this.countTimer !== null) {
      clearInterval(this.countTimer);
      this.countTimer = null;
    }
  }

  /** BIG WIN: the kettledrums roll up, the full organ, the trumpets, the harpsichord flourish, the cadence home. */
  bigwin(): void {
    this.roll(DOMINANT, 1.2, 0.04, 0.16);
    const at = 1.25;
    this.timp(TONIC, 0.2, at);
    this.chord([0, 7, 9, 11, 14, 16], 1.0, 0.09, at);
    this.tucket([21, 21, 21, 28], [18, 18, 18, 25], 0.08, at + 0.05);
    this.run([14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28], 0.03, 0.035, at + 0.1, 0.45);
    this.cadence(0.08, at + 1.15);
  }

  /** The free games are called: the guard's drums, the heralds' fanfare, the kettledrums and the organ. */
  bonusStart(): void {
    this.ruff(0.09, 0, -0.2);
    this.ruff(0.09, 0.32, 0.2);
    this.tucket([21, 21, 21, 25], [18, 18, 18, 23], 0.08, 0.62);
    this.tucket([23, 23, 23, 28], [21, 21, 21, 25], 0.08, 1.45);
    this.timp(DOMINANT, 0.14, 0.62);
    this.timp(TONIC, 0.16, 0.96);
    this.timp(TONIC, 0.18, 1.79);
    this.chord([0, 7, 11, 14, 16], 1.8, 0.07, 1.79);
  }

  /** One number passing the draw's window: a light pluck, two strings in turn. */
  drawTick(): void {
    this.harpsi(deg(this.tick++ % 2 ? 25 : 28), 0.18, 0.022);
  }

  /** The draw lands: the drums and the trumpets, the top note higher the more free games it gave. */
  drawLand(count: number): void {
    const tops = [23, 25, 25, 28, 28];
    const k = Math.max(0, Math.min(tops.length - 1, Math.round((count - 25) / 5)));
    this.timp(TONIC, 0.17, 0);
    this.trumpet(deg(21), 0.6, 0.06, 0, -0.15);
    this.trumpet(deg(tops[k]), 0.7, 0.07, 0.02, 0.15);
    this.run([14, 18, 21, 25], 0.03, 0.035, 0.04, 0.6);
    if (k >= 3) this.roll(TONIC, 0.4, 0.05, 0.12, 0.25);
  }

  /** More free games: the heir's call again, quicker, the drums rolling under it. */
  retrigger(): void {
    this.ruff(0.08, 0);
    this.tucket([21, 21, 21, 25], [18, 18, 18, 23], 0.07, 0.1);
    this.roll(DOMINANT, 0.45, 0.05, 0.11, 0.1);
  }

  /** Free games over: the harpsichord walks down the scale and the organ closes on the cadence. */
  bonusEnd(): void {
    this.run([28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18], 0.08, 0.035, 0, 0.6);
    this.chord([3, 7, 10, 12], 0.6, 0.07, 0.9);
    this.cadence(0.075, 1.5, 1.8);
  }
}

export const sound = new SoundBank();
