/**
 * The soundtrack: a synthesized "country barn" set in WebAudio, so the game
 * ships zero audio files. Its own palette, deliberately not reusing anything
 * from our other slots: plucked banjo-ish sawtooth voices in G major, wood
 * blocks and cowbell for percussion, and dry rustles and thumps for the
 * avalanche, where the temple slot used soft sines and gongs in D minor and
 * the fruit slots used square bleeps.
 *
 * Muting is remembered across visits. The AudioContext is only ever created
 * inside a user gesture (every cue is triggered by a click or key), so the
 * browser autoplay rules never block it.
 */

const STORE_KEY = 'bumper-crop-sound';

// G major degrees used by the cues, in Hz.
const NOTES = {
  g2: 98.0,
  d3: 146.83,
  g3: 196.0,
  b3: 246.94,
  d4: 293.66,
  e4: 329.63,
  g4: 392.0,
  a4: 440.0,
  b4: 493.88,
  d5: 587.33,
  e5: 659.26,
  g5: 783.99,
  b5: 987.77,
  d6: 1174.66,
};

class SoundBank {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private countTimer: number | null = null;
  muted = localStorage.getItem(STORE_KEY) === 'off';

  /** Flip sound on/off; returns the new muted state. */
  toggle(): boolean {
    this.muted = !this.muted;
    localStorage.setItem(STORE_KEY, this.muted ? 'off' : 'on');
    if (this.muted) this.countStop();
    return this.muted;
  }

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.4;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** One decaying oscillator note, optionally gliding to a second pitch. */
  private note(
    type: OscillatorType,
    freq: number,
    dur: number,
    vol: number,
    when = 0,
    glideTo?: number,
  ): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /**
   * A plucked string: bright sawtooth through a falling lowpass, which is what
   * gives the banjo/dulcimer twang the rest of the kit is built around.
   */
  private pluck(freq: number, dur: number, vol: number, when = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);
    filter.type = 'lowpass';
    filter.Q.value = 6;
    filter.frequency.setValueAtTime(Math.min(9000, freq * 9), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(220, freq * 1.6), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** A hollow wood block: short, pitched, percussive. */
  private wood(freq: number, vol: number, when = 0): void {
    this.note('square', freq, 0.045, vol * 0.5, when);
    this.note('sine', freq * 0.5, 0.07, vol, when);
    this.noise(0.02, vol * 0.4, 4000, when);
  }

  /** A cowbell: two detuned squares, metallic and dry. */
  private cowbell(freq: number, dur: number, vol: number, when = 0): void {
    this.note('square', freq, dur, vol * 0.5, when);
    this.note('square', freq * 1.4983, dur, vol * 0.4, when);
  }

  /** A short burst of filtered noise (straw, husks, dirt, thumps). */
  private noise(dur: number, vol: number, filterFreq: number, when = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + when;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  /** UI button tap: a dry wood block. */
  click(): void {
    this.wood(760, 0.1);
  }

  /** The spin: a hand crank turning, husks rushing. */
  spin(): void {
    this.noise(0.42, 0.11, 1400);
    this.note('sawtooth', 130, 0.3, 0.06, 0, 190);
    this.wood(420, 0.12);
  }

  /** One column landing: a crate hitting the boards, deeper per column. */
  reelStop(index: number): void {
    this.note('sine', 128 - index * 7, 0.13, 0.3);
    this.noise(0.08, 0.16, 700);
    this.wood(300 - index * 14, 0.12);
  }

  /**
   * A paying fall. Each step of an avalanche pushes the little banjo figure a
   * scale degree higher, so a long chain climbs as it goes.
   */
  win(chain: number): void {
    const scale = [NOTES.g4, NOTES.a4, NOTES.b4, NOTES.d5, NOTES.e5, NOTES.g5, NOTES.b5];
    const root = scale[Math.min(chain, scale.length - 1)];
    this.pluck(root, 0.22, 0.16);
    this.pluck(root * 1.26, 0.2, 0.13, 0.07); // major third
    this.pluck(root * 1.498, 0.28, 0.12, 0.14); // fifth
  }

  /** Winning crops bursting out of the crates. */
  pop(): void {
    this.noise(0.09, 0.2, 2600);
    this.note('triangle', 900, 0.07, 0.1, 0, 1500);
  }

  /** Produce tumbling down into the gaps. */
  drop(): void {
    this.noise(0.16, 0.16, 900);
    this.note('sine', 200, 0.14, 0.16, 0.06, 120);
    this.wood(260, 0.14, 0.1);
  }

  /** Tractors: a horn honk over a chugging engine. */
  scatter(): void {
    this.cowbell(NOTES.b4, 0.3, 0.16);
    this.cowbell(NOTES.d5, 0.4, 0.15, 0.16);
    this.note('sawtooth', NOTES.g2, 0.6, 0.12, 0, NOTES.d3);
    this.noise(0.5, 0.1, 500, 0.05);
  }

  /** The count-up: a ticking ratchet on the money meter. */
  countStart(): void {
    if (this.countTimer !== null || this.muted) return;
    let flip = false;
    this.countTimer = window.setInterval(() => {
      this.wood(flip ? 900 : 1150, 0.05);
      flip = !flip;
    }, 70);
  }

  countStop(): void {
    if (this.countTimer !== null) {
      clearInterval(this.countTimer);
      this.countTimer = null;
    }
  }

  /** BIG WIN: a full hoedown run up the G scale with cowbells on top. */
  bigwin(): void {
    const seq = [NOTES.g3, NOTES.b3, NOTES.d4, NOTES.g4, NOTES.b4, NOTES.d5, NOTES.g5];
    this.note('sine', NOTES.g2, 1.6, 0.24);
    seq.forEach((f, i) => {
      this.pluck(f, 0.26, 0.17, i * 0.12);
      this.note('triangle', f * 2, 0.16, 0.06, i * 0.12);
    });
    this.cowbell(NOTES.g5, 0.5, 0.16, seq.length * 0.12);
    this.cowbell(NOTES.d6, 0.7, 0.14, seq.length * 0.12 + 0.14);
  }

  /** The barn ladder opens: a big door, then a rising call. */
  bonusStart(): void {
    this.noise(0.6, 0.16, 400);
    this.note('sine', NOTES.g2, 1.4, 0.22);
    [NOTES.g3, NOTES.b3, NOTES.d4, NOTES.g4].forEach((f, i) =>
      this.pluck(f, 0.4, 0.17, 0.25 + i * 0.2),
    );
    this.cowbell(NOTES.b4, 0.6, 0.14, 1.1);
  }

  /** A crate opening on the ladder; gold ones ring brighter. */
  ladderPrize(gold: boolean): void {
    this.noise(0.06, 0.14, 3000);
    if (gold) {
      this.pluck(NOTES.d5, 0.26, 0.16);
      this.pluck(NOTES.g5, 0.3, 0.14, 0.08);
    } else {
      this.pluck(NOTES.b4, 0.2, 0.14);
    }
  }

  /** A multiplier crate: a bright cowbell double. */
  ladderMult(): void {
    this.cowbell(NOTES.g5, 0.24, 0.16);
    this.cowbell(NOTES.b5, 0.34, 0.15, 0.12);
  }

  /** Climbing to the next floor: a quick run up the ladder. */
  ladderClimb(): void {
    [NOTES.g4, NOTES.b4, NOTES.d5].forEach((f, i) => this.wood(f, 0.13, i * 0.07));
    this.pluck(NOTES.g5, 0.3, 0.12, 0.2);
  }

  /** The spilled bucket ends it: a clatter and a sagging note. */
  ladderBust(): void {
    this.noise(0.3, 0.2, 1800);
    this.note('sawtooth', NOTES.g3, 0.5, 0.14, 0, NOTES.g2);
    this.wood(180, 0.16, 0.12);
    this.wood(150, 0.12, 0.24);
  }

  /** The ladder is done: a warm closing cadence. */
  bonusEnd(): void {
    this.pluck(NOTES.d4, 0.3, 0.15);
    this.pluck(NOTES.e4, 0.3, 0.14, 0.14);
    this.pluck(NOTES.g4, 0.5, 0.16, 0.28);
    this.pluck(NOTES.b4, 0.7, 0.14, 0.44);
    this.pluck(NOTES.d5, 0.9, 0.13, 0.44);
    this.note('sine', NOTES.g2, 1.2, 0.2, 0.44);
  }
}

export const sound = new SoundBank();
