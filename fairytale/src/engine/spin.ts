import type { Expansion, Grid, SymbolId } from './types';
import { BLANK, REELS, ROWS, SCATTER } from './types';
import type { RNG } from './rng';
import { randInt } from './rng';
import { EXPAND_POOL, FREE_REELS } from './config/reelSets';
import { EXPAND_REELS } from './config/paytable';

/**
 * Land a grid: each reel stops on a uniform random position and shows ROWS
 * consecutive symbols (wrapping), exactly like slotopol's SpinReels.
 */
export function spinGrid(rng: RNG, reels: SymbolId[][]): Grid {
  const grid: Grid = [];
  for (let x = 0; x < REELS; x++) grid.push(windowAt(reels[x], randInt(rng, reels[x].length)));
  return grid;
}

/** The ROWS symbols a strip shows when it stops at `stop`. */
export function windowAt(reel: SymbolId[], stop: number): SymbolId[] {
  const col: SymbolId[] = [];
  for (let y = 0; y < ROWS; y++) col.push(reel[(stop + y) % reel.length]);
  return col;
}

/** A reel the expanding symbol covers: the LANTERN sits in the middle, any other symbol fills it. */
export function coveredReel(symbol: SymbolId): SymbolId[] {
  return symbol === SCATTER ? [BLANK, SCATTER, BLANK] : [symbol, symbol, symbol];
}

/**
 * One free game, slotopol's Prepare + SpinBon: draw the expanding symbol
 * uniformly from the 28-entry pool (its weights are its repeats), cover
 * reels 1..EXPAND_REELS[symbol] with it, and spin only the reels after
 * those on the free-games strips.
 */
export function freeGrid(rng: RNG): { grid: Grid; expand: Expansion } {
  const symbol = EXPAND_POOL[randInt(rng, EXPAND_POOL.length)];
  const reels = EXPAND_REELS[symbol];
  const grid: Grid = [];
  for (let x = 0; x < REELS; x++) {
    grid.push(x < reels ? coveredReel(symbol) : windowAt(FREE_REELS[x], randInt(rng, FREE_REELS[x].length)));
  }
  return { grid, expand: { symbol, reels } };
}
