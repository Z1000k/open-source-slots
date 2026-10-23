/**
 * The soundtrack: a synthesized retro bleep set, true to the classic fruit
 * cabinets, generated in WebAudio so the game ships zero audio files. Every
 * cue is built from oscillators and filtered noise at call time; the whole
 * module costs nothing on the wire.
 *
 * Muting is remembered across visits. The AudioContext is only ever created
 * inside a user gesture (every cue is triggered by a click or key), so the
 * browser autoplay rules never block it.
 */

const STORE_KEY = 'scorching-hot-sound';

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

  /** A short burst of filtered noise (thuds, whooshes). */
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

  /** UI button blip. */
  click(): void {
    this.note('square', 900, 0.05, 0.12);
  }

  /** The lever throw: a falling whoosh under a bright chirp. */
  spin(): void {
    this.note('square', 620, 0.09, 0.14, 0, 880);
    this.noise(0.3, 0.1, 1400);
    this.note('sine', 220, 0.28, 0.12, 0.02, 90);
  }

  /** One reel thudding home; pitch rises slightly across the stops. */
  reelStop(index: number): void {
    this.note('sine', 130 + index * 14, 0.09, 0.3);
    this.noise(0.05, 0.16, 900);
  }

  /** A winning line: three-note rising arpeggio, rooted per line. */
  line(lineIndex: number): void {
    const root = 480 + lineIndex * 55;
    this.note('square', root, 0.09, 0.11);
    this.note('square', root * 1.25, 0.09, 0.11, 0.09);
    this.note('square', root * 1.5, 0.16, 0.11, 0.18);
  }

  /** Scatter stars: a high sparkle run. */
  scatter(): void {
    [1180, 1480, 1760, 2350].forEach((f, i) => this.note('triangle', f, 0.14, 0.1, i * 0.07));
  }

  /** The classic rapid count-up beeping; runs until countStop(). */
  countStart(): void {
    if (this.countTimer !== null || this.muted) return;
    let flip = false;
    this.countTimer = window.setInterval(() => {
      this.note('square', flip ? 1040 : 880, 0.04, 0.08);
      flip = !flip;
    }, 62);
  }

  countStop(): void {
    if (this.countTimer !== null) {
      clearInterval(this.countTimer);
      this.countTimer = null;
    }
  }

  /** The BIG WIN fanfare: an ascending major arpeggio with a crown note. */
  bigwin(): void {
    const seq = [523, 659, 784, 1046, 784, 1046, 1318];
    seq.forEach((f, i) => {
      this.note('square', f, 0.22, 0.12, i * 0.13);
      this.note('triangle', f / 2, 0.22, 0.1, i * 0.13);
    });
    this.note('square', 1568, 0.6, 0.12, seq.length * 0.13);
  }
}

export const sound = new SoundBank();
