/**
 * Monte Carlo through the REAL playRound path — free games, retriggers and the
 * RNG-to-stop mapping included, which is what exact.ts cannot exercise. Run
 * with an optional round count: `npm run sim -- 20000000`.
 */
import { mulberry32, randomSeed } from '../engine/rng';
import { ACTIVE_REELS } from '../engine/config/reelSets';
import { playRound } from '../engine/round';

const ROUNDS = Number(process.argv[2] ?? 5_000_000);
const seed = randomSeed();
const rng = mulberry32(seed);

let won = 0;
let baseWon = 0;
let bonusWon = 0;
let hits = 0;
let bonuses = 0;
let retriggers = 0;
let freeSpins = 0;
let best = 0;
let bestBase = 0;
const t0 = Date.now();

for (let i = 0; i < ROUNDS; i++) {
  const r = playRound(rng);
  won += r.totalWin;
  baseWon += r.baseSpin.totalWin;
  if (r.totalWin > 0) hits++;
  if (r.totalWin > best) best = r.totalWin;
  if (r.baseSpin.totalWin > bestBase) bestBase = r.baseSpin.totalWin;
  if (r.bonus) {
    bonuses++;
    bonusWon += r.bonus.totalWin;
    retriggers += r.bonus.retriggers;
    freeSpins += r.bonus.spinsPlayed;
  }
}

const secs = (Date.now() - t0) / 1000;
console.log(
  `active set target ${ACTIVE_REELS.rtp}%  ->  measured RTP = ${((won / ROUNDS) * 100).toFixed(4)}%\n` +
    `  base ${((baseWon / ROUNDS) * 100).toFixed(4)}% + free games ${((bonusWon / ROUNDS) * 100).toFixed(4)}%\n` +
    `  hit rate ${((hits / ROUNDS) * 100).toFixed(3)}%, free games 1 in ${(ROUNDS / bonuses).toFixed(1)} rounds\n` +
    `  ${(freeSpins / bonuses).toFixed(2)} free spins per session, ${(retriggers / bonuses).toFixed(3)} retriggers per session\n` +
    `  free games return ${((bonusWon / bonuses) * 100).toFixed(3)}% of total bet per trigger  ` +
    `[exact: 45 x 210.461503 = 9470.767635%]\n` +
    `  best round ${best.toFixed(2)}x, best single base spin ${bestBase.toFixed(2)}x\n` +
    `  ${ROUNDS} rounds in ${secs.toFixed(1)}s, seed ${seed}`,
);
