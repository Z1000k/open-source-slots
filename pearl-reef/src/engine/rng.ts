export interface RNG {
  /** uniform float in [0, 1) */
  next(): number;
}

/**
 * Seedable PRNG (mulberry32) for the prototype and simulations.
 * A certified CSPRNG replaces this behind the same interface for production/RGS.
 */
export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export function randomSeed(): number {
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
}

export function randInt(rng: RNG, maxExclusive: number): number {
  return Math.floor(rng.next() * maxExclusive);
}
