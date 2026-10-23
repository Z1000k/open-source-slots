import type { BonusResult, PaySymbol, RoundResult, SpinResult } from './types';
import { SYMBOL_ORDER } from './types';
import type { RNG } from './rng';
import { randInt } from './rng';
import { ACTIVE_REELS, BONUS_REELS } from './config/reelSets';
import { spinGrid } from './spin';
import { evaluate } from './evaluate';

/**
 * Play one complete game round: a base spin, and when 3+ PAPYRUS land, the
 * whole free games session — one expanding symbol drawn uniformly from the
 * nine paying symbols (slotopol's rand.N(9)+1), 10 spins on the bonus strip,
 * every retrigger adding 10 more with the SAME expanding symbol. The round is
 * settled here in full; totalWin in TOTAL-bet multiples.
 */
export function playRound(rng: RNG): RoundResult {
  const baseSpin = evaluate(spinGrid(rng, ACTIVE_REELS.reels), null);

  let bonus: BonusResult | undefined;
  if (baseSpin.freeSpinsWon > 0) {
    const es = SYMBOL_ORDER[randInt(rng, 9)] as PaySymbol;
    const spins: SpinResult[] = [];
    let spinsLeft = baseSpin.freeSpinsWon;
    let retriggers = 0;
    let totalWin = 0;
    while (spinsLeft > 0) {
      spinsLeft--;
      const spin = evaluate(spinGrid(rng, BONUS_REELS), es);
      if (spin.freeSpinsWon > 0) {
        spinsLeft += spin.freeSpinsWon;
        retriggers++;
      }
      totalWin += spin.totalWin;
      spins.push(spin);
    }
    bonus = { expandingSymbol: es, spins, retriggers, totalWin };
  }

  return { baseSpin, bonus, totalWin: baseSpin.totalWin + (bonus?.totalWin ?? 0) };
}
