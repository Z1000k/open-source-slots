/**
 * A stronger random generator, for simulations only.
 *
 * The engine's mulberry32 is a toy: one 32 bit word of state, so its whole
 * cycle is 4.3 billion numbers, and a 150M round sim pulls well over a billion
 * of them. That is close enough to its limits to be a suspect when a result
 * drifts, so the long runs use xoshiro128** instead: 128 bits of state, a
 * cycle of 2^128 - 1, and it passes the standard statistical test suites.
 *
 * This file is deliberately NOT in src/engine. The engine keeps its seedable
 * toy for the browser demo, and real money never uses either one, the Worker
 * deals from Cloudflare's crypto randomness through the same RNG interface.
 */
import type { RNG } from '../engine/rng';

/** Expands one seed number into the four words xoshiro needs. */
function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

export function xoshiro128ss(seed: number): RNG {
  const seeder = splitmix32(seed);
  let s0 = seeder();
  let s1 = seeder();
  let s2 = seeder();
  let s3 = seeder();
  // a zero state would be stuck, which splitmix makes vanishingly unlikely
  if ((s0 | s1 | s2 | s3) === 0) s0 = 1;

  return {
    next(): number {
      const r = Math.imul(((Math.imul(s1, 5) >>> 0) << 7) | ((Math.imul(s1, 5) >>> 0) >>> 25), 9);
      const t = (s1 << 9) >>> 0;
      s2 ^= s0;
      s3 ^= s1;
      s1 ^= s2;
      s0 ^= s3;
      s2 ^= t;
      s3 = ((s3 << 11) | (s3 >>> 21)) >>> 0;
      return (r >>> 0) / 4294967296;
    },
  };
}
