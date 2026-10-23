/**
 * Measures the barn ladder bonus on its own.
 *
 * The target is slotopol's Ebon = 50 (cashfarm_scan.go), the expected bonus
 * win their published RTP tables are built from: every set's "farm rtp" is
 * exactly 50 / (its farm hit rate). If this sim returns 50, our reading of
 * their ladder is right and the whole RTP table should fall into place.
 *
 * Run: npm run sim:bonus
 */
import { playBonus } from '../engine/bonus';
import { mulberry32 } from '../engine/rng';

const N = Number(process.argv[2] ?? 20_000_000);
const rng = mulberry32(0xfa27);

let sum = 0;
let sumsq = 0;
let max = 0;
const levelCount = [0, 0, 0, 0, 0, 0];
const multCount = new Map<number, number>();

for (let i = 0; i < N; i++) {
  const b = playBonus(rng);
  sum += b.totalWin;
  sumsq += b.totalWin * b.totalWin;
  if (b.totalWin > max) max = b.totalWin;
  levelCount[b.levelsReached]++;
  multCount.set(b.multiplier, (multCount.get(b.multiplier) ?? 0) + 1);
}

const mean = sum / N;
const sd = Math.sqrt(sumsq / N - mean * mean);
const se = sd / Math.sqrt(N);

console.log(`bonuses played:   ${N.toLocaleString()}`);
console.log(`mean win:         ${mean.toFixed(4)}x total bet  (+/- ${(1.96 * se).toFixed(4)} at 95%)`);
console.log(`slotopol Ebon:    50`);
console.log(`difference:       ${(mean - 50).toFixed(4)}  (${(((mean - 50) / 50) * 100).toFixed(3)}%)`);
console.log(`biggest bonus:    ${max}x total bet`);
console.log('');
console.log('levels reached:');
for (let l = 1; l <= 5; l++) {
  console.log(`  ${l}: ${((levelCount[l] / N) * 100).toFixed(3)}%`);
}
console.log('multiplier:');
for (const m of [...multCount.keys()].sort((a, b) => a - b)) {
  console.log(`  x${m}: ${((multCount.get(m)! / N) * 100).toFixed(3)}%`);
}
