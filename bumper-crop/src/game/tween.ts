/** Flip to false to make the reel roll skip-proof (presentation-only skip). */
export const ALLOW_REEL_STOP = true;

// Fast-forward state: while `armed`, every tween/frames/sleep completes on its
// next frame at its end state. Arming only works inside the `skippable` window
// (opened once the reels settle, closed while they roll and between rounds).
//
// On top of the window sit HOLDS: a presentation that must play in full
// (winning lines, a sailor flight, the jump into a bonus) takes one, and the
// window is forced shut while any hold is active — whatever setSkippable asks
// for in the meantime is only remembered, and comes back on the last release.
// Holds nest, so overlapping must-watch moments never reopen each other.
let armed = false;
let skippable = false; // effective: `wanted` and no holds
let wanted = false; // the state the round logic last asked for
let holds = 0;
const pendingSleeps = new Set<() => void>();

function applySkippable(): void {
  skippable = wanted && holds === 0;
  if (!skippable) armed = false;
}

/** Request fast-forward; ignored outside the skippable window. */
export function armSkip(): void {
  if (!skippable) return;
  armed = true;
  for (const res of pendingSleeps) res();
  pendingSleeps.clear();
}

export function skipArmed(): boolean {
  return armed;
}

export function disarmSkip(): void {
  armed = false;
}

/** Open/close the window in which armSkip() is honoured. Closing disarms. */
export function setSkippable(on: boolean): void {
  wanted = on;
  applySkippable();
}

/** Force the window shut for a must-watch presentation. Pair with releaseSkip. */
export function holdSkip(): void {
  holds++;
  applySkippable();
}

export function releaseSkip(): void {
  holds = Math.max(0, holds - 1);
  applySkippable();
}

export function sleep(ms: number): Promise<void> {
  if (armed) return Promise.resolve();
  return new Promise((res) => {
    const done = () => {
      clearTimeout(id);
      pendingSleeps.delete(done);
      res();
    };
    const id = setTimeout(done, ms);
    pendingSleeps.add(done);
  });
}

/** Drive `fn(t)` with t going 0 -> 1 over `ms` (eased in-out). */
export function tween(ms: number, fn: (t: number) => void): Promise<void> {
  return new Promise((res) => {
    const start = performance.now();
    const step = (now: number) => {
      const raw = armed ? 1 : Math.min(1, (now - start) / ms);
      const t = raw < 0.5 ? 2 * raw * raw : 1 - (-2 * raw + 2) ** 2 / 2;
      fn(t);
      if (raw < 1) requestAnimationFrame(step);
      else res();
    };
    requestAnimationFrame(step);
  });
}

/** Drive `fn(t)` with t going 0 -> 1 over `ms` linearly (bring your own easing). */
export function frames(ms: number, fn: (t: number) => void): Promise<void> {
  return new Promise((res) => {
    const start = performance.now();
    const step = (now: number) => {
      const t = armed ? 1 : Math.min(1, (now - start) / ms);
      fn(t);
      if (t < 1) requestAnimationFrame(step);
      else res();
    };
    requestAnimationFrame(step);
  });
}

/** Easing curves for use with `frames`, which is linear on its own. */
export const ease = {
  /** overshoots a touch at the end: produce landing in a crate */
  outBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  outCubic(t: number): number {
    return 1 - (1 - t) ** 3;
  },
  /** accelerating, for something dropping under its own weight */
  inQuad(t: number): number {
    return t * t;
  },
};

/** Count from `from` to `to`, invoking `fn` with the current value. */
export function countUp(
  ms: number,
  from: number,
  to: number,
  fn: (v: number) => void,
): Promise<void> {
  return tween(ms, (t) => fn(from + (to - from) * t));
}
