/**
 * Monte Carlo through the REAL playRound path — the free games draw, the
 * retriggers and the RNG-to-stop mapping included, which is what exact.ts
 * cannot exercise.
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
 * the plumbing invariants: the caller read back off the base grid (the board
 * does exactly that), every draw one of 25 / 30 / 35 / 40 / 45, the session
 * length equal to the sum of its draws, totals, free-game flags, and every
 * win a whole number of line bets, so the worker's floor to the cent only
 * ever drops the half cent of a 0.10 bet.
 */
import { mulberry32, type RNG } from '../engine/rng';
import { GAME_RTP } from '../engine/config/rtp';
import { FREE_GAMES_DRAW, LINES, type Heir } from '../engine/types';
import { playRound } from '../engine/round';
import { callerOf } from '../engine/evaluate';

/** Exact figures for the original 94.138004 base set (src/sim/exact.ts, src/sim/parsheet.ts). */
const EXACT = {
  rtp: GAME_RTP / 100,
  base: 0.41623639,
  /** exact SD of one complete round, in total bets */
  sd: 7.004,
  /** 3+ of either heir on a paid spin: 622,566 of the 62,145,792 stop combinations, half each */
  trigger: 622_566 / 62_145_792,
  /** free games return per trigger, in total bets: 35 drawn on average x 149.773991% */
  perTrigger: 35 * 1.49773991,
  /** one free game on the free reels, in total bets: 115.564727% whichever heir called */
  perFreeSpin: 1.15564727,
  /** free games per session, retriggers included */
  spinsPerSession: 45.3606,
  /** the biggest single spins any stop combination can pay, in total bets */
  maxBase: 386,
  maxFree: 501,
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
/** sessions, their wins and squares, by the heir who called them */
const byCaller: Record<Heir, { n: number; sum: number; sq: number }> = {
  HEIRESS: { n: 0, sum: 0, sq: 0 },
  HEIR: { n: 0, sum: 0, sq: 0 },
};
/** how often each count was drawn, opening awards and retriggers alike */
const drawn = new Map<number, number>(FREE_GAMES_DRAW.map((k) => [k, 0]));
let draws = 0;
const t0 = Date.now();

/** True when `win` (in total bets) is a whole number of line bets. */
const wholeLineBets = (win: number) => Math.abs(win * LINES - Math.round(win * LINES)) < 1e-9;

for (let i = 0; i < ROUNDS; i++) {
  const r = playRound(rng);
  const b = r.baseSpin;
  won += r.totalWin;
  wonSq += r.totalWin * r.totalWin;
  baseWon += b.totalWin;
  baseSq += b.totalWin * b.totalWin;
  if (r.totalWin > 0) hits++;
  if (r.totalWin > best) best = r.totalWin;
  if (b.totalWin > bestBase) bestBase = b.totalWin;
  if (b.freeGame || b.caller !== null) broken++;
  if ((r.bonus === undefined) !== (b.scatterHit === undefined)) broken++;
  if ((r.bonus === undefined) !== (b.freeSpinsWon === 0)) broken++;
  if (!wholeLineBets(b.totalWin)) broken++;
  let sum = b.totalWin;
  if (!r.bonus) {
    if (callerOf(b.grid) !== null) broken++;
  } else {
    const bonus = r.bonus;
    bonuses++;
    bonusWon += bonus.totalWin;
    bonusSq += bonus.totalWin * bonus.totalWin;
    retriggers += bonus.retriggers;
    freeSpins += bonus.spinsPlayed;
    if (bonus.spinsPlayed > longest) longest = bonus.spinsPlayed;
    // the board reads the caller off the base grid: it must be the one that plays
    if (bonus.caller !== b.scatterHit!.symbol || callerOf(b.grid) !== bonus.caller) broken++;
    if (b.scatterHit!.amount !== 0) broken++;
    const c = byCaller[bonus.caller];
    c.n++;
    c.sum += bonus.totalWin;
    c.sq += bonus.totalWin * bonus.totalWin;

    if (bonus.draws.length !== bonus.retriggers + 1 || bonus.draws[0] !== b.freeSpinsWon) broken++;
    let awarded = 0;
    for (const d of bonus.draws) {
      if (!drawn.has(d)) broken++;
      else drawn.set(d, drawn.get(d)! + 1);
      draws++;
      awarded += d;
    }
    if (bonus.spinsPlayed !== awarded || bonus.spins.length !== bonus.spinsPlayed) broken++;

    let bonusSum = 0;
    let retrigger = 1;
    for (const s of bonus.spins) {
      if (!s.freeGame || s.caller !== bonus.caller) broken++;
      if ((s.freeSpinsWon > 0) !== (s.scatterHit !== undefined)) broken++;
      if (s.scatterHit) {
        if (s.scatterHit.symbol !== bonus.caller || s.freeSpinsWon !== bonus.draws[retrigger++]) broken++;
      }
      if (!wholeLineBets(s.totalWin)) broken++;
      bonusSum += s.totalWin;
      freeWon += s.totalWin;
      freeSq += s.totalWin * s.totalWin;
      if (s.totalWin > bestFree) bestFree = s.totalWin;
    }
    if (retrigger !== bonus.draws.length) broken++;
    if (Math.abs(bonusSum - bonus.totalWin) > 1e-9) broken++;
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
const heiress = judge(byCaller.HEIRESS.sum, byCaller.HEIRESS.sq, byCaller.HEIRESS.n, EXACT.perTrigger);
const heir = judge(byCaller.HEIR.sum, byCaller.HEIR.sq, byCaller.HEIR.n, EXACT.perTrigger);
// a fair coin between the heirs: z of the HEIRESS share of all calls
const callZ = (byCaller.HEIRESS.n - bonuses / 2) / Math.sqrt(bonuses / 4);
// each count is one draw in five: the largest z among the five shares
const drawZ = Math.max(
  ...FREE_GAMES_DRAW.map((k) => Math.abs(drawn.get(k)! - draws / 5) / Math.sqrt((draws * 4) / 25)),
);
const pp = (x: number) => (x * 100).toFixed(4);
const zz = (z: number) => `${z >= 0 ? '+' : ''}${z.toFixed(2)} SE`;

console.log(
  `${ROUNDS} rounds, ${seed === null ? 'Web Crypto RNG (as real money)' : `mulberry32 seed ${seed}`}, ${secs.toFixed(1)}s\n` +
    `  RTP          ${pp(all.mean)}%  exact ${pp(EXACT.rtp)}%  SE ${pp(all.se)}pp  ${zz(all.z)}\n` +
    `  base part    ${pp(base.mean)}%  exact ${pp(EXACT.base)}%  SE ${pp(base.se)}pp  ${zz(base.z)}\n` +
    `  free games   ${pp(bonusWon / ROUNDS)}%  exact ${pp(EXACT.rtp - EXACT.base)}%\n` +
    `  trigger      1 in ${(1 / trig.mean).toFixed(3)}  exact 1 in ${(1 / EXACT.trigger).toFixed(3)}  ${zz(trig.z)}\n` +
    `  per trigger  ${pp(per.mean)}%  exact ${pp(EXACT.perTrigger)}%  ${zz(per.z)}\n` +
    `    HEIRESS calls ${byCaller.HEIRESS.n}  ${pp(heiress.mean)}%  ${zz(heiress.z)}\n` +
    `    HEIR calls    ${byCaller.HEIR.n}  ${pp(heir.mean)}%  ${zz(heir.z)}\n` +
    `    heiress share ${((byCaller.HEIRESS.n / bonuses) * 100).toFixed(3)}%  exact 50%  ${zz(callZ)}\n` +
    `  per free spin ${pp(free.mean)}%  exact ${pp(EXACT.perFreeSpin)}%  ${zz(free.z)}\n` +
    `  draws ${FREE_GAMES_DRAW.map((k) => `${k}: ${((drawn.get(k)! / draws) * 100).toFixed(3)}%`).join('  ')}  ` +
    `(largest gap ${drawZ.toFixed(2)} SE)\n` +
    `  hit rate ${((hits / ROUNDS) * 100).toFixed(3)}%, ${(freeSpins / bonuses).toFixed(4)} free spins per session ` +
    `(exact ${EXACT.spinsPerSession}, longest ${longest}), ${(retriggers / bonuses).toFixed(4)} retriggers per session\n` +
    `  best round ${best.toFixed(2)}x, best single base spin ${bestBase.toFixed(2)}x (max ${EXACT.maxBase}x), ` +
    `best single free spin ${bestFree.toFixed(2)}x (max ${EXACT.maxFree}x)\n` +
    `  plumbing: ${broken === 0 ? 'every round consistent' : `${broken} BROKEN invariant(s)`}`,
);
process.exit(broken === 0 ? 0 : 1);
