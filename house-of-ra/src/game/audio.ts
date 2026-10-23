/**
 * The soundtrack: a synthesized temple of the sun in WebAudio, so the game
 * ships zero audio files. Its own kit, shared with none of our other slots:
 *
 *   - harp: the arched harp of the temple musicians, built additively from
 *     sine partials, each one quieter and shorter lived than the one below
 *     it, so a note opens bright and settles into a round, pure tone, with
 *     a breath of noise for the finger on the string.
 *   - ney: a reed flute with air in it, a soft reed wave under a vibrato
 *     that eases in once the note has settled, over a band of breath noise
 *     that follows the pitch and chiffs at the start.
 *   - arghul: the double reed pipe's drone, odd harmonics only (the hollow
 *     clarinet colour), swelling as its filter opens.
 *   - sistrum: the sacred rattle, noise rung through three narrow,
 *     inharmonic metal resonances, struck two or more times a stroke, each
 *     strike lit with a ping off one of its discs.
 *   - darbuka: the goblet drum, its deep doum (a sine falling an octave
 *     under the thud of a palm) and its sharp tek off the rim.
 *   - the hall: a convolution reverb whose impulse is generated at start,
 *     two seconds of decaying, darkening stereo noise, the stone hall the
 *     whole set plays in. Every other set of ours used a delay or an echo.
 *
 * Reel stops travel left to right across the stereo field, and the motifs
 * sit in E double harmonic major (E F G# A B C D#), the scale with two
 * augmented seconds; the big cadence falls F major to E major. The fruit
 * slots used C and A major pentatonic, the papyrus temple D minor, the barn
 * G major, the reef E Lydian, the voyage D Phrygian dominant.
 *
 * Muting is remembered across visits. The AudioContext is only ever created
 * inside a user gesture (every cue is triggered by a click or key), so the
 * browser autoplay rules never block it.
 */

const STORE_KEY = 'house-of-ra-sound';

// E double harmonic major (E F G# A B C D#), in Hz. "s" marks a sharp.
const NOTES = {
  e2: 82.41,
  b2: 123.47,
  e3: 164.81,
  f3: 174.61,
  gs3: 207.65,
  a3: 220.0,
  b3: 246.94,
  c4: 261.63,
  ds4: 311.13,
  e4: 329.63,
  f4: 349.23,
  gs4: 415.3,
  a4: 440.0,
  b4: 493.88,
  c5: 523.25,
  ds5: 622.25,
  e5: 659.25,
  f5: 698.46,
  gs5: 830.61,
  a5: 880.0,
  b5: 987.77,
  c6: 1046.5,
  ds6: 1244.51,
  e6: 1318.51,
};

/** The scale from E4 up two octaves, for runs and sweeps. */
const SCALE = [
  NOTES.e4, NOTES.f4, NOTES.gs4, NOTES.a4, NOTES.b4, NOTES.c5, NOTES.ds5,
  NOTES.e5, NOTES.f5, NOTES.gs5, NOTES.a5, NOTES.b5, NOTES.c6, NOTES.ds6, NOTES.e6,
];

/** Harp voicings, low string first. */
const E_MAJOR = [NOTES.e3, NOTES.b3, NOTES.e4, NOTES.gs4, NOTES.b4, NOTES.e5];
const F_MAJOR = [NOTES.f3, NOTES.c4, NOTES.f4, NOTES.a4, NOTES.c5, NOTES.f5];

/** One harp triad per bet line, stacked in thirds from each step of the scale in turn. */
const LINE_TRIADS: [number, number, number][] = [
  [NOTES.e4, NOTES.gs4, NOTES.b4],
  [NOTES.f4, NOTES.a4, NOTES.c5],
  [NOTES.gs4, NOTES.b4, NOTES.ds5],
  [NOTES.a4, NOTES.c5, NOTES.e5],
  [NOTES.b4, NOTES.ds5, NOTES.f5],
  [NOTES.c5, NOTES.e5, NOTES.gs5],
  [NOTES.ds5, NOTES.f5, NOTES.a5],
  [NOTES.e5, NOTES.gs5, NOTES.b5],
  [NOTES.f5, NOTES.a5, NOTES.c6],
  [NOTES.gs5, NOTES.b5, NOTES.ds6],
];

/** The count-up climbs the top octave of the scale, round and round. */
const COUNT_RUN = SCALE.slice(7);

/** The sistrum's three metal discs, in Hz: deliberately inharmonic. */
const DISCS = [3150, 4720, 6380];

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
  /** every voice plays into this; it feeds the dry path and the stone hall */
  private bus: GainNode | null = null;
  /** two seconds of white noise, shared by every noisy voice */
  private noise: AudioBuffer | null = null;
  /** the ney's reed: a fundamental with a little second and third harmonic */
  private reed: PeriodicWave | null = null;
  /** the arghul's pipe: odd harmonics only */
  private pipe: PeriodicWave | null = null;
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

      // The hall: an impulse of stereo noise that dies away over two seconds
      // and darkens as it goes, the way stone soaks up the highs first,
      // after a 14ms pause before the first wall answers.
      const sr = ctx.sampleRate;
      const len = Math.floor(sr * 2.1);
      const gapLen = Math.floor(sr * 0.014);
      const impulse = ctx.createBuffer(2, len, sr);
      for (let ch = 0; ch < 2; ch++) {
        const d = impulse.getChannelData(ch);
        let lp = 0;
        for (let i = gapLen; i < len; i++) {
          const left = 1 - i / len;
          lp += (0.08 + 0.5 * left) * (Math.random() * 2 - 1 - lp);
          d[i] = lp * left * left * left;
        }
      }
      const hall = ctx.createConvolver();
      hall.buffer = impulse;
      const wet = ctx.createGain();
      wet.gain.value = 0.3;

      const bus = ctx.createGain();
      bus.connect(master);
      bus.connect(hall);
      hall.connect(wet);
      wet.connect(master);

      const noise = ctx.createBuffer(1, sr * 2, sr);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

      this.reed = ctx.createPeriodicWave(new Float32Array([0, 0, 0, 0]), new Float32Array([0, 1, 0.22, 0.08]));
      this.pipe = ctx.createPeriodicWave(
        new Float32Array(10),
        new Float32Array([0, 1, 0, 0.42, 0, 0.24, 0, 0.13, 0, 0.07]),
      );
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
    panner.pan.value = pan;
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
   * One harp string: partial n sounds at n times the note, at 1/n^1.3 of
   * its strength, and dies away 1 + 0.7(n-1) times sooner, so the tone
   * mellows as it rings. A 12ms tick of band-passed noise is the finger.
   */
  private harp(freq: number, dur: number, vol: number, when = 0, pan = 0): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const sum = ctx.createGain();
    sum.gain.value = vol;
    this.out(sum, pan);
    for (let n = 1; n <= 5; n++) {
      if (freq * n > 9000) break;
      const osc = ctx.createOscillator();
      osc.frequency.value = freq * n;
      const amp = ctx.createGain();
      const life = dur / (1 + 0.7 * (n - 1));
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(1 / Math.pow(n, 1.3), t + 0.004);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + life);
      osc.connect(amp);
      amp.connect(sum);
      osc.start(t);
      osc.stop(t + life + 0.02);
    }
    const src = this.noiseSource(ctx);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = Math.min(8000, freq * 3);
    band.Q.value = 3;
    const finger = ctx.createGain();
    finger.gain.setValueAtTime(0.25, t);
    finger.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
    src.connect(band);
    band.connect(finger);
    finger.connect(sum);
    src.start(t, Math.random() * 1.8, 0.02);
  }

  /** A sweep up (or down) the strings: `notes` played `step` seconds apart. */
  private sweep(notes: number[], step: number, vol: number, when = 0, dur = 0.9): void {
    notes.forEach((f, i) => this.harp(f, dur, vol, when + i * step, -0.35 + (0.7 * i) / Math.max(1, notes.length - 1)));
  }

  /** A chord struck across the strings, low first. */
  private strike(chord: number[], vol: number, when = 0, dur = 1.6): void {
    this.sweep(chord, 0.02, vol, when, dur);
  }

  /**
   * The ney: the reed wave, scooping up into the note from `from` when given,
   * with a vibrato that eases in, over breath noise around the second
   * harmonic that puffs at the start and then sits under the tone.
   */
  private ney(freq: number, dur: number, vol: number, when = 0, pan = 0, from?: number): void {
    const ctx = this.ensure();
    if (!ctx || !this.reed) return;
    dur = Math.max(dur, 0.3);
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(this.reed);
    osc.frequency.setValueAtTime(from ?? freq, t);
    if (from) osc.frequency.exponentialRampToValueAtTime(freq, t + Math.min(0.16, dur * 0.4));

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.3;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(freq * 0.007, t + Math.min(0.4, dur * 0.6));
    lfo.connect(depth);
    depth.connect(osc.frequency);

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(vol, t + 0.07);
    amp.gain.setValueAtTime(vol, t + Math.max(0.08, dur - 0.18));
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp);
    this.out(amp, pan);

    const air = this.noiseSource(ctx);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = freq * 2;
    band.Q.value = 2.2;
    const breath = ctx.createGain();
    breath.gain.setValueAtTime(0.0001, t);
    breath.gain.exponentialRampToValueAtTime(vol * 0.9, t + 0.03);
    breath.gain.exponentialRampToValueAtTime(vol * 0.22, t + 0.12);
    breath.gain.setValueAtTime(vol * 0.22, t + Math.max(0.13, dur - 0.18));
    breath.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    air.connect(band);
    band.connect(breath);
    this.out(breath, pan);

    osc.start(t);
    lfo.start(t);
    air.start(t, Math.random() * 1.8, dur + 0.05);
    osc.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }

  /** The arghul's drone on `root` and its octave, swelling as the filter opens, then gone. */
  private drone(root: number, dur: number, vol: number, when = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.pipe) return;
    const t = ctx.currentTime + when;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.Q.value = 3;
    tone.frequency.setValueAtTime(root * 2.5, t);
    tone.frequency.exponentialRampToValueAtTime(root * 14, t + dur * 0.75);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(vol, t + dur * 0.7);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [f, detune] of [
      [root, 0],
      [root * 2, 5],
    ]) {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(this.pipe);
      osc.frequency.value = f;
      osc.detune.value = detune;
      osc.connect(tone);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
    tone.connect(amp);
    this.out(amp, 0);
  }

  /**
   * The sistrum: `shakes` strikes `gap` seconds apart, each a burst of noise
   * rung through the three discs' narrow bands and a little open hiss, with
   * one disc pinging clear on every strike.
   */
  private sistrum(vol: number, when = 0, pan = 0, shakes = 3, gap = 0.05): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    for (let i = 0; i < shakes; i++) {
      const at = t + i * gap;
      const peak = vol * Math.max(0.45, 1 - i * 0.1);
      amp.gain.setValueAtTime(peak, at);
      amp.gain.exponentialRampToValueAtTime(peak * 0.06, at + gap * 0.92);
    }
    const end = t + (shakes - 1) * gap + 0.16;
    amp.gain.exponentialRampToValueAtTime(0.0001, end);

    const src = this.noiseSource(ctx);
    const air = ctx.createBiquadFilter();
    air.type = 'highpass';
    air.frequency.value = 2400;
    src.connect(air);
    const metal = ctx.createGain();
    metal.gain.value = 3.2; // the narrow bands keep only a sliver of the noise
    for (const f of DISCS) {
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = f * (0.98 + Math.random() * 0.04);
      band.Q.value = 16;
      air.connect(band);
      band.connect(metal);
    }
    const hiss = ctx.createGain();
    hiss.gain.value = 0.3;
    air.connect(hiss);
    metal.connect(amp);
    hiss.connect(amp);
    this.out(amp, pan);
    src.start(t, Math.random() * 1.8, end - t + 0.05);

    for (let i = 0; i < shakes; i++) {
      const at = t + i * gap;
      const ping = ctx.createOscillator();
      ping.frequency.value = DISCS[(i + Math.floor(Math.random() * 3)) % 3] * (0.99 + Math.random() * 0.02);
      const ring = ctx.createGain();
      ring.gain.setValueAtTime(vol * 0.18, at);
      ring.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
      ping.connect(ring);
      this.out(ring, pan);
      ping.start(at);
      ping.stop(at + 0.1);
    }
  }

  /** The darbuka's doum: a sine falling from 96 to 52Hz under the thud of a palm. */
  private doum(vol: number, when = 0, pan = 0): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(96, t);
    osc.frequency.exponentialRampToValueAtTime(52, t + 0.3);
    const body = ctx.createGain();
    body.gain.setValueAtTime(0.0001, t);
    body.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    body.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(body);
    this.out(body, pan);
    osc.start(t);
    osc.stop(t + 0.52);

    const src = this.noiseSource(ctx);
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 380;
    const thud = ctx.createGain();
    thud.gain.setValueAtTime(vol * 0.6, t);
    thud.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(low);
    low.connect(thud);
    this.out(thud, pan);
    src.start(t, Math.random() * 1.8, 0.06);
  }

  /** The darbuka's tek: a bright crack off the rim and the short ping of the goblet. */
  private tek(vol: number, when = 0, pan = 0): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const src = this.noiseSource(ctx);
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 3000;
    const crack = ctx.createGain();
    crack.gain.setValueAtTime(vol, t);
    crack.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    src.connect(high);
    high.connect(crack);
    this.out(crack, pan);
    src.start(t, Math.random() * 1.8, 0.05);

    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(1180, t);
    osc.frequency.exponentialRampToValueAtTime(1040, t + 0.06);
    const ping = ctx.createGain();
    ping.gain.setValueAtTime(vol * 0.35, t);
    ping.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(ping);
    this.out(ping, pan);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  /** UI button tap: one high harp string, barely touched. */
  click(): void {
    this.harp(NOTES.b5, 0.3, 0.07);
  }

  /** The spin: the sistrum shakes and the harp runs up the E chord. */
  spin(): void {
    this.sistrum(0.06, 0, 0, 2, 0.045);
    [NOTES.e4, NOTES.gs4, NOTES.b4].forEach((f, i) => this.harp(f, 0.6, 0.07, 0.02 + i * 0.03, -0.2 + i * 0.2));
  }

  /** One reel landing: a tek from that reel's side, and its step up the scale. */
  reelStop(index: number): void {
    const pan = reelPan(index);
    this.tek(0.1, 0, pan);
    this.harp(SCALE[index % SCALE.length], 0.7, 0.06, 0.004, pan);
  }

  /** A SUN DISC lands: the ney calls from its reel, each one higher than the last. */
  discLand(n: number, reel: number): void {
    const calls = [NOTES.b4, NOTES.e5, NOTES.gs5];
    const note = calls[Math.min(n, calls.length - 1)];
    const pan = reelPan(reel);
    this.ney(note, 0.6, 0.07, 0.02, pan, note * 0.94);
    this.sistrum(0.07, 0.02, pan, 3);
    this.doum(0.16, 0.02, pan);
  }

  /** Two SUN DISCs are up and reel `reel` still rolls: the drone swells under a long shimmer. */
  tease(reel: number): void {
    const step = Math.max(0, reel - 2);
    this.drone([NOTES.e2, NOTES.b2, NOTES.e3][Math.min(step, 2)], 0.8, 0.05 + step * 0.012);
    this.sistrum(0.03 + step * 0.008, 0.08, reelPan(reel), 8, 0.075);
  }

  /** A winning line: its own harp triad, climbing with the line number. */
  line(lineIndex: number): void {
    const [a, b, c] = LINE_TRIADS[lineIndex % LINE_TRIADS.length];
    this.harp(a, 1.1, 0.13, 0, -0.2);
    this.harp(b, 1.1, 0.12, 0.055, 0);
    this.harp(c, 1.3, 0.12, 0.11, 0.2);
  }

  /**
   * 3 or more SUN DISCs pay: the sun rises. The ney climbs the E chord in
   * three steps, starting a step higher for 4 discs and again for 5.
   */
  scatter(count: number): void {
    const ladder = [NOTES.b4, NOTES.e5, NOTES.gs5, NOTES.b5, NOTES.e6];
    const start = Math.min(Math.max(count, 3), 5) - 3;
    const [a, b, top] = ladder.slice(start, start + 3);
    this.sweep(SCALE.slice(0, 8), 0.035, 0.06);
    this.ney(a, 0.3, 0.08, 0.06);
    this.ney(b, 0.3, 0.08, 0.3);
    this.ney(top, 1.0, 0.085, 0.54, 0, top * 0.94);
    this.doum(0.2, 0.06);
    this.doum(0.2, 0.54);
    this.sistrum(0.08, 0.54, 0, 4);
  }

  /** The way's symbol takes reel `reel`: a short harp run, a step higher on each reel, and a tek. */
  expand(reel: number): void {
    const pan = reelPan(reel);
    SCALE.slice(reel * 2, reel * 2 + 4).forEach((f, i) => this.harp(f, 0.5, 0.07, i * 0.03, pan));
    this.sistrum(0.05, 0, pan, 2, 0.04);
    this.tek(0.08, 0, pan);
  }

  /** The expanded block pays on every line: E major across the harp, the ney on top, the doum under. */
  expanded(count: number): void {
    const top = count >= 5 ? NOTES.e6 : count === 4 ? NOTES.b5 : count === 3 ? NOTES.gs5 : NOTES.e5;
    this.strike(E_MAJOR, 0.09, 0, 1.8);
    this.ney(top, 1.0 + 0.15 * count, 0.08, 0.05, 0, top * 0.94);
    this.doum(0.2, 0);
    this.sistrum(0.07, 0.05, 0, 4);
  }

  /** The count-up: the harp climbs the top octave, round and round, left and right. */
  countStart(): void {
    if (this.countTimer !== null || this.muted) return;
    let i = 0;
    this.countTimer = window.setInterval(() => {
      this.harp(COUNT_RUN[i % COUNT_RUN.length], 0.3, 0.055, 0, i % 2 ? 0.15 : -0.15);
      i++;
    }, 80);
  }

  countStop(): void {
    if (this.countTimer !== null) {
      clearInterval(this.countTimer);
      this.countTimer = null;
    }
  }

  /** BIG WIN: the darbuka calls, the harp sweeps two octaves, F falls to E under the ney. */
  bigwin(): void {
    // doum tek tek doum tek doum tek-tek, the teks answering left and right
    const hits: ['d' | 't', number][] = [
      ['d', 0],
      ['t', 0.12],
      ['t', 0.24],
      ['d', 0.36],
      ['t', 0.48],
      ['d', 0.6],
      ['t', 0.72],
      ['t', 0.78],
    ];
    hits.forEach(([kind, at], i) => {
      if (kind === 'd') this.doum(0.22, at);
      else this.tek(0.1, at, i % 2 ? 0.25 : -0.25);
    });
    this.sweep(SCALE, 0.03, 0.07, 0.85, 1.1);
    this.strike(F_MAJOR, 0.1, 1.4, 0.9);
    this.strike(E_MAJOR, 0.11, 1.85, 2.4);
    this.ney(NOTES.b5, 0.42, 0.08, 1.4, 0, NOTES.a5);
    this.ney(NOTES.e6, 1.6, 0.09, 1.85, 0, NOTES.ds6);
    this.doum(0.24, 1.4);
    this.doum(0.26, 1.85);
    this.sistrum(0.08, 1.85, 0, 6, 0.06);
  }

  /** The free games begin: the drone rises and the ney walks up the scale to the octave over the drum. */
  bonusStart(): void {
    this.drone(NOTES.e2, 2.2, 0.06);
    [NOTES.e4, NOTES.f4, NOTES.gs4, NOTES.a4, NOTES.b4, NOTES.c5, NOTES.b4].forEach((f, i) =>
      this.ney(f, 0.3, 0.075, 0.2 + i * 0.2),
    );
    this.ney(NOTES.e5, 1.3, 0.085, 1.6, 0, NOTES.ds5);
    [0.2, 0.8, 1.4].forEach((at) => this.doum(0.2, at));
    [0.5, 0.65, 1.1, 1.25].forEach((at, i) => this.tek(0.08, at, i % 2 ? 0.2 : -0.2));
    this.sistrum(0.07, 1.6, 0, 5, 0.06);
    this.sweep(SCALE.slice(7), 0.04, 0.06, 1.6, 1.0);
  }

  /** Each free game rolls: a lighter shake than the paid spins, and one low string. */
  freeSpin(): void {
    this.sistrum(0.045, 0, 0, 2, 0.04);
    this.harp(NOTES.e3, 0.6, 0.07, 0.01);
  }

  /** More free games: the ney scoops up to E over the chord. */
  retrigger(): void {
    this.ney(NOTES.e5, 0.7, 0.08, 0, 0, NOTES.b4);
    this.strike(E_MAJOR.slice(2), 0.1, 0.05, 1.2);
    this.sistrum(0.07, 0.05, 0, 4);
    this.doum(0.18, 0.05);
  }

  /** Free games over: the harp walks down the scale, F settles on E, the ney ends on low E. */
  bonusEnd(): void {
    this.sweep([NOTES.e5, NOTES.ds5, NOTES.c5, NOTES.b4, NOTES.a4, NOTES.gs4, NOTES.f4, NOTES.e4], 0.09, 0.1, 0, 0.8);
    this.strike(F_MAJOR, 0.09, 0.8, 0.8);
    this.strike(E_MAJOR, 0.1, 1.15, 2.2);
    this.ney(NOTES.e4, 1.4, 0.075, 1.15, 0, NOTES.ds4);
    this.doum(0.2, 1.15);
    this.drone(NOTES.e2, 1.8, 0.04, 0.8);
  }
}

export const sound = new SoundBank();
