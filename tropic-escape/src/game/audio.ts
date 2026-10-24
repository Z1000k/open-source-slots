/**
 * The soundtrack: a synthesized "island" set in WebAudio, so the game ships
 * zero audio files. Its own kit, shared with none of our other slots: struck
 * steel-pan voices (fundamental plus a strong octave and a slightly sharp
 * third partial), soft marimba wood, rolling surf noise that swells instead
 * of decaying, and gull whistles. Motifs sit in C major pentatonic, which is
 * why nothing here can sound sour however the cues overlap.
 *
 * Muting is remembered across visits. The AudioContext is only ever created
 * inside a user gesture (every cue is triggered by a click or key), so the
 * browser autoplay rules never block it.
 */

const STORE_KEY = 'tropic-escape-sound';

// C major pentatonic (C D E G A) plus the low anchors, in Hz.
const NOTES = {
  c2: 65.41,
  g2: 98.0,
  c3: 130.81,
  e3: 164.81,
  g3: 196.0,
  a3: 220.0,
  c4: 261.63,
  d4: 293.66,
  e4: 329.63,
  g4: 392.0,
  a4: 440.0,
  c5: 523.25,
  d5: 587.33,
  e5: 659.25,
  g5: 783.99,
  a5: 880.0,
  c6: 1046.5,
  e6: 1318.51,
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
      this.master.gain.value = 0.42;
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
   * A struck steel pan: the fundamental, a loud octave, and a third partial
   * pulled slightly sharp. That sharp partial is the whole character of the
   * instrument, and it is what keeps this kit clear of our other games.
   */
  private pan(freq: number, dur: number, vol: number, when = 0): void {
    this.note('sine', freq, dur, vol * 0.7, when);
    this.note('sine', freq * 2, dur * 0.8, vol * 0.55, when);
    this.note('sine', freq * 3.02, dur * 0.45, vol * 0.3, when);
    this.note('triangle', freq * 4.05, dur * 0.18, vol * 0.16, when);
  }

  /** Soft marimba wood: fundamental with the hollow fourth partial. */
  private wood(freq: number, dur: number, vol: number, when = 0): void {
    this.note('sine', freq, dur, vol, when);
    this.note('sine', freq * 4, dur * 0.25, vol * 0.2, when);
  }

  /**
   * Filtered noise. `swell` makes it rise and fall like a wave breaking
   * instead of decaying like a hit, which is what the sea needs.
   */
  private noise(dur: number, vol: number, filterFreq: number, when = 0, swell = false): void {
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
    filter.frequency.setValueAtTime(filterFreq, t);
    const gain = ctx.createGain();
    if (swell) {
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + dur * 0.45);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      filter.frequency.exponentialRampToValueAtTime(filterFreq * 0.4, t + dur);
    } else {
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    }
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  /** A gull whistle: a thin sine sliding up and away. */
  private gull(from: number, to: number, dur: number, vol: number, when = 0): void {
    this.note('sine', from, dur, vol, when, to);
  }

  /** UI button tap: a small marimba tick. */
  click(): void {
    this.wood(NOTES.g5, 0.06, 0.1);
  }

  /** The spin: a wave breaking under a rising pan run. */
  spin(): void {
    this.noise(0.45, 0.12, 1400, 0, true);
    this.note('sine', 150, 0.3, 0.1, 0, 90);
    this.wood(NOTES.c5, 0.1, 0.06);
    this.wood(NOTES.g5, 0.1, 0.05, 0.06);
  }

  /** One reel landing: a wooden deck thud, deeper the further right it is. */
  reelStop(index: number): void {
    this.wood(200 - index * 14, 0.12, 0.26);
    this.noise(0.05, 0.1, 900);
  }

  /** A winning line: a three-note pan figure, higher on the later lines. */
  line(lineIndex: number): void {
    const roots = [NOTES.c4, NOTES.d4, NOTES.e4, NOTES.g4, NOTES.a4];
    const root = roots[lineIndex % roots.length] * (lineIndex >= 5 ? 2 : 1);
    this.pan(root, 0.3, 0.16);
    this.pan(root * 1.25, 0.3, 0.13, 0.09); // major third
    this.pan(root * 1.5, 0.42, 0.13, 0.18); // fifth
  }

  /** A BANANA doubled the line: the same note struck twice, an octave up. */
  wildDouble(): void {
    this.pan(NOTES.c5, 0.22, 0.15);
    this.pan(NOTES.c6, 0.35, 0.14, 0.1);
    this.noise(0.12, 0.05, 5000, 0.1);
  }

  /** Scatter suitcases: gulls over a long swell, with a bright pan chord. */
  scatter(): void {
    this.noise(0.9, 0.12, 2000, 0, true);
    this.gull(NOTES.e5, NOTES.c6, 0.28, 0.09);
    this.gull(NOTES.g5, NOTES.e6, 0.3, 0.08, 0.22);
    this.pan(NOTES.c5, 0.5, 0.14, 0.1);
    this.pan(NOTES.e5, 0.5, 0.12, 0.2);
    this.pan(NOTES.g5, 0.7, 0.12, 0.3);
  }

  /** The count-up: quick alternating marimba ticks. */
  countStart(): void {
    if (this.countTimer !== null || this.muted) return;
    let flip = false;
    this.countTimer = window.setInterval(() => {
      this.wood(flip ? NOTES.c5 : NOTES.g5, 0.05, 0.07);
      flip = !flip;
    }, 70);
  }

  countStop(): void {
    if (this.countTimer !== null) {
      clearInterval(this.countTimer);
      this.countTimer = null;
    }
  }

  /** BIG WIN: a pan fanfare climbing the pentatonic over a big swell. */
  bigwin(): void {
    this.noise(1.6, 0.14, 2400, 0, true);
    const seq = [NOTES.c4, NOTES.e4, NOTES.g4, NOTES.a4, NOTES.c5, NOTES.e5, NOTES.g5];
    seq.forEach((f, i) => {
      this.pan(f, 0.3, 0.15, i * 0.13);
      this.note('sine', f / 2, 0.3, 0.08, i * 0.13);
    });
    this.pan(NOTES.c6, 0.9, 0.14, seq.length * 0.13);
    this.note('sine', NOTES.c2, 1.4, 0.22, seq.length * 0.13);
  }

  /** The free games begin: the tide comes in, then a full island riff. */
  bonusStart(): void {
    this.noise(1.6, 0.16, 2600, 0, true);
    this.note('sine', NOTES.c2, 1.8, 0.24);
    [NOTES.c4, NOTES.e4, NOTES.g4, NOTES.a4, NOTES.c5].forEach((f, i) =>
      this.pan(f, 0.42, 0.16, 0.35 + i * 0.16),
    );
    this.gull(NOTES.a5, NOTES.e6, 0.4, 0.09, 1.15);
    this.pan(NOTES.e5, 0.9, 0.14, 1.2);
  }

  /** Each free game rolls: a lighter wave than the paid spins. */
  freeSpin(): void {
    this.noise(0.32, 0.09, 1800, 0, true);
    this.wood(NOTES.e5, 0.08, 0.06);
  }

  /** More free games: three rising pan strikes and a gull. */
  retrigger(): void {
    this.pan(NOTES.g4, 0.4, 0.18);
    this.pan(NOTES.c5, 0.4, 0.18, 0.16);
    this.pan(NOTES.e5, 0.8, 0.2, 0.32);
    this.gull(NOTES.c6, NOTES.e6, 0.35, 0.08, 0.34);
  }

  /** Free games over: the riff resolving home over a last long swell. */
  bonusEnd(): void {
    this.noise(1.3, 0.12, 2000, 0, true);
    this.pan(NOTES.a4, 0.35, 0.15);
    this.pan(NOTES.g4, 0.35, 0.14, 0.16);
    this.pan(NOTES.e4, 0.4, 0.14, 0.32);
    this.pan(NOTES.c5, 1.0, 0.17, 0.52);
    this.pan(NOTES.g5, 1.0, 0.12, 0.52);
    this.note('sine', NOTES.c3, 1.3, 0.2, 0.52);
  }
}

export const sound = new SoundBank();
