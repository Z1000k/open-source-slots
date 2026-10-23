/**
 * The soundtrack: a synthesized bell-and-shimmer set, generated in WebAudio so
 * the game ships zero audio files. Where the older cabinets in this casino
 * bleep in square waves, STELLAR SEVENS rings: every cue is built from struck
 * bells (a fundamental plus an inharmonic 2.76 partial, the classic tubular
 * ratio) over airy high-passed noise, tuned to an A major pentatonic so
 * nothing ever clashes with anything else playing.
 *
 * Muting is remembered across visits. The AudioContext is only ever created
 * inside a user gesture (every cue is triggered by a click or key), so the
 * browser autoplay rules never block it.
 */

const STORE_KEY = 'stellar-sevens-sound';

/** A major pentatonic, the ladder every melodic cue climbs. */
const PENT = [440, 495, 550, 660, 740, 880, 990, 1100, 1320, 1480];

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
   * A struck bell: fundamental, its octave, and an inharmonic partial that
   * dies away fastest. This is the signature voice of the game.
   */
  private bell(freq: number, dur: number, vol: number, when = 0): void {
    this.note('sine', freq, dur, vol, when);
    this.note('sine', freq * 2, dur * 0.6, vol * 0.35, when);
    this.note('sine', freq * 2.76, dur * 0.35, vol * 0.22, when);
  }

  /** A burst of shaped noise. Low-passed for thuds, high-passed for shimmer. */
  private noise(
    dur: number,
    vol: number,
    filterFreq: number,
    when = 0,
    type: BiquadFilterType = 'lowpass',
  ): void {
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
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  /** UI button blip: one tiny bell tap. */
  click(): void {
    this.bell(1320, 0.07, 0.1);
  }

  /** The launch: a rising sine sweep under a wash of starfield hiss. */
  spin(): void {
    this.note('sine', 180, 0.42, 0.16, 0, 560);
    this.note('triangle', 360, 0.32, 0.07, 0.02, 1120);
    this.noise(0.5, 0.05, 3200, 0, 'highpass');
  }

  /** One reel settling: a bell that rings lower as the reels fill in. */
  reelStop(index: number): void {
    this.bell(660 - index * 110, 0.3, 0.22);
    this.noise(0.04, 0.07, 5000, 0, 'highpass');
  }

  /** A winning line: a three-step pentatonic bell run, higher per line. */
  line(lineIndex: number): void {
    const base = lineIndex % 3;
    [0, 2, 4].forEach((step, i) => {
      this.bell(PENT[base + step], 0.3, 0.13, i * 0.1);
    });
  }

  /** Every line at once: a shimmering run all the way up the ladder. */
  fullScreen(): void {
    PENT.forEach((f, i) => this.bell(f, 0.36, 0.09, i * 0.06));
    this.noise(0.9, 0.05, 4000, 0, 'highpass');
  }

  /** The count-up: a soft alternating tick; runs until countStop(). */
  countStart(): void {
    if (this.countTimer !== null || this.muted) return;
    let flip = false;
    this.countTimer = window.setInterval(() => {
      this.note('sine', flip ? 1320 : 1100, 0.05, 0.07);
      flip = !flip;
    }, 62);
  }

  countStop(): void {
    if (this.countTimer !== null) {
      clearInterval(this.countTimer);
      this.countTimer = null;
    }
  }

  /** The BIG WIN fanfare: bells climbing the pentatonic, then a held peak. */
  bigwin(): void {
    const seq = [0, 2, 4, 5, 7, 5, 7, 9];
    seq.forEach((step, i) => {
      this.bell(PENT[step], 0.4, 0.12, i * 0.13);
      this.note('triangle', PENT[step] / 2, 0.3, 0.06, i * 0.13);
    });
    this.bell(PENT[9] * 2, 0.9, 0.13, seq.length * 0.13);
    this.noise(1.2, 0.04, 5000, seq.length * 0.13, 'highpass');
  }
}

export const sound = new SoundBank();
