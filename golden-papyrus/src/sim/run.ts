/**
 * Monte Carlo through the REAL playRound path — full compound game: base
 * spin, trigger, expanding-symbol draw, free games with retriggers. This
 * exercises what exact.ts cannot: the RNG-to-stop mapping and the round state
 * machine. Run with an optional round count: `npm run sim -- 20000000`.
 * Note ACTIVE_REELS is fixed inside playRound, so only that set is measured.
 */
import { mulberry32, randomSeed } from '../engine/rng';
import { ACTIVE_REELS } from '../engine/config/reelSets';
import { playRound } from '../engine/round';

const ROUNDS = Number(process.argv[2] ?? 20_000_000);
const seed = randomSeed();
const rng = mulberry32(seed);

let won = 0;
let baseWon = 0;
let bonusWon = 0;
let hits = 0;
let bonuses = 0;
let retriggers = 0;
let bonusSpins = 0;
let best = 0;
const t0 = Date.now();

for (let i = 0; i < ROUNDS; i++) {
  const r = playRound(rng);
  won += r.totalWin;
  baseWon += r.baseSpin.totalWin;
  if (r.totalWin > 0) hits++;
  if (r.totalWin > best) best = r.totalWin;
  if (r.bonus) {
    bonuses++;
    bonusWon += r.bonus.totalWin;
    retriggers += r.bonus.retriggers;
    bonusSpins += r.bonus.spins.length;
  }
}

console.log(`target ${ACTIVE_REELS.rtp}%  (${ROUNDS} rounds, seed ${seed})`);
console.log(`measured RTP    = ${((won / ROUNDS) * 100).toFixed(4)}%`);
console.log(`  base symbols  = ${((baseWon / ROUNDS) * 100).toFixed(4)}%  (target 50.8847%)`);
console.log(`  free games    = ${((bonusWon / ROUNDS) * 100).toFixed(4)}%  (target 44.2273%)`);
console.log(`round hit rate  = ${((hits / ROUNDS) * 100).toFixed(3)}%`);
console.log(
  `free games: 1 in ${(ROUNDS / bonuses).toFixed(1)} rounds (target 176.2), ` +
    `avg spins ${(bonusSpins / bonuses).toFixed(3)} (target 13.195), ` +
    `retriggers/bonus ${(retriggers / bonuses).toFixed(4)}`,
);
console.log(`best round ${best}x total bet, done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
