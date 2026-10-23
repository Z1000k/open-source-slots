/**
 * The soundtrack: a synthesized enchanted forest in WebAudio, so the game
 * ships zero audio files. Its own kit, shared with none of our other slots:
 *
 *   - tines: the steel comb of a music box, and lower down a thumb piano,
 *     modelled as a clamped bar: a fundamental with the bar's own
 *     inharmonic overtones at 6.27 and 17.55 times it, each dying far
 *     sooner than the one below, struck with the tick of the pin letting go.
 *   - the fairy choir: formant synthesis, detuned saw pairs sung through
 *     three vowel resonances (an open "ah", a hushed "oo") under a vibrato
 *     that eases in, the first voice in the series built from vowels.
 *   - fairy dust: showers of tiny high pings scattered in time and across
 *     the stereo field, drawn from the whole-tone scale.
 *   - the winding key: a clockwork ratchet, the pawl clicking over the
 *     teeth faster and faster, with the spring ringing under each click.
 *   - the spell: a reversed swell of noise through a resonance sweeping up,
 *     the sound of magic gathering before it lands.
 *   - the forest hum: low fifths beating slowly against their twins.
 *   - the tock of the mechanism, a small wooden knock for each reel.
 *   - the space: a stereo ping-pong echo, every sound answered from the
 *     left, then the right, then the left again, darker each time, like a
 *     clearing in the woods. Every other set of ours used a delay, an echo,
 *     a slapback or a stone hall.
 *
 * Reel stops travel left to right across the stereo field. The tunes sit in
 * A flat major, the lullaby key, with whole-tone runs (A flat, B flat, C, D,
 * E, F sharp) for the magic; the big cadence is the storybook plagal close,
 * D flat major to D flat minor to A flat major. The fruit slots used C and A
 * major pentatonic, the papyrus temple D minor, the barn G major, the reef
 * E Lydian, the voyage D Phrygian dominant, the house of the sun E double
 * harmonic major.
 *
 * Muting is remembered across visits. The AudioContext is only ever created
 * inside a user gesture (every cue is triggered by a click or key), so the
 * browser autoplay rules never block it.
 */

const STORE_KEY = 'fairytale-sound';

// A flat major (A flat, B flat, C, D flat, E flat, F, G) in Hz, "b" for flat.
// e4 is F flat, for the D flat minor chord of the cadence.
const NOTES = {
  ab1: 51.91,
  ab2: 103.83,
  db3: 138.59,
  eb3: 155.56,
  ab3: 207.65,
  bb3: 233.08,
  c4: 261.63,
  db4: 277.18,
  eb4: 311.13,
  e4: 329.63,
  f4: 349.23,
  g4: 392.0,
  ab4: 415.3,
  bb4: 466.16,
  c5: 523.25,
  db5: 554.37,
  eb5: 622.25,
  f5: 698.46,
  g5: 783.99,
  ab5: 830.61,
  bb5: 932.33,
  c6: 1046.5,
  db6: 1108.73,
  eb6: 1244.51,
  f6: 1396.91,
  g6: 1567.98,
  ab6: 1661.22,
};

/** A flat major from A flat 5 up an octave and a half, for the count-up. */
const COUNT_RUN = [
  NOTES.ab5, NOTES.bb5, NOTES.c6, NOTES.db6, NOTES.eb6, NOTES.f6, NOTES.g6, NOTES.ab6,
];

/** The whole-tone scale on A flat, two octaves, for the flicker of the draw and the dust. */
const WHOLE_TONE = [830.61, 932.33, 1046.5, 1174.66, 1318.51, 1479.98, 1661.22, 1864.66, 2093.0, 2349.32, 2637.02, 2959.96];
const DUST = WHOLE_TONE.slice(6).concat([3322.44, 3729.31, 4186.01]);

/** Choir voicings, low voice first. */
const AB_MAJOR = [NOTES.ab3, NOTES.eb4, NOTES.ab4, NOTES.c5];
const DB_MAJOR = [NOTES.ab3, NOTES.db4, NOTES.f4, NOTES.db5];
const DB_MINOR = [NOTES.ab3, NOTES.db4, NOTES.e4, NOTES.db5];
const EB_MAJOR = [NOTES.bb3, NOTES.eb4, NOTES.g4, NOTES.bb4];

/** One music-box triad per bet line, built on each step of the scale in turn. */
const LINE_TRIADS: [number, number, number][] = [
  [NOTES.ab4, NOTES.c5, NOTES.eb5],
  [NOTES.bb4, NOTES.db5, NOTES.f5],
  [NOTES.c5, NOTES.eb5, NOTES.g5],
  [NOTES.db5, NOTES.f5, NOTES.ab5],
  [NOTES.eb5, NOTES.g5, NOTES.bb5],
  [NOTES.f5, NOTES.ab5, NOTES.c6],
  [NOTES.g5, NOTES.bb5, NOTES.db6],
  [NOTES.ab5, NOTES.c6, NOTES.eb6],
  [NOTES.bb5, NOTES.db6, NOTES.f6],
  [NOTES.c6, NOTES.eb6, NOTES.g6],
];

/** The thumb piano note of each reel as it lands, climbing the chord. */
const REEL_TINES = [NOTES.ab3, NOTES.c4, NOTES.eb4, NOTES.ab4, NOTES.c5];

/** A clamped bar's modes: the music box comb's overtones, and how loud each starts. */
const TINE_MODES = [1, 6.267, 17.547];
const TINE_AMPS = [1, 0.3, 0.09];

type Vowel = 'ah' | 'oo';
/** Formant centre, strength and Q per vowel, a high, light voice. */
const VOWELS: Record<Vowel, { f: number[]; g: number[]; q: number[] }> = {
  ah: { f: [800, 1150, 2900], g: [1, 0.5, 0.18], q: [7, 8, 10] },
  oo: { f: [350, 650, 2700], g: [1, 0.35, 0.08], q: [6, 8, 10] },
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
  /** every voice plays into this; it feeds the dry path and the ping-pong echo */
  private bus: GainNode | null = null;
  /** two seconds of white noise, shared by every noisy voice */
  private noise: AudioBuffer | null = null;
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

      // The clearing: a ping-pong echo. The left delay answers first and
      // feeds the right, the right feeds the left, each pass through a
      // lowpass so the echoes darken as they cross, and a highpass in front
      // so the low hum and the tocks stay dry.
      const sr = ctx.sampleRate;
      const pre = ctx.createBiquadFilter();
      pre.type = 'highpass';
      pre.frequency.value = 420;
      const left = ctx.createDelay(1);
      const right = ctx.createDelay(1);
      left.delayTime.value = 0.23;
      right.delayTime.value = 0.23;
      const toRight = ctx.createGain();
      const toLeft = ctx.createGain();
      toRight.gain.value = 0.42;
      toLeft.gain.value = 0.42;
      const darkL = ctx.createBiquadFilter();
      const darkR = ctx.createBiquadFilter();
      darkL.type = 'lowpass';
      darkR.type = 'lowpass';
      darkL.frequency.value = 4600;
      darkR.frequency.value = 4600;
      const merge = ctx.createChannelMerger(2);
      const wet = ctx.createGain();
      wet.gain.value = 0.32;
      pre.connect(left);
      left.connect(merge, 0, 0);
      left.connect(darkL);
      darkL.connect(toRight);
      toRight.connect(right);
      right.connect(merge, 0, 1);
      right.connect(darkR);
      darkR.connect(toLeft);
      toLeft.connect(left);
      merge.connect(wet);
      wet.connect(master);

      const bus = ctx.createGain();
      bus.connect(master);
      bus.connect(pre);

      const noise = ctx.createBuffer(1, sr * 2, sr);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
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
   * One tine of the comb: the clamped bar's three modes, the overtones
   * dying 3.4 and 5.8 times sooner than the fundamental, so the note opens
   * glassy and settles pure. A 6ms tick of high noise is the pin.
   */
  private tine(freq: number, dur: number, vol: number, when = 0, pan = 0): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const sum = ctx.createGain();
    sum.gain.value = vol;
    this.out(sum, pan);
    TINE_MODES.forEach((mode, n) => {
      const f = freq * mode;
      if (f > 14000) return;
      const life = dur / (1 + 2.4 * n);
      const osc = ctx.createOscillator();
      osc.frequency.value = f;
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(TINE_AMPS[n], t + 0.002);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + life);
      osc.connect(amp);
      amp.connect(sum);
      osc.start(t);
      osc.stop(t + life + 0.02);
    });
    const src = this.noiseSource(ctx);
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 4000;
    const pin = ctx.createGain();
    pin.gain.setValueAtTime(0.18, t);
    pin.gain.exponentialRampToValueAtTime(0.001, t + 0.006);
    src.connect(high);
    high.connect(pin);
    pin.connect(sum);
    src.start(t, Math.random() * 1.8, 0.012);
  }

  /** The comb plays `notes` in turn, `step` seconds apart, drifting left to right. */
  private comb(notes: number[], step: number, vol: number, when = 0, dur = 1.1): void {
    notes.forEach((f, i) => this.tine(f, dur, vol, when + i * step, -0.3 + (0.6 * i) / Math.max(1, notes.length - 1)));
  }

  /**
   * The fairy choir: two detuned saws per note, sung through the vowel's
   * three formants, swelling in, with a vibrato that eases in once the
   * chord has settled.
   */
  private choir(notes: number[], dur: number, vol: number, when = 0, vowel: Vowel = 'ah', pan = 0): void {
    const ctx = this.ensure();
    if (!ctx) return;
    dur = Math.max(dur, 0.35);
    const t = ctx.currentTime + when;
    const attack = Math.min(0.22, dur * 0.35);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(vol, t + attack);
    amp.gain.setValueAtTime(vol, t + Math.max(attack + 0.01, dur - 0.32));
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    this.out(amp, pan);

    const voices = ctx.createGain();
    voices.gain.value = 1 / Math.sqrt(notes.length);
    const formants = ctx.createGain();
    formants.gain.value = 2.6; // the narrow resonances keep only part of the saws
    const v = VOWELS[vowel];
    v.f.forEach((f, i) => {
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = f;
      band.Q.value = v.q[i];
      const g = ctx.createGain();
      g.gain.value = v.g[i];
      voices.connect(band);
      band.connect(g);
      g.connect(formants);
    });
    formants.connect(amp);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.1;
    for (const f of notes) {
      for (const cents of [-7, 6]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = f;
        osc.detune.value = cents;
        const depth = ctx.createGain();
        depth.gain.setValueAtTime(0, t);
        depth.gain.linearRampToValueAtTime(f * 0.0055, t + Math.min(0.45, dur * 0.6));
        lfo.connect(depth);
        depth.connect(osc.frequency);
        osc.connect(voices);
        osc.start(t);
        osc.stop(t + dur + 0.05);
      }
    }
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }

  /** Fairy dust: `count` tiny pings scattered over `spread` seconds and across the field around `pan`. */
  private dust(count: number, vol: number, when = 0, spread = 0.5, pan = 0, width = 0.8, notes = DUST): void {
    const ctx = this.ensure();
    if (!ctx) return;
    for (let i = 0; i < count; i++) {
      const t = ctx.currentTime + when + Math.random() * spread;
      const osc = ctx.createOscillator();
      osc.frequency.value = notes[Math.floor(Math.random() * notes.length)];
      const life = 0.05 + Math.random() * 0.12;
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(vol * (0.5 + Math.random() * 0.5), t + 0.003);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + life);
      osc.connect(amp);
      this.out(amp, pan + (Math.random() * 2 - 1) * width);
      osc.start(t);
      osc.stop(t + life + 0.02);
    }
  }

  /** A run up the whole-tone scale as dust: the glissando of a wand. */
  private wand(vol: number, when = 0, step = 0.035, notes = WHOLE_TONE): void {
    notes.forEach((f, i) => this.dust(1, vol, when + i * step, 0, -0.5 + (i / notes.length), 0.1, [f]));
  }

  /**
   * The winding key: `clicks` snaps of the pawl over the ratchet, the gaps
   * shrinking from `from` to `to` seconds as the key turns faster, each a
   * click of band-passed noise over a short ring of the spring.
   */
  private ratchet(clicks: number, vol: number, when = 0, from = 0.06, to = 0.034, pan = -0.25): void {
    const ctx = this.ensure();
    if (!ctx) return;
    let at = ctx.currentTime + when;
    for (let i = 0; i < clicks; i++) {
      const src = this.noiseSource(ctx);
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 2500 + Math.random() * 400;
      band.Q.value = 3;
      const click = ctx.createGain();
      click.gain.setValueAtTime(vol, at);
      click.gain.exponentialRampToValueAtTime(0.0005, at + 0.012);
      src.connect(band);
      band.connect(click);
      this.out(click, pan);
      src.start(at, Math.random() * 1.8, 0.02);

      const spring = ctx.createOscillator();
      spring.frequency.value = 1850 + i * 30;
      const ring = ctx.createGain();
      ring.gain.setValueAtTime(vol * 0.22, at);
      ring.gain.exponentialRampToValueAtTime(0.0005, at + 0.03);
      spring.connect(ring);
      this.out(ring, pan);
      spring.start(at);
      spring.stop(at + 0.035);
      at += from + ((to - from) * i) / Math.max(1, clicks - 1);
    }
  }

  /** The spell gathering: noise through a resonance sweeping up, swelling to `vol`, then cut. */
  private swell(dur: number, vol: number, when = 0, f0 = 600, f1 = 5200, pan = 0): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const src = this.noiseSource(ctx);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 5;
    band.frequency.setValueAtTime(f0, t);
    band.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(vol, t + dur);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    src.connect(band);
    band.connect(amp);
    this.out(amp, pan);
    src.start(t, Math.random() * 1.8, dur + 0.1);
  }

  /** The forest hum: `root` and its fifth, each beating slowly against a twin a hair sharp. */
  private hum(root: number, dur: number, vol: number, when = 0): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(vol, t + dur * 0.55);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    this.out(amp, 0);
    for (const [f, beat] of [
      [root, 0],
      [root, 1.3],
      [root * 1.5, 0],
      [root * 1.5, 0.9],
    ]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = f + beat;
      const g = ctx.createGain();
      g.gain.value = f === root ? 0.5 : 0.3;
      osc.connect(g);
      g.connect(amp);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
  }

  /** The mechanism's tock: a little wooden knock falling in pitch, with its click. */
  private tock(vol: number, when = 0, pan = 0): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(820, t + 0.03);
    const body = ctx.createGain();
    body.gain.setValueAtTime(vol, t);
    body.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(body);
    this.out(body, pan);
    osc.start(t);
    osc.stop(t + 0.06);

    const src = this.noiseSource(ctx);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1800;
    band.Q.value = 2;
    const click = ctx.createGain();
    click.gain.setValueAtTime(vol * 0.7, t);
    click.gain.exponentialRampToValueAtTime(0.001, t + 0.01);
    src.connect(band);
    band.connect(click);
    this.out(click, pan);
    src.start(t, Math.random() * 1.8, 0.02);
  }

  /** UI button tap: one high tine, barely touched. */
  click(): void {
    this.tine(NOTES.c6, 0.35, 0.06);
  }

  /** The spin: the key winds the box, and the comb runs up the chord. */
  spin(): void {
    this.ratchet(6, 0.07);
    this.comb([NOTES.ab4, NOTES.c5, NOTES.eb5], 0.04, 0.07, 0.03, 0.8);
  }

  /** Each free game: a short turn of the key and one low tine. */
  freeSpin(): void {
    this.ratchet(3, 0.05, 0, 0.045, 0.035);
    this.tine(NOTES.ab3, 0.7, 0.07, 0.01);
  }

  /** One reel landing: a tock from that reel's side, and its thumb piano note up the chord. */
  reelStop(index: number): void {
    const pan = reelPan(index);
    this.tock(0.09, 0, pan);
    this.tine(REEL_TINES[index % REEL_TINES.length], 0.9, 0.07, 0.004, pan);
  }

  /** A LANTERN lands: it chimes and glows from its reel, each one higher than the last. */
  lanternLand(n: number, reel: number): void {
    const calls = [NOTES.eb5, NOTES.ab5, NOTES.c6];
    const note = calls[Math.min(n, calls.length - 1)];
    const pan = reelPan(reel);
    this.tine(note, 1.2, 0.1, 0.01, pan);
    this.tine(note * 2, 0.7, 0.04, 0.03, pan);
    this.choir([note], 0.6, 0.045, 0.02, 'oo', pan);
    this.dust(5, 0.035, 0.03, 0.3, pan, 0.25);
  }

  /** Two LANTERNs are up and reel `reel` still rolls: the forest hums under a trickle of dust. */
  tease(reel: number): void {
    const step = Math.max(0, reel - 2);
    this.hum([NOTES.ab2, NOTES.db3, NOTES.eb3][Math.min(step, 2)], 0.9, 0.05 + step * 0.012);
    this.dust(7 + step * 3, 0.025 + step * 0.006, 0.05, 0.8, reelPan(reel), 0.2);
  }

  /** A winning line: its own triad up the comb, then the root an octave higher. */
  line(lineIndex: number): void {
    const [a, b, c] = LINE_TRIADS[lineIndex % LINE_TRIADS.length];
    this.comb([a, b, c, a * 2], 0.06, 0.11, 0, 1.2);
  }

  /** The LANTERNs pay: a shower of dust and the choir, its top voice higher for every lantern. */
  scatter(count: number): void {
    const tops = [NOTES.c5, NOTES.eb5, NOTES.ab5, NOTES.c6];
    const top = tops[Math.min(Math.max(count, 2), 5) - 2];
    this.dust(6 + count * 4, 0.04, 0, 0.7);
    this.choir([...AB_MAJOR.slice(0, 3), top], 1.1 + count * 0.12, 0.055, 0.02);
    this.comb([NOTES.eb5, NOTES.ab5, top * 2], 0.07, 0.08, 0.1, 1.2);
  }

  /** The draw begins: magic gathers. */
  draw(): void {
    this.swell(0.42, 0.07, 0, 700, 5200);
    this.dust(6, 0.025, 0.05, 0.35, -0.5, 0.2);
  }

  /** The draw flickers to its next face: a tick of the comb, stepping up the whole-tone scale. */
  flicker(i: number): void {
    this.tine(WHOLE_TONE[i % 6], 0.2, 0.045, 0, -0.55);
  }

  /** The drawn symbol fills reel `reel` of `of`: a chord of tines and a burst of dust; the last gets the choir. */
  cast(reel: number, of: number): void {
    const pan = reelPan(reel);
    const chords = [
      [NOTES.ab4, NOTES.c5, NOTES.eb5],
      [NOTES.c5, NOTES.eb5, NOTES.ab5],
      [NOTES.eb5, NOTES.ab5, NOTES.c6],
    ];
    chords[Math.min(reel, chords.length - 1)].forEach((f, i) => this.tine(f, 1.0, 0.08, i * 0.012, pan));
    this.dust(7, 0.04, 0, 0.25, pan, 0.2);
    if (reel === of - 1) this.choir(of >= 3 ? [...AB_MAJOR, NOTES.eb5] : AB_MAJOR, 0.9, 0.05, 0.03, 'oo');
  }

  /** The cast pays on its lines: the choir opens, its top voice by the longest run, the comb climbing. */
  spellPays(longest: number, lines: number): void {
    const top = longest >= 5 ? NOTES.eb6 : longest === 4 ? NOTES.c6 : longest === 3 ? NOTES.ab5 : NOTES.eb5;
    this.choir([...AB_MAJOR, top], 1.0 + 0.12 * longest, 0.055, 0, 'ah');
    this.comb([NOTES.ab4, NOTES.c5, NOTES.eb5, NOTES.ab5, top], 0.05, 0.08, 0.04, 1.1);
    this.dust(4 + lines, 0.03, 0.08, 0.6);
  }

  /** The count-up: the comb climbs the top of the scale, round and round, left and right. */
  countStart(): void {
    if (this.countTimer !== null || this.muted) return;
    let i = 0;
    this.countTimer = window.setInterval(() => {
      this.tine(COUNT_RUN[i % COUNT_RUN.length], 0.35, 0.05, 0, i % 2 ? 0.15 : -0.15);
      i++;
    }, 85);
  }

  countStop(): void {
    if (this.countTimer !== null) {
      clearInterval(this.countTimer);
      this.countTimer = null;
    }
  }

  /** BIG WIN: the wand runs up, then the storybook close, D flat major, D flat minor, A flat major. */
  bigwin(): void {
    this.wand(0.05, 0, 0.035);
    this.swell(0.5, 0.06, 0.05, 900, 6000);
    this.choir(DB_MAJOR, 0.6, 0.06, 0.55, 'ah');
    this.comb([NOTES.db5, NOTES.f5, NOTES.ab5], 0.05, 0.08, 0.55, 0.9);
    this.choir(DB_MINOR, 0.6, 0.06, 1.1, 'ah');
    this.comb([NOTES.db5, NOTES.e4 * 2, NOTES.ab5], 0.05, 0.08, 1.1, 0.9);
    this.choir([...AB_MAJOR, NOTES.eb5, NOTES.ab5], 2.4, 0.065, 1.65, 'ah');
    this.comb([NOTES.ab5, NOTES.c6, NOTES.eb6, NOTES.ab6], 0.07, 0.09, 1.65, 1.8);
    this.hum(NOTES.ab1, 2.2, 0.06, 1.65);
    this.dust(28, 0.04, 1.65, 1.6);
  }

  /** The free games begin: the wand, the choir rising on "oo", and the comb's lullaby over it. */
  bonusStart(): void {
    this.wand(0.045, 0, 0.04);
    this.swell(0.5, 0.05, 0, 600, 4800);
    this.choir([NOTES.ab3, NOTES.eb4, NOTES.ab4], 1.6, 0.05, 0.35, 'oo');
    this.choir([...AB_MAJOR, NOTES.eb5], 1.7, 0.055, 1.75, 'ah');
    // once upon a time: E flat, A flat, G, A flat, C, B flat, A flat
    const tune: [number, number][] = [
      [NOTES.eb5, 0.4],
      [NOTES.ab5, 0.62],
      [NOTES.g5, 0.84],
      [NOTES.ab5, 1.06],
      [NOTES.c6, 1.28],
      [NOTES.bb5, 1.5],
      [NOTES.ab5, 1.75],
    ];
    tune.forEach(([f, at], i) => this.tine(f, i === tune.length - 1 ? 1.8 : 0.9, 0.1, at, -0.2 + i * 0.07));
    this.dust(16, 0.035, 1.75, 1.2);
  }

  /** More free games: a burst of dust, E flat major opening into A flat major. */
  retrigger(): void {
    this.dust(14, 0.045, 0, 0.5);
    this.choir(EB_MAJOR, 0.45, 0.055, 0, 'ah');
    this.choir(AB_MAJOR, 1.1, 0.06, 0.4, 'ah');
    this.comb([NOTES.ab5, NOTES.c6, NOTES.eb6], 0.06, 0.09, 0.4, 1.2);
  }

  /** Free games over: the comb walks down the scale, D flat major settles on A flat major. */
  bonusEnd(): void {
    this.comb(
      [NOTES.ab5, NOTES.g5, NOTES.f5, NOTES.eb5, NOTES.db5, NOTES.c5, NOTES.bb4, NOTES.ab4],
      0.1,
      0.09,
      0,
      1.0,
    );
    this.choir(DB_MAJOR, 0.6, 0.05, 0.85, 'oo');
    this.choir(AB_MAJOR, 2.0, 0.055, 1.4, 'oo');
    this.tine(NOTES.ab4, 2.0, 0.09, 1.4);
    this.hum(NOTES.ab2, 1.8, 0.04, 1.3);
    this.dust(10, 0.03, 1.4, 1.0);
  }
}

export const sound = new SoundBank();
