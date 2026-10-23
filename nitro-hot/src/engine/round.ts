import type { RoundResult } from './types';
import type { RNG } from './rng';
import { ACTIVE_REELS } from './config/reelSets';
import { spinGrid } from './spin';
import { evaluate } from './evaluate';

/**
 * Play one complete game round. NITRO HOT is stateless: one spin, line wins
 * only, nothing carried over. totalWin in TOTAL-bet multiples.
 */
export function playRound(rng: RNG): RoundResult {
  const baseSpin = evaluate(spinGrid(rng, ACTIVE_REELS.reels));
  return { baseSpin, totalWin: baseSpin.totalWin };
}
