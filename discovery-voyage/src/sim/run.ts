/**
 * Monte Carlo through the REAL playRound path — free games, retriggers and the
 * RNG-to-stop mapping included, which is what exact.ts cannot exercise.
 *
 *   npm run sim -- 1000000000           Web Crypto, the generator real money uses
 *   npm run sim -- 50000000 --seed 42   mulberry32, the demo's generator, reproducible
 *
 * The default generator is built exactly like cryptoRng() in the site
 * worker, so this measures the path real money takes. Keep seeded runs
 * short (under ~100M rounds): mulberry32 repeats after 2^32 draws and its
 * consecutive draws become measurably dependent long before that, which
 * shows up as a fake RTP drift of several SE.
 *
 * Every measured figure is judged against its exact value in standard
 * errors; the headline RTP uses the exact per-round SD from exact.ts, since
 * a single round can pay hundreds of bets and the sample wanders
 * accordingly. A gap under ~4 SE is noise. Each round is also checked for
 * the plumbing invariants: session length, totals, free-game flags.
 */
import { mulberry32, type RNG } from '../engine/rng';
import { ACTIVE_REELS } from '../engine/config/reelSets';
import { FREE_SPINS_AWARD } from '../engine/types';
import { playRound } from '../engine/round';

/** Exact figures for the active set (src/sim/exact.ts, slotopol). */
const EXACT = {
  rtp: ACTIVE_REELS.rtp / 100,
  base: 0.70162364,
  /** exact SD of one complete round, in total bets */
  sd: 4.5605,
  /** 3 GALLEON on a paid spin: 254,016 of the 25,690,112 stop combinations */
  trigger: 254_016 / 25_690_112,
  /** free games return per trigger, in total bets: 10 x 251.427957% */
  perTrigger: FREE_SPINS_AWARD * 2.51427957,
};

/** Mirror of cryptoRng() in apexslots-site/worker/game-api.ts. */
function cryptoRng(): RNG {
  const buf = new Uint32Array(1024);
  let i = buf.length;
  return {
    next(): number {
      if (i >= buf.length) {
        crypto.getRandomValues(buf);
        i = 0;
      }
      return buf[i++] / 4294967296;
    },
  };
}

const ROUNDS = Number(process.argv[2] ?? 5_000_000);
const seedAt = process.argv.indexOf('--seed');
const seed = seedAt > 0 ? Number(process.argv[seedAt + 1]) : null;
const rng = seed === null ? cryptoRng() : mulberry32(seed);

let won = 0;
let wonSq = 0;
let baseWon = 0;
let baseSq = 0;
let bonusWon = 0;
let bonusSq = 0;
let hits = 0;
let bonuses = 0;
let retriggers = 0;
let freeSpins = 0;
let longest = 0;
let best = 0;
let bestBase = 0;
let bestFree = 0;
let broken = 0;
const t0 = Date.now();

for (let i = 0; i < ROUNDS; i++) {
  const r = playRound(rng);
  won += r.totalWin;
  wonSq += r.totalWin * r.totalWin;
  baseWon += r.baseSpin.totalWin;
  baseSq += r.baseSpin.totalWin * r.baseSpin.totalWin;
  if (r.totalWin > 0) hits++;
  if (r.totalWin > best) best = r.totalWin;
  if (r.baseSpin.totalWin > bestBase) bestBase = r.baseSpin.totalWin;
  if (r.baseSpin.freeGame || (r.bonus === undefined) !== (r.baseSpin.freeSpinsWon === 0)) broken++;
  let sum = r.baseSpin.totalWin;
  if (r.bonus) {
    bonuses++;
    bonusWon += r.bonus.totalWin;
    bonusSq += r.bonus.totalWin * r.bonus.totalWin;
    retriggers += r.bonus.retriggers;
    freeSpins += r.bonus.spinsPlayed;
    if (r.bonus.spinsPlayed > longest) longest = r.bonus.spinsPlayed;
    if (r.bonus.spinsPlayed !== FREE_SPINS_AWARD * (1 + r.bonus.retriggers)) broken++;
    if (r.bonus.spins.length !== r.bonus.spinsPlayed) broken++;
    let bonusSum = 0;
    for (const s of r.bonus.spins) {
      if (!s.freeGame) broken++;
      bonusSum += s.totalWin;
      if (s.totalWin > bestFree) bestFree = s.totalWin;
    }
    if (Math.abs(bonusSum - r.bonus.totalWin) > 1e-9) broken++;
    sum += bonusSum;
  }
  if (Math.abs(sum - r.totalWin) > 1e-9) broken++;
}

const secs = (Date.now() - t0) / 1000;
/** Mean, its standard error, and how many SEs it sits from `exact`. */
const judge = (sum: number, sq: number, n: number, exact: number, sd?: number) => {
  const mean = sum / n;
  const se = (sd ?? Math.sqrt(sq / n - mean * mean)) / Math.sqrt(n);
  return { mean, se, z: (mean - exact) / se };
};
const all = judge(won, wonSq, ROUNDS, EXACT.rtp, EXACT.sd);
const base = judge(baseWon, baseSq, ROUNDS, EXACT.base);
const trig = judge(bonuses, bonuses, ROUNDS, EXACT.trigger);
const per = judge(bonusWon, bonusSq, bonuses, EXACT.perTrigger);
const pp = (x: number) => (x * 100).toFixed(4);
const zz = (z: number) => `${z >= 0 ? '+' : ''}${z.toFixed(2)} SE`;

console.log(
  `${ROUNDS} rounds, ${seed === null ? 'Web Crypto RNG (as real money)' : `mulberry32 seed ${seed}`}, ${secs.toFixed(1)}s\n` +
    `  RTP          ${pp(all.mean)}%  exact ${pp(EXACT.rtp)}%  SE ${pp(all.se)}pp  ${zz(all.z)}\n` +
    `  base part    ${pp(base.mean)}%  exact ${pp(EXACT.base)}%  SE ${pp(base.se)}pp  ${zz(base.z)}\n` +
    `  free games   ${pp(bonusWon / ROUNDS)}%  exact ${pp(EXACT.rtp - EXACT.base)}%\n` +
    `  trigger      1 in ${(1 / trig.mean).toFixed(2)}  exact 1 in ${(1 / EXACT.trigger).toFixed(2)}  ${zz(trig.z)}\n` +
    `  per trigger  ${pp(per.mean)}%  exact ${pp(EXACT.perTrigger)}%  ${zz(per.z)}\n` +
    `  hit rate ${((hits / ROUNDS) * 100).toFixed(3)}%, ${(freeSpins / bonuses).toFixed(3)} free spins per session ` +
    `(exact 12.903, longest ${longest}), ${(retriggers / bonuses).toFixed(4)} retriggers per session\n` +
    `  best round ${best.toFixed(2)}x, best single base spin ${bestBase.toFixed(2)}x, ` +
    `best single free spin ${bestFree.toFixed(2)}x\n` +
    `  plumbing: ${broken === 0 ? 'every round consistent' : `${broken} BROKEN invariant(s)`}`,
);
process.exit(broken === 0 ? 0 : 1);
