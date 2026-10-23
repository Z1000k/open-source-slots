/**
 * The soundtrack: a synthesized "age of sail" set in WebAudio, so the game
 * ships zero audio files. Its own kit, shared with none of our other slots:
 *
 *   - lute: a plucked gut string by Karplus-Strong synthesis, a burst of
 *     noise circulating in a short delay line that averages itself down into
 *     a decaying tone. The only physically modelled voice in any of our
 *     games; every other set is built from oscillators.
 *   - horn: two slightly detuned sawtooths through a filter that snaps open
 *     and slowly closes, the brassy call from the deck.
 *   - tambour: a frame drum, a falling sine thump under a slap of noise.
 *   - sail and timber: canvas snapping full of wind, and a hull that creaks.
 *
 * Reel stops travel left to right across the stereo field, every voice goes
 * through one short wooden slapback (a ship's cabin, close and dry), and the
 * motifs sit in D Phrygian dominant (D Eb F# G A Bb C), the Spanish mode of
 * the old ports, with the Andalusian cadence for the big wins. The fruit
 * slots used C and A major pentatonic, the temple D minor, the barn G major,
 * the reef E Lydian.
 *
 * Muting is remembered across visits. The AudioContext is only ever created
 * inside a user gesture (every cue is triggered by a click or key), so the
 * browser autoplay rules never block it.
 */

const STORE_KEY = 'discovery-voyage-sound';

// D Phrygian dominant (D Eb F# G A Bb C), plus the F natural the Andalusian
// cadence borrows, in Hz.
const NOTES = {
  d2: 73.42,
  d3: 146.83,
  eb3: 155.56,
  f3: 174.61,
  g3: 196.0,
  a3: 220.0,
  bb3: 233.08,
  c4: 261.63,
  d4: 293.66,
  eb4: 311.13,
  f4: 349.23,
  fs4: 369.99,
  g4: 392.0,
  a4: 440.0,
  bb4: 466.16,
  c5: 523.25,
  d5: 587.33,
  eb5: 622.25,
  f5: 698.46,
  fs5: 739.99,
  g5: 783.99,
  a5: 880.0,
  bb5: 932.33,
  c6: 1046.5,
  d6: 1174.66,
  eb6: 1244.51,
  fs6: 1479.98,
  a6: 1760.0,
};

/** Six-string voicings for the strums, low string first. */
const D_MAJOR = [NOTES.d3, NOTES.a3, NOTES.d4, NOTES.fs4, NOTES.a4, NOTES.d5];
const EB_MAJOR = [NOTES.eb3, NOTES.bb3, NOTES.eb4, NOTES.g4, NOTES.bb4, NOTES.eb5];
const F_MAJOR = [NOTES.f3, NOTES.c4, NOTES.f4, NOTES.a4, NOTES.c5, NOTES.f5];
const G_MINOR = [NOTES.g3, NOTES.d4, NOTES.g4, NOTES.bb4, NOTES.d5, NOTES.g5];

/**
 * One plucked triad per bet line, climbing the mode: D, Eb, Gm, A dim, Cm,
 * then the same an octave up, home on D.
 */
const LINE_TRIADS: [number, number, number][] = [
  [NOTES.d4, NOTES.fs4, NOTES.a4],
  [NOTES.eb4, NOTES.g4, NOTES.bb4],
  [NOTES.g4, NOTES.bb4, NOTES.d5],
  [NOTES.a4, NOTES.c5, NOTES.eb5],
  [NOTES.c5, NOTES.eb5, NOTES.g5],
  [NOTES.d5, NOTES.fs5, NOTES.a5],
  [NOTES.eb5, NOTES.g5, NOTES.bb5],
  [NOTES.g5, NOTES.bb5, NOTES.d6],
  [NOTES.a5, NOTES.c6, NOTES.eb6],
  [NOTES.d6, NOTES.fs6, NOTES.a6],
];

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
  /** every voice plays into this; it feeds the dry path and the cabin echo */
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

      // The cabin: one short slapback off wooden walls, its repeats thinned
      // at both ends, so the whole set sounds close and dry, aboard ship.
      const bus = ctx.createGain();
      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.085;
      const wood = ctx.createBiquadFilter();
      wood.type = 'bandpass';
      wood.frequency.value = 1100;
      wood.Q.value = 0.7;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.22;
      const wet = ctx.createGain();
      wet.gain.value = 0.2;
      bus.connect(master);
      bus.connect(delay);
      delay.connect(wood);
      wood.connect(feedback);
      feedback.connect(delay);
      wood.connect(wet);
      wet.connect(master);

      const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
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
    panner.pan.value = pan;
    node.connect(panner);
    panner.connect(this.bus);
  }

  /**
   * A plucked gut string, Karplus-Strong: one period of noise is fed round a
   * delay line whose every pass averages neighbouring samples, which rubs the
   * noise down into a decaying, ever purer tone. `bright` (0-1) softens the
   * pick by low-passing the burst. The loop is a whole number of samples
   * plus the half sample the average adds, so the playback rate trims the
   * pitch to the exact note.
   */
  private pluck(freq: number, dur: number, vol: number, when = 0, pan = 0, bright = 0.6): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const sr = ctx.sampleRate;
    const period = Math.max(2, Math.round(sr / freq - 0.5));
    const len = Math.ceil(sr * dur);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);

    // the pick: one period of softened noise, centred and scaled to full height
    let lp = 0;
    let mean = 0;
    const burst = Math.min(period, len);
    for (let i = 0; i < burst; i++) {
      lp += bright * (Math.random() * 2 - 1 - lp);
      d[i] = lp;
      mean += lp;
    }
    mean /= burst;
    let peak = 0;
    for (let i = 0; i < burst; i++) {
      d[i] -= mean;
      peak = Math.max(peak, Math.abs(d[i]));
    }
    if (peak > 0) for (let i = 0; i < burst; i++) d[i] /= peak;

    // the string: every pass loses a little, so the note dies away over `dur`
    const loss = Math.pow(0.001, 1 / (freq * dur));
    for (let i = period; i < len; i++) {
      d[i] = loss * 0.5 * (d[i - period] + d[Math.max(0, i - period - 1)]);
    }
    const fade = Math.min(len, Math.floor(sr * 0.03));
    for (let i = 0; i < fade; i++) d[len - 1 - i] *= i / fade;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = freq / (sr / (period + 0.5));
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(gain);
    this.out(gain, pan);
    src.start(ctx.currentTime + when);
  }

  /** A rasgueado: the whole chord swept by the fingers, low string first. */
  private strum(chord: number[], vol: number, when = 0, spread = 0.018, dur = 1.1): void {
    chord.forEach((f, i) =>
      this.pluck(f, dur, vol * (0.8 + (0.2 * i) / chord.length), when + i * spread, -0.25 + (0.5 * i) / (chord.length - 1), 0.75),
    );
  }

  /** The horn from the deck: two detuned sawtooths, the filter snapping open then closing. */
  private horn(freq: number, dur: number, vol: number, when = 0, pan = 0): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    a.type = 'sawtooth';
    b.type = 'sawtooth';
    a.frequency.setValueAtTime(freq, t);
    b.frequency.setValueAtTime(freq * 1.006, t);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.Q.value = 2;
    tone.frequency.setValueAtTime(freq * 1.5, t);
    tone.frequency.exponentialRampToValueAtTime(freq * 6, t + 0.06);
    tone.frequency.exponentialRampToValueAtTime(freq * 2.5, t + dur);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(vol, t + 0.05);
    amp.gain.setValueAtTime(vol, t + Math.max(0.06, dur - 0.25));
    amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
    a.connect(tone);
    b.connect(tone);
    tone.connect(amp);
    this.out(amp, pan);
    a.start(t);
    b.start(t);
    a.stop(t + dur + 0.05);
    b.stop(t + dur + 0.05);
  }

  /** The tambour: a falling sine thump with the slap of a hand on the skin. */
  private drum(vol: number, when = 0, pan = 0, pitch = 110): void {
    const ctx = this.ensure();
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, t);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.55, t + 0.18);
    const body = ctx.createGain();
    body.gain.setValueAtTime(vol, t);
    body.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    osc.connect(body);
    this.out(body, pan);
    osc.start(t);
    osc.stop(t + 0.26);

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1100;
    band.Q.value = 1.2;
    const slap = ctx.createGain();
    slap.gain.setValueAtTime(vol * 0.45, t);
    slap.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    src.connect(band);
    band.connect(slap);
    this.out(slap, pan);
    src.start(t, Math.random() * 1.8, 0.08);
  }

  /** Canvas snapping full of wind: a burst of high noise that rushes upward and dies. */
  private sail(dur: number, vol: number, when = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const air = ctx.createBiquadFilter();
    air.type = 'highpass';
    air.frequency.setValueAtTime(900, t);
    air.frequency.exponentialRampToValueAtTime(2600, t + dur);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(air);
    air.connect(amp);
    this.out(amp, 0);
    src.start(t, Math.random() * 1.4, dur + 0.05);
  }

  /** Timber under strain: a low sawtooth growl heard through a narrow, wandering band. */
  private creak(dur: number, vol: number, when = 0): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(38, t);
    osc.frequency.linearRampToValueAtTime(52, t + dur * 0.6);
    osc.frequency.linearRampToValueAtTime(44, t + dur);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 9;
    band.frequency.setValueAtTime(520, t);
    band.frequency.linearRampToValueAtTime(760, t + dur);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
    amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(band);
    band.connect(amp);
    this.out(amp, 0);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** UI button tap: one short, muted pluck. */
  click(): void {
    this.pluck(NOTES.a5, 0.12, 0.09, 0, 0, 0.35);
  }

  /** The spin: the sail snaps full, the hull creaks, a quick strum up the D chord. */
  spin(): void {
    this.sail(0.22, 0.16);
    this.creak(0.35, 0.05, 0.02);
    [NOTES.d3, NOTES.a3, NOTES.d4, NOTES.fs4].forEach((f, i) =>
      this.pluck(f, 0.7, 0.08, 0.03 + i * 0.022, -0.2 + i * 0.13, 0.55),
    );
  }

  /** One reel landing: the tambour from that reel's side, and its step up the mode. */
  reelStop(index: number): void {
    const notes = [NOTES.d4, NOTES.eb4, NOTES.fs4, NOTES.g4, NOTES.a4];
    const pan = reelPan(index);
    this.drum(0.2, 0, pan, 115 - index * 6);
    this.pluck(notes[index % notes.length], 0.5, 0.09, 0.005, pan, 0.5);
  }

  /** A galleon lands: a horn call from its reel, each one higher than the last. */
  galleonLand(n: number, reel: number): void {
    const calls = [NOTES.a3, NOTES.d4, NOTES.a4];
    const pan = reelPan(reel);
    this.horn(calls[Math.min(n, calls.length - 1)], 0.6, 0.075, 0.02, pan);
    this.drum(0.16, 0.02, pan, 80);
  }

  /** A winning line: its own plucked triad, climbing with the line number. */
  line(lineIndex: number): void {
    const [a, b, c] = LINE_TRIADS[lineIndex % LINE_TRIADS.length];
    this.pluck(a, 1.0, 0.16, 0, -0.2);
    this.pluck(b, 1.0, 0.14, 0.06, 0);
    this.pluck(c, 1.2, 0.14, 0.12, 0.2);
  }

  /** Three galleons: the fleet's horn call, answered by the full D chord. */
  scatter(): void {
    this.horn(NOTES.d4, 0.3, 0.08);
    this.horn(NOTES.a4, 0.3, 0.08, 0.16);
    this.horn(NOTES.d5, 0.9, 0.09, 0.32);
    this.strum(D_MAJOR, 0.13, 0.32);
    this.drum(0.22, 0.32, 0, 90);
  }

  /** The count-up: quick light plucks, alternating high and low across the stage. */
  countStart(): void {
    if (this.countTimer !== null || this.muted) return;
    let flip = false;
    this.countTimer = window.setInterval(() => {
      this.pluck(flip ? NOTES.a5 : NOTES.d6, 0.22, 0.07, 0, flip ? -0.15 : 0.15, 0.45);
      flip = !flip;
    }, 75);
  }

  countStop(): void {
    if (this.countTimer !== null) {
      clearInterval(this.countTimer);
      this.countTimer = null;
    }
  }

  /** BIG WIN: the drum rolls in, then the Andalusian cadence under a horn fanfare. */
  bigwin(): void {
    [0, 0.16, 0.29, 0.39, 0.47, 0.53].forEach((at, i) =>
      this.drum(0.12 + i * 0.025, at, i % 2 ? 0.3 : -0.3, 120),
    );
    [G_MINOR, F_MAJOR, EB_MAJOR, D_MAJOR].forEach((chord, i) =>
      this.strum(chord, 0.12, 0.55 + i * 0.3, 0.016, i === 3 ? 1.6 : 0.8),
    );
    this.horn(NOTES.d4, 0.25, 0.07, 0.55);
    this.horn(NOTES.fs4, 0.25, 0.07, 0.85);
    this.horn(NOTES.a4, 0.25, 0.07, 1.15);
    this.horn(NOTES.d5, 1.2, 0.09, 1.45);
    this.horn(NOTES.d3, 1.4, 0.06, 1.45);
  }

  /** The free games begin: timbers groan, the sails fill, and the horn calls land ho. */
  bonusStart(): void {
    this.creak(0.9, 0.06);
    this.sail(0.5, 0.14, 0.1);
    this.horn(NOTES.a3, 0.4, 0.08, 0.2);
    this.horn(NOTES.d4, 0.4, 0.08, 0.55);
    this.horn(NOTES.a4, 1.3, 0.09, 0.9);
    [0.2, 0.55, 0.9].forEach((at) => this.drum(0.2, at, 0, 95));
    this.strum(D_MAJOR, 0.12, 0.9);
    // and the lute runs up the Spanish scale to the octave
    [NOTES.d4, NOTES.eb4, NOTES.fs4, NOTES.g4, NOTES.a4, NOTES.bb4, NOTES.c5, NOTES.d5].forEach((f, i) =>
      this.pluck(f, 0.6, 0.12, 1.35 + i * 0.075, -0.3 + i * 0.08),
    );
  }

  /** Each free game rolls: a lighter snap of sail than the paid spins. */
  freeSpin(): void {
    this.sail(0.16, 0.1);
    this.pluck(NOTES.a4, 0.4, 0.07, 0.02, 0, 0.5);
  }

  /** More free games: the horn calls twice and the strings answer. */
  retrigger(): void {
    this.horn(NOTES.a4, 0.3, 0.08);
    this.horn(NOTES.d5, 0.8, 0.09, 0.18);
    this.strum(D_MAJOR, 0.12, 0.18);
    this.drum(0.2, 0.18, 0, 95);
  }

  /** Free games over: the lute walks down the scale home to D as the ship docks. */
  bonusEnd(): void {
    [NOTES.d5, NOTES.c5, NOTES.bb4, NOTES.a4, NOTES.g4, NOTES.fs4, NOTES.eb4].forEach((f, i) =>
      this.pluck(f, 0.6, 0.12, i * 0.09, 0.3 - i * 0.08),
    );
    this.strum(D_MAJOR, 0.12, 0.66, 0.025, 1.8);
    this.horn(NOTES.d3, 1.4, 0.07, 0.66);
    this.drum(0.18, 0.66, 0, 85);
    this.creak(0.7, 0.05, 0.9);
  }
}

export const sound = new SoundBank();
