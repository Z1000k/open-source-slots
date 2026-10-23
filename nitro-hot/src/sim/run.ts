/**
 * Monte Carlo through the REAL playRound path (grid landing included), which
 * exercises what exact.ts cannot: the RNG-to-stop mapping. Run with an
 * optional spin count: `npm run sim -- 5000000`.
 */
import { mulberry32, randomSeed } from '../engine/rng';
import { REEL_SETS, ACTIVE_REELS } from '../engine/config/reelSets';
import { spinGrid } from '../engine/spin';
import { evaluate } from '../engine/evaluate';

const SPINS = Number(process.argv[2] ?? 5_000_000);
const seed = randomSeed();

for (const set of REEL_SETS) {
  const rng = mulberry32(seed);
  let won = 0;
  let hits = 0;
  let best = 0;
  const t0 = Date.now();
  for (let i = 0; i < SPINS; i++) {
    const r = evaluate(spinGrid(rng, set.reels));
    won += r.totalWin;
    if (r.totalWin > 0) hits++;
    if (r.totalWin > best) best = r.totalWin;
  }
  const active = set === ACTIVE_REELS ? '  [ACTIVE]' : '';
  console.log(
    `target ${set.rtp}%  ->  measured RTP = ${((won / SPINS) * 100).toFixed(4)}%  ` +
      `hit rate ${((hits / SPINS) * 100).toFixed(3)}%, best win ${best}x, ` +
      `${SPINS} spins in ${((Date.now() - t0) / 1000).toFixed(1)}s${active}`,
  );
}
console.log(`seed ${seed}`);
