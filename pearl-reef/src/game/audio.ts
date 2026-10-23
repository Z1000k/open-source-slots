/**
 * The soundtrack: a synthesized "under the reef" set in WebAudio, so the game
 * ships zero audio files. Its own kit, shared with none of our other slots:
 *
 *   - glass: a sine carrier bent by a second sine at a non-integer ratio (FM),
 *     whose brightness dies faster than the note, like struck glass or a
 *     celesta. Every other slot of ours builds its voices from added partials;
 *     this is the only frequency-modulated one.
 *   - bubbles: sines that shoot UP in pitch as they vanish.
 *   - current: band-passed noise whose band sweeps, water moving rather than
 *     a wave breaking.
 *   - whale: a slow low glide with a little vibrato, for the big moments.
 *
 * Everything runs through a short, dark feedback echo that puts the whole set
 * under water. Motifs sit in E Lydian, whose raised fourth gives the floating,
 * not-quite-earthly colour; the fruit slots used C and A major pentatonic, the
 * temple D minor, the barn G major.
 *
 * Muting is remembered across visits. The AudioContext is only ever created
 * inside a user gesture (every cue is triggered by a click or key), so the
 * browser autoplay rules never block it.
 */

const STORE_KEY = 'pearl-reef-sound';

// E Lydian (E F# G# A# B C# D#) plus the low anchors, in Hz.
const NOTES = {
  e2: 82.41,
  b2: 123.47,
  e3: 164.81,
  gs3: 207.65,
  b3: 246.94,
  e4: 329.63,
  fs4: 369.99,
  gs4: 415.3,
  as4: 466.16,
  b4: 493.88,
  cs5: 554.37,
  ds5: 622.25,
  e5: 659.25,
  fs5: 739.99,
  gs5: 830.61,
  as5: 932.33,
  b5: 987.77,
  cs6: 1108.73,
  ds6: 1244.51,
  e6: 1318.51,
};

/**
 * One triad per bet line, climbing the scale: the chords E Lydian keeps
 * (E, F#, G#m, B, C#m), then the same five an octave up.
 */
const LINE_TRIADS: [number, number, number][] = [
  [NOTES.e4, NOTES.gs4, NOTES.b4],
  [NOTES.fs4, NOTES.as4, NOTES.cs5],
  [NOTES.gs4, NOTES.b4, NOTES.ds5],
  [NOTES.b4, NOTES.ds5, NOTES.fs5],
  [NOTES.cs5, NOTES.e5, NOTES.gs5],
  [NOTES.e5, NOTES.gs5, NOTES.b5],
  [NOTES.fs5, NOTES.as5, NOTES.cs6],
  [NOTES.gs5, NOTES.b5, NOTES.ds6],
  [NOTES.b5, NOTES.ds6, NOTES.fs5 * 2],
  [NOTES.cs6, NOTES.e6, NOTES.gs5 * 2],
];

class SoundBank {
  private ctx: AudioContext | null = null;
  /** every voice plays into this; it feeds the dry path and the echo */
  private bus: GainNode | null = null;
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
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = 0.42;
      master.connect(ctx.destination);

      // The water: a short echo whose repeats lose their top end, so every
      // cue trails off the way sound does under the surface.
      const bus = ctx.createGain();
      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.19;
      const dark = ctx.createBiquadFilter();
      dark.type = 'lowpass';
      dark.frequency.value = 1600;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.3;
      const wet = ctx.createGain();
      wet.gain.value = 0.24;
      bus.connect(master);
      bus.connect(delay);
      delay.connect(dark);
      dark.connect(feedback);
      feedback.connect(delay);
      dark.connect(wet);
      wet.connect(master);

      this.ctx = ctx;
      this.bus = bus;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** One decaying sine, optionally gliding to a second pitch. */
  private tone(freq: number, dur: number, vol: number, when = 0, glideTo?: number): void {
    const ctx = this.ensure();
    if (!ctx || !this.bus) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (glideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /**
   * Struck glass: an FM pair. The modulator sits at a non-integer ratio, which
   * is what makes the tone glassy instead of organ-like, and its depth decays
   * to almost nothing in half the note, so the strike is bright and the tail
   * pure.
   */
  private glass(freq: number, dur: number, vol: number, when = 0, ratio = 3.5, depth = 1.4): void {
    const ctx = this.ensure();
    if (!ctx || !this.bus) return;
    const t = ctx.currentTime + when;
    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modDepth = ctx.createGain();
    const amp = ctx.createGain();
    carrier.type = 'sine';
    mod.type = 'sine';
    carrier.frequency.setValueAtTime(freq, t);
    mod.frequency.setValueAtTime(freq * ratio, t);
    modDepth.gain.setValueAtTime(freq * depth, t);
    modDepth.gain.exponentialRampToValueAtTime(freq * 0.02, t + dur * 0.5);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(vol, t + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
    mod.connect(modDepth);
    modDepth.connect(carrier.frequency);
    carrier.connect(amp);
    amp.connect(this.bus);
    carrier.start(t);
    mod.start(t);
    carrier.stop(t + dur + 0.05);
    mod.stop(t + dur + 0.05);
  }

  /** An air bubble: a short sine shooting up in pitch as it pops. */
  private bubble(freq: number, vol: number, when = 0): void {
    this.tone(freq, 0.07, vol, when, freq * 2.6);
  }

  /** A little cloud of bubbles, `n` of them over `spread` seconds. */
  private bubbles(n: number, vol: number, spread: number, when = 0, low = 480, high = 1300): void {
    for (let i = 0; i < n; i++) {
      this.bubble(low + Math.random() * (high - low), vol * (0.6 + Math.random() * 0.4), when + Math.random() * spread);
    }
  }

  /**
   * Moving water: noise through a band-pass whose centre sweeps from `from` to
   * `to`, swelling in and out. The sweep is the whole effect.
   */
  private current(dur: number, vol: number, from: number, to: number, when = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.bus) return;
    const t = ctx.currentTime + when;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.6;
    band.frequency.setValueAtTime(from, t);
    band.frequency.exponentialRampToValueAtTime(to, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + dur * 0.4);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(band);
    band.connect(gain);
    gain.connect(this.bus);
    src.start(t);
  }

  /** Whale song: a slow low glide up and back down, with a gentle vibrato. */
  private whale(from: number, peak: number, to: number, dur: number, vol: number, when = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.bus) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoDepth = ctx.createGain();
    const soft = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(peak, t + dur * 0.4);
    osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    lfo.frequency.value = 5;
    lfoDepth.gain.value = from * 0.012;
    soft.type = 'lowpass';
    soft.frequency.value = 900;
    amp.gain.setValueAtTime(0.001, t);
    amp.gain.exponentialRampToValueAtTime(vol, t + dur * 0.25);
    amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
    lfo.connect(lfoDepth);
    lfoDepth.connect(osc.frequency);
    osc.connect(soft);
    soft.connect(amp);
    amp.connect(this.bus);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }

  /** UI button tap: one small bubble. */
  click(): void {
    this.bubble(880, 0.08);
  }

  /** The spin: a current rushing up past a few bubbles and a low glass note. */
  spin(): void {
    this.current(0.42, 0.14, 320, 1500);
    this.glass(NOTES.e3, 0.35, 0.07, 0, 2.5, 0.8);
    this.bubbles(3, 0.06, 0.2, 0.05);
  }

  /** One reel landing: a soft muffled bump, and its own note of the scale. */
  reelStop(index: number): void {
    const notes = [NOTES.e4, NOTES.fs4, NOTES.gs4, NOTES.as4, NOTES.b4];
    this.tone(150 - index * 10, 0.12, 0.22, 0, 90 - index * 6);
    this.glass(notes[index % notes.length], 0.22, 0.045, 0, 3.5, 0.9);
  }

  /** A winning line: its own glass triad, climbing with the line number. */
  line(lineIndex: number): void {
    const [a, b, c] = LINE_TRIADS[lineIndex % LINE_TRIADS.length];
    this.glass(a, 0.4, 0.13);
    this.glass(b, 0.4, 0.11, 0.08);
    this.glass(c, 0.55, 0.11, 0.16);
  }

  /** A TURTLE doubled the line: the same glass struck twice, an octave apart. */
  wildDouble(): void {
    this.glass(NOTES.b4, 0.3, 0.13);
    this.glass(NOTES.b5, 0.45, 0.12, 0.1);
    this.bubbles(4, 0.06, 0.18, 0.08, 900, 1600);
  }

  /**
   * Scatter clams: the shell opens on a slow Lydian arpeggio (the raised
   * fourth, A#, is the sparkle), over a rising current and a stream of bubbles.
   */
  scatter(): void {
    this.current(1.0, 0.12, 400, 2400);
    [NOTES.e5, NOTES.gs5, NOTES.as5, NOTES.b5, NOTES.ds6].forEach((f, i) =>
      this.glass(f, 0.6, 0.11, i * 0.09, 3.5, 1.1),
    );
    this.bubbles(8, 0.06, 0.8, 0.1, 700, 1800);
  }

  /** The count-up: quick bubbles, alternating high and low. */
  countStart(): void {
    if (this.countTimer !== null || this.muted) return;
    let flip = false;
    this.countTimer = window.setInterval(() => {
      this.bubble(flip ? 720 : 960, 0.06);
      flip = !flip;
    }, 70);
  }

  countStop(): void {
    if (this.countTimer !== null) {
      clearInterval(this.countTimer);
      this.countTimer = null;
    }
  }

  /** BIG WIN: a whale sings under a glass fanfare climbing the scale. */
  bigwin(): void {
    this.whale(NOTES.e3, NOTES.b3, NOTES.gs3, 1.6, 0.2);
    this.current(1.6, 0.1, 300, 2000);
    const seq = [NOTES.e4, NOTES.gs4, NOTES.b4, NOTES.ds5, NOTES.e5, NOTES.gs5, NOTES.b5];
    seq.forEach((f, i) => this.glass(f, 0.4, 0.13, i * 0.12));
    this.glass(NOTES.e6, 1.1, 0.12, seq.length * 0.12, 3.5, 1.6);
    this.tone(NOTES.e2, 1.4, 0.2, seq.length * 0.12);
    this.bubbles(10, 0.06, 1.2, 0.3, 700, 1900);
  }

  /** The free games begin: the deep opens with a whale call and a Lydian run. */
  bonusStart(): void {
    this.current(1.8, 0.14, 200, 2600);
    this.tone(NOTES.e2, 2.0, 0.22);
    this.whale(NOTES.b2, NOTES.e3, NOTES.b2 * 1.12, 1.6, 0.18, 0.1);
    [NOTES.e4, NOTES.gs4, NOTES.as4, NOTES.b4, NOTES.ds5, NOTES.e5].forEach((f, i) =>
      this.glass(f, 0.5, 0.13, 0.4 + i * 0.13),
    );
    this.glass(NOTES.b5, 1.2, 0.12, 1.25, 3.5, 1.6);
    this.bubbles(12, 0.06, 1.6, 0.3, 600, 1900);
  }

  /** Each free game rolls: a lighter current than the paid spins. */
  freeSpin(): void {
    this.current(0.3, 0.09, 500, 1700);
    this.bubble(1100, 0.05, 0.04);
  }

  /** More free games: three rising glass strikes and a burst of bubbles. */
  retrigger(): void {
    this.glass(NOTES.b4, 0.45, 0.15);
    this.glass(NOTES.ds5, 0.45, 0.15, 0.15);
    this.glass(NOTES.fs5, 0.9, 0.16, 0.3, 3.5, 1.6);
    this.bubbles(8, 0.07, 0.5, 0.3, 800, 1900);
  }

  /** Free games over: the run falls home to E as the current settles. */
  bonusEnd(): void {
    this.current(1.3, 0.1, 1800, 300);
    this.glass(NOTES.cs5, 0.4, 0.13);
    this.glass(NOTES.b4, 0.4, 0.12, 0.16);
    this.glass(NOTES.gs4, 0.45, 0.12, 0.32);
    this.glass(NOTES.e5, 1.2, 0.14, 0.52, 3.5, 1.2);
    this.glass(NOTES.b5, 1.2, 0.09, 0.52);
    this.tone(NOTES.e3, 1.3, 0.18, 0.52);
  }
}

export const sound = new SoundBank();
