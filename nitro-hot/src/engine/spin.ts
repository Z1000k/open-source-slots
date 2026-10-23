import type { Grid, SymbolId } from './types';
import { REELS, ROWS } from './types';
import type { RNG } from './rng';
import { randInt } from './rng';

/**
 * Land a grid: each reel stops on a uniform random position and shows ROWS
 * consecutive symbols (wrapping), exactly like slotopol's SpinReels.
 */
export function spinGrid(rng: RNG, reels: SymbolId[][]): Grid {
  const grid: Grid = [];
  for (let x = 0; x < REELS; x++) {
    const reel = reels[x];
    const stop = randInt(rng, reel.length);
    const col: SymbolId[] = [];
    for (let y = 0; y < ROWS; y++) col.push(reel[(stop + y) % reel.length]);
    grid.push(col);
  }
  return grid;
}
