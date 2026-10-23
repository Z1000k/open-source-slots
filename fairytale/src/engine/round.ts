import type { BonusResult, RoundResult, SpinResult } from './types';
import type { RNG } from './rng';
import { ACTIVE_REELS } from './config/reelSets';
import { freeGrid, spinGrid } from './spin';
import { evaluate } from './evaluate';

/**
 * Play one complete game round: a base spin, and when 3+ LANTERN land, the
 * whole free games session — 10 spins, each with a freshly drawn expanding
 * symbol covering the first reels, every retrigger adding 10 more. The round
 * is settled here in full; totalWin in TOTAL-bet multiples.
 */
export function playRound(rng: RNG): RoundResult {
  const baseSpin = evaluate(spinGrid(rng, ACTIVE_REELS.reels));

  let bonus: BonusResult | undefined;
  if (baseSpin.freeSpinsWon > 0) {
    const spins: SpinResult[] = [];
    let spinsLeft = baseSpin.freeSpinsWon;
    let retriggers = 0;
    let totalWin = 0;
    while (spinsLeft > 0) {
      spinsLeft--;
      const { grid, expand } = freeGrid(rng);
      const spin = evaluate(grid, expand);
      if (spin.freeSpinsWon > 0) {
        spinsLeft += spin.freeSpinsWon;
        retriggers++;
      }
      totalWin += spin.totalWin;
      spins.push(spin);
    }
    bonus = { spins, spinsPlayed: spins.length, retriggers, totalWin };
  }

  return { baseSpin, bonus, totalWin: baseSpin.totalWin + (bonus?.totalWin ?? 0) };
}
