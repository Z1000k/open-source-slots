/**
 * Monte Carlo through the REAL engine (playRound), the one the browser and
 * the Worker both call.
 *
 * src/sim/exact.ts proves the symbol maths by full enumeration, but it uses
 * its own fast numeric evaluator. This sim closes that gap: it plays whole
 * rounds through the shipped code, ladder included, so the figure it reports
 * is the return of the actual game. It should land on the reel set's
 * published RTP (95.548865% on the active set).
 *
 * Run: npm run sim              20M rounds on the active set
 *      npm run sim 5000000      a shorter run
 */
import { playRound } from '../engine/round';
import { ACTIVE_SET, REEL_SETS } from '../engine/config/reelSets';
import { mulberry32 } from '../engine/rng';
import { xoshiro128ss } from './simRng';
import { FALL_LIMIT } from '../engine/types';

const N = Number(process.argv[2] ?? 20_000_000);
const rtpArg = process.argv[3] ? Number(process.argv[3]) : null;
const set = rtpArg ? REEL_SETS.find((s) => s.rtp === rtpArg)! : ACTIVE_SET;
if (!set) throw new Error(`no reel set with rtp ${rtpArg}`);

// Long runs use xoshiro128** by default; pass "weak" as the 4th argument to
// go back to the engine's mulberry32 and compare the two.
const seed = process.argv[5] ? Number(process.argv[5]) : 0xc0ffee;
const weak = process.argv[4] === 'weak';
const rng = weak ? mulberry32(seed) : xoshiro128ss(seed);

let win = 0;
let winsq = 0;
let symWin = 0;
let bonusWin = 0;
let bonuses = 0;
let paying = 0;
let maxWin = 0;
let maxWinAt = 0;
const chain = new Array(FALL_LIMIT + 1).fill(0);
const bands = [1, 5, 10, 20, 50, 100, 200, 500, 1000];
const bandHits = new Array(bands.length).fill(0);

const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const r = playRound(rng, set.reels);
  win += r.totalWin;
  winsq += r.totalWin * r.totalWin;
  chain[r.cascades]++;
  if (r.totalWin > 0) paying++;
  for (const fall of r.falls) {
    const b = fall.bonus;
    if (b) {
      bonuses++;
      bonusWin += b.totalWin;
      symWin += fall.win - b.totalWin;
    } else {
      symWin += fall.win;
    }
  }
  if (r.totalWin > maxWin) {
    maxWin = r.totalWin;
    maxWinAt = i;
  }
  for (let b = 0; b < bands.length; b++) if (r.totalWin >= bands[b]) bandHits[b]++;
}

const secs = (Date.now() - t0) / 1000;
const pct = (v: number): string => ((v / N) * 100).toFixed(4) + '%';

console.log(`reel set        ${set.rtp.toFixed(6)}% (slotopol's published figure)`);
console.log(`generator       ${weak ? 'mulberry32 (engine demo prng)' : 'xoshiro128**'}, seed 0x${seed.toString(16)}`);
console.log(`rounds          ${N.toLocaleString()} in ${secs.toFixed(1)}s`);
console.log('');
const mean = win / N;
const se = Math.sqrt(Math.max(0, winsq / N - mean * mean) / N);
const diff = mean * 100 - set.rtp;
console.log(`RTP             ${pct(win)}  +/- ${(1.96 * se * 100).toFixed(4)} at 95%`);
console.log(`  symbols       ${pct(symWin)}   (exact: ${set.parsheet.symRtp.toFixed(6)}%)`);
console.log(`  barn ladder   ${pct(bonusWin)}   (exact: ${set.parsheet.farmRtp.toFixed(6)}%)`);
console.log(
  `difference      ${diff.toFixed(4)} points = ${(diff / (se * 100)).toFixed(2)} standard errors`,
);
console.log('');
console.log(`hit rate        ${pct(paying)} of rounds pay`);
console.log(`ladder rate     1/${(N / bonuses).toFixed(2)} rounds   (exact: 1/${set.parsheet.farmHitRate})`);
console.log(`biggest round   ${maxWin.toFixed(2)}x total bet (round ${maxWinAt.toLocaleString()})`);
console.log('');
console.log('avalanche length:');
for (let c = 0; c < chain.length; c++) {
  if (chain[c] > 0) console.log(`  ${c} cascades: ${pct(chain[c])}`);
}
console.log('');
console.log('win of at least:');
bands.forEach((b, i) => {
  if (bandHits[i] > 0) console.log(`  ${b}x total bet: 1/${(N / bandHits[i]).toFixed(1)} rounds`);
});
