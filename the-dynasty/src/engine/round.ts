import type { BonusResult, RoundResult, SpinResult } from './types';
import { FREE_GAMES_DRAW } from './types';
import type { RNG } from './rng';
import { randInt } from './rng';
import { ACTIVE_REELS, FREE_REELS } from './config/reelSets';
import { spinGrid } from './spin';
import { evaluate } from './evaluate';

/** The number of free games a call or retrigger awards: 25, 30, 35, 40 or 45, uniformly. */
export function drawFreeGames(rng: RNG): number {
  return FREE_GAMES_DRAW[randInt(rng, FREE_GAMES_DRAW.length)];
}

/**
 * Play one complete game round: a base spin, and when 3+ of one heir land,
 * the whole free games session — the drawn number of spins on the
 * free-games reels, that heir paying and retriggering, the other heir
 * crowned wild, every retrigger drawing more. The round is settled here in
 * full; totalWin in TOTAL-bet multiples.
 */
export function playRound(rng: RNG): RoundResult {
  const baseSpin = evaluate(spinGrid(rng, ACTIVE_REELS.reels));

  let bonus: BonusResult | undefined;
  if (baseSpin.scatterHit) {
    const caller = baseSpin.scatterHit.symbol;
    baseSpin.freeSpinsWon = drawFreeGames(rng);
    const draws = [baseSpin.freeSpinsWon];
    const spins: SpinResult[] = [];
    let spinsLeft = baseSpin.freeSpinsWon;
    let retriggers = 0;
    let totalWin = 0;
    while (spinsLeft > 0) {
      spinsLeft--;
      const spin = evaluate(spinGrid(rng, FREE_REELS), caller);
      if (spin.scatterHit) {
        spin.freeSpinsWon = drawFreeGames(rng);
        draws.push(spin.freeSpinsWon);
        spinsLeft += spin.freeSpinsWon;
        retriggers++;
      }
      totalWin += spin.totalWin;
      spins.push(spin);
    }
    bonus = { caller, spins, spinsPlayed: spins.length, retriggers, draws, totalWin };
  }

  return { baseSpin, bonus, totalWin: baseSpin.totalWin + (bonus?.totalWin ?? 0) };
}
