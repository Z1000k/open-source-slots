/**
 * BUMPER CROP engine, public surface.
 *
 * Pure functions with an injected RNG: the same module runs in the browser
 * demo and inside the Cloudflare Worker that deals real-money rounds.
 */
export * from './types';
export { evaluate, clearedCells } from './evaluate';
export type { Scan } from './evaluate';
export { playBonus } from './bonus';
export { playRound, reelAt } from './round';
export { REEL_SETS, ACTIVE_SET, ACTIVE_REELS, ACTIVE_RTP } from './config/reelSets';
export { PAYLINES } from './config/paylines';
export { LINE_PAY, SCAT_PAY } from './config/paytable';
export type { RNG } from './rng';
export { mulberry32, randomSeed, randInt } from './rng';
