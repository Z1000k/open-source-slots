/**
 * The soundtrack: a synthesized "temple" set in WebAudio, so the game ships
 * zero audio files. Deliberately NOT the retro square-bleep kit of our fruit
 * slots: this one is built on soft triangle and sine voices, detuned pairs,
 * low gongs and sand-noise, with motifs in D minor for the desert mood.
 *
 * Muting is remembered across visits. The AudioContext is only ever created
 * inside a user gesture (every cue is triggered by a click or key), so the
 * browser autoplay rules never block it.
 */

const STORE_KEY = 'golden-papyrus-sound';

// D natural/harmonic minor degrees used by the cues, in Hz (D3 base).
const D3 = 146.83;
const NOTES = {
  d3: D3,
  f3: 174.61,
  a3: 220.0,
  d4: 293.66,
  e4: 329.63,
  f4: 349.23,
  g4: 392.0,
  a4: 440.0,
  cs5: 554.37,
  d5: 587.33,
  f5: 698.46,
  a5: 880.0,
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
   * A detuned pair of soft voices on one pitch: the slight beat between them
   * is what makes the temple chords shimmer instead of bleep.
   */
  private voice(freq: number, dur: number, vol: number, when = 0): void {
    this.note('triangle', freq * 0.997, dur, vol * 0.6, when);
    this.note('sine', freq * 1.004, dur, vol * 0.5, when);
  }

  /** A low gong: deep sine fundamental, a soft fifth, and a noise ping. */
  private gong(freq: number, dur: number, vol: number, when = 0): void {
    this.note('sine', freq, dur, vol, when);
    this.note('sine', freq * 1.5, dur * 0.7, vol * 0.35, when);
    this.noise(0.06, vol * 0.5, freq * 6, when);
  }

  /** A short burst of filtered noise (sand, stone, page turns). */
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

  /** UI button tap: a soft wooden tick. */
  click(): void {
    this.note('triangle', 520, 0.06, 0.1);
    this.noise(0.03, 0.06, 2200);
  }

  /** The spin: sand rushing over stone under a low falling drone. */
  spin(): void {
    this.noise(0.4, 0.12, 900);
    this.note('sine', 180, 0.35, 0.14, 0, 70);
    this.note('triangle', NOTES.d4, 0.12, 0.07, 0, NOTES.a3);
  }

  /** One reel grinding home: a stone block thud, deeper per reel. */
  reelStop(index: number): void {
    this.note('sine', 110 - index * 6, 0.12, 0.32);
    this.noise(0.07, 0.14, 500);
  }

  /** A winning line: a plucked harp figure in D minor, rising per line. */
  line(lineIndex: number): void {
    const roots = [NOTES.d4, NOTES.e4, NOTES.f4, NOTES.g4, NOTES.a4];
    const root = roots[lineIndex % roots.length] * (lineIndex >= 5 ? 2 : 1);
    this.voice(root, 0.14, 0.14);
    this.voice(root * 1.189, 0.14, 0.13, 0.1); // minor third
    this.voice(root * 1.498, 0.24, 0.13, 0.2); // fifth
  }

  /** Scatter papyri: a slow mystic shimmer sliding upward. */
  scatter(): void {
    this.voice(NOTES.a4, 0.5, 0.12);
    this.voice(NOTES.d5, 0.5, 0.11, 0.12);
    this.voice(NOTES.f5, 0.6, 0.1, 0.24);
    this.note('sine', NOTES.a5, 0.7, 0.07, 0.36, NOTES.d6);
    this.gong(NOTES.d3, 1.1, 0.22, 0.05);
  }

  /** The count-up: soft muffled temple ticks, two alternating low bells. */
  countStart(): void {
    if (this.countTimer !== null || this.muted) return;
    let flip = false;
    this.countTimer = window.setInterval(() => {
      this.note('triangle', flip ? NOTES.d5 : NOTES.a4, 0.05, 0.07);
      flip = !flip;
    }, 72);
  }

  countStop(): void {
    if (this.countTimer !== null) {
      clearInterval(this.countTimer);
      this.countTimer = null;
    }
  }

  /** BIG WIN: a harmonic-minor fanfare over a big gong, ending on the high D. */
  bigwin(): void {
    const seq = [NOTES.d4, NOTES.f4, NOTES.a4, NOTES.d5, NOTES.cs5, NOTES.d5, NOTES.f5];
    this.gong(NOTES.d3 / 2, 1.6, 0.3);
    seq.forEach((f, i) => {
      this.voice(f, 0.26, 0.14, i * 0.14);
      this.note('sine', f / 2, 0.26, 0.09, i * 0.14);
    });
    this.voice(NOTES.a5, 0.8, 0.12, seq.length * 0.14);
    this.gong(NOTES.d3, 1.4, 0.26, seq.length * 0.14);
  }

  /** A page of the papyrus turning (book opens, symbol reveal build-up). */
  pageFlip(when = 0): void {
    this.noise(0.09, 0.14, 3200, when);
    this.noise(0.14, 0.1, 1600, when + 0.06);
  }

  /** The free games begin: temple doors, a rising minor call, a gong. */
  bonusStart(): void {
    this.gong(NOTES.d3 / 2, 2.0, 0.32);
    this.noise(0.5, 0.1, 700, 0.05);
    [NOTES.d4, NOTES.f4, NOTES.a4, NOTES.d5].forEach((f, i) => this.voice(f, 0.4, 0.15, 0.3 + i * 0.22));
    this.voice(NOTES.f5, 0.9, 0.13, 1.25);
  }

  /** The chosen expanding symbol is revealed: one held mystic chord. */
  esReveal(): void {
    this.pageFlip();
    this.pageFlip(0.18);
    this.voice(NOTES.d4, 1.0, 0.16, 0.3);
    this.voice(NOTES.a4, 1.0, 0.14, 0.34);
    this.voice(NOTES.f5, 1.2, 0.12, 0.38);
    this.gong(NOTES.d3, 1.2, 0.2, 0.3);
  }

  /** The symbol spreads across the reels: a rising sweep into shimmer. */
  expand(): void {
    this.note('sine', NOTES.d4, 0.5, 0.12, 0, NOTES.d5);
    this.voice(NOTES.d5, 0.4, 0.12, 0.32);
    this.voice(NOTES.f5, 0.5, 0.11, 0.44);
    this.voice(NOTES.a5, 0.6, 0.1, 0.56);
  }

  /** More free games: three quick gong strikes. */
  retrigger(): void {
    this.gong(NOTES.d3, 0.5, 0.26);
    this.gong(NOTES.f3, 0.5, 0.26, 0.18);
    this.gong(NOTES.a3, 0.9, 0.28, 0.36);
  }

  /** Free games over: the minor motif resolving to a bright major close. */
  bonusEnd(): void {
    this.voice(NOTES.d4, 0.35, 0.14);
    this.voice(NOTES.f4, 0.35, 0.13, 0.14);
    this.voice(NOTES.a4, 0.4, 0.13, 0.28);
    // picardy: F sharp instead of F for the final chord
    this.voice(NOTES.d5, 0.9, 0.15, 0.5);
    this.voice(NOTES.f5 * 1.0595, 0.9, 0.12, 0.5);
    this.voice(NOTES.a5, 0.9, 0.1, 0.5);
    this.gong(NOTES.d3, 1.2, 0.24, 0.5);
  }
}

export const sound = new SoundBank();
