import type { BonusCell, BonusLevel, BonusResult } from './types';
import type { RNG } from './rng';
import { randInt } from './rng';

/**
 * The barn ladder bonus, ported from slotopol's novomatic/cashfarm farm.go.
 *
 * Five levels, each a row of face-down cells that is shuffled and then turned
 * over one at a time from the left:
 *
 *   - a prize cell adds its value and you keep turning on the same level;
 *   - a golden prize cell (slotopol stores these as negative values) adds its
 *     value and climbs you to the next level;
 *   - a golden multiplier cell adds 1 to the multiplier and climbs;
 *   - the bucket cell ends the bonus on the spot.
 *
 * Everything collected is paid at the end, multiplied by the multiplier.
 * Level 1 cannot bust: it holds no bucket, so every bonus reaches level 2.
 *
 * Values are in TOTAL-bet multiples. slotopol's own RTP tables price this
 * bonus at Ebon = 50 x total bet, which src/sim/bonus.ts measures back.
 *
 * One deliberate difference from slotopol's Go: their Calc() SUBTRACTS the
 * value of a climbing prize cell (`p -= float64(-c)`), which contradicts their
 * own Cell.Pay() accessor two functions above it and would make the bonus
 * worth far less than the Ebon = 50 their published RTP figures are built on.
 * We add it, which is both the obvious intent and the only reading that
 * reproduces their RTP table. See src/sim/bonus.ts for the measurement.
 */

/** Prize values used on levels 1 to 3. */
const REEL_LOW = [2, 2, 3, 4, 5, 6, 8, 10, 14];
/** Prize values used on level 4. */
const REEL_MID = [14, 14, 20, 24];
/** Prize values used on level 5. */
const REEL_TOP = [20, 24, 40, 50];

function pick(rng: RNG, values: readonly number[]): number {
  return values[randInt(rng, values.length)];
}

function prize(value: number, climbs: boolean): BonusCell {
  return { kind: 'pay', value, climbs };
}

const MULT: BonusCell = { kind: 'mult', value: 0, climbs: true };
const BUCKET: BonusCell = { kind: 'bucket', value: 0, climbs: false };

/** Builds the five levels, unshuffled, with fresh random prize values. */
function buildLadder(rng: RNG): BonusCell[][] {
  const low = () => pick(rng, REEL_LOW);
  return [
    [
      prize(low(), false),
      prize(low(), false),
      prize(low(), false),
      prize(low(), true),
      prize(low(), true),
      prize(low(), true),
    ],
    [prize(low(), false), prize(low(), false), prize(low(), true), MULT, BUCKET],
    [prize(low(), false), prize(low(), true), MULT, BUCKET],
    [prize(pick(rng, REEL_MID), false), MULT, BUCKET],
    [prize(pick(rng, REEL_TOP), false), BUCKET],
  ];
}

/** Fisher-Yates, matching Go's rand.Shuffle over the same cells. */
function shuffle(rng: RNG, cells: BonusCell[]): void {
  for (let i = cells.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
}

/** Plays one whole bonus out. Result values are in TOTAL-bet multiples. */
export function playBonus(rng: RNG): BonusResult {
  const ladder = buildLadder(rng);
  for (const level of ladder) shuffle(rng, level);

  const levels: BonusLevel[] = ladder.map((cells) => ({ cells, revealed: 0 }));
  let pay = 0;
  let multiplier = 1;
  let levelsReached = 0;

  outer: for (const level of levels) {
    levelsReached++;
    for (const cell of level.cells) {
      level.revealed++;
      if (cell.kind === 'bucket') break outer;
      if (cell.kind === 'mult') multiplier++;
      else pay += cell.value;
      if (cell.climbs) break;
    }
  }

  return { levels, levelsReached, pay, multiplier, totalWin: pay * multiplier };
}
