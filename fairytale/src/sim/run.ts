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
 * the plumbing invariants: session length, totals, free-game flags, and that
 * every grid hands the board the drawn symbol back (expansionOf), since the
 * board only ever sees grids.
 */
import { mulberry32, type RNG } from '../engine/rng';
import { GAME_RTP } from '../engine/config/rtp';
import { FREE_SPINS_AWARD } from '../engine/types';
import { playRound } from '../engine/round';
import { expansionOf } from '../engine/evaluate';

/** Exact figures for the original base set (src/sim/exact.ts, src/sim/parsheet.ts). */
const EXACT = {
  rtp: GAME_RTP / 100,
  base: 0.54040105,
  /** exact SD of one complete round, in total bets */
  sd: 8.4269,
  /** 3+ LANTERNs on a paid spin: 364,743 of the 90,224,199 stop combinations */
  trigger: 364_743 / 90_224_199,
  /** free games return per trigger, in total bets: 10 x 1027.224599% */
  perTrigger: FREE_SPINS_AWARD * 10.27224599,
  /** one free game, the symbol drawn from the pool, in total bets: 855.938178% */
  perFreeSpin: 8.55938178,
  /** free games per session, retriggers included */
  spinsPerSession: 12.0012,
  /** the biggest single spins any stop combination can pay, in total bets */
  maxBase: 908.2,
  maxFree: 750,
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
let freeWon = 0;
let freeSq = 0;
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
  if (r.baseSpin.expand || expansionOf(r.baseSpin.grid)) broken++;
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
      if (!s.freeGame || !s.expand) broken++;
      const seen = expansionOf(s.grid);
      if (!seen || seen.symbol !== s.expand?.symbol || seen.reels !== s.expand.reels) broken++;
      bonusSum += s.totalWin;
      freeWon += s.totalWin;
      freeSq += s.totalWin * s.totalWin;
      if (s.totalWin > bestFree) bestFree = s.totalWin;
    }
    if (Math.abs(bonusSum - r.bonus.totalWin) > 1e-9) broken++;
    sum += bonusSum;
  }
  if (Math.abs(sum - r.totalWin) > 1e-9) broken++;
}
// no spin may ever beat the biggest the enumeration found
if (bestBase > EXACT.maxBase + 1e-9) broken++;
if (bestFree > EXACT.maxFree + 1e-9) broken++;

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
const free = judge(freeWon, freeSq, freeSpins, EXACT.perFreeSpin);
const pp = (x: number) => (x * 100).toFixed(4);
const zz = (z: number) => `${z >= 0 ? '+' : ''}${z.toFixed(2)} SE`;

console.log(
  `${ROUNDS} rounds, ${seed === null ? 'Web Crypto RNG (as real money)' : `mulberry32 seed ${seed}`}, ${secs.toFixed(1)}s\n` +
    `  RTP          ${pp(all.mean)}%  exact ${pp(EXACT.rtp)}%  SE ${pp(all.se)}pp  ${zz(all.z)}\n` +
    `  base part    ${pp(base.mean)}%  exact ${pp(EXACT.base)}%  SE ${pp(base.se)}pp  ${zz(base.z)}\n` +
    `  free games   ${pp(bonusWon / ROUNDS)}%  exact ${pp(EXACT.rtp - EXACT.base)}%\n` +
    `  trigger      1 in ${(1 / trig.mean).toFixed(2)}  exact 1 in ${(1 / EXACT.trigger).toFixed(2)}  ${zz(trig.z)}\n` +
    `  per trigger  ${pp(per.mean)}%  exact ${pp(EXACT.perTrigger)}%  ${zz(per.z)}\n` +
    `  per free spin ${pp(free.mean)}%  exact ${pp(EXACT.perFreeSpin)}%  ${zz(free.z)}\n` +
    `  hit rate ${((hits / ROUNDS) * 100).toFixed(3)}%, ${(freeSpins / bonuses).toFixed(4)} free spins per session ` +
    `(exact ${EXACT.spinsPerSession}, longest ${longest}), ${(retriggers / bonuses).toFixed(4)} retriggers per session\n` +
    `  best round ${best.toFixed(2)}x, best single base spin ${bestBase.toFixed(2)}x (max ${EXACT.maxBase}x), ` +
    `best single free spin ${bestFree.toFixed(2)}x (max ${EXACT.maxFree}x)\n` +
    `  plumbing: ${broken === 0 ? 'every round consistent' : `${broken} BROKEN invariant(s)`}`,
);
process.exit(broken === 0 ? 0 : 1);
