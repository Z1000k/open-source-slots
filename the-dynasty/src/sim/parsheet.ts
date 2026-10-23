/**
 * Analytic par sheet — counts winning combinations in closed form, sharing
 * no code with our evaluate().
 *
 * slotopol ships no _calc.lua for royaldynasty, so this is our own
 * derivation of the rules in royaldynasty_rule.go, combined the way
 * slotopol's own par sheet (royaldynasty_scan.go, Parsheet_fgretrig_custom
 * and Parsheet_fgretrig_split_custom) combines them.
 *
 * A line pays max(run pay x mw, wild pay), where the run is decided by k,
 * the number of leading wilds, S, the first non-wild symbol (at position
 * k+1), and n, how far S's run reaches with wilds substituting; mw is 2 when
 * a wild sits anywhere in the first n positions, else 1. Per reel i, on the
 * row the line reads there, let w_i be the stops that read wild, c_i(S) the
 * stops that read S, and L_i the strip length. The number of reshuffles
 * giving exactly (k, S, n) on the line is
 *
 *   w_1..w_k * c_{k+1}(S) * prod_{k+1<i<=n} (w_i + c_i(S))
 *            * (L_{n+1} - w_{n+1} - c_{n+1}(S)) * prod_{i>n+1} L_i
 *
 * (the break factor only when n < 5), plus w_1..w_5 lines of five wilds.
 * With k >= 1 every one of them doubles. With k = 0 the ones with no wild
 * inside the run, c_1(S) * prod_{1<i<=n} c_i(S) * (break), pay plain and
 * the rest double.
 *
 * A cell reads wild on its own symbol: the MONARCH, and in a free game also
 * the heir who did NOT call it (slotopol's ps). So w_i and c_i(S) are plain
 * strip counts and every line has the same expectation; each of the 20
 * lines is still counted on its own rows (slot/lines.go), and they must
 * agree.
 *
 * The scatter side convolves each reel's heir counts per window, read off
 * the strips stop by stop: in the base game both heirs (3+ HEIRESS call, else
 * 3+ HEIR), in a free game only the calling heir, which then pays. Then, as
 * slotopol's par sheet does, q = triggers x 35 / reshuffles,
 * RTP(free game awarded) = rtp(sym, free reels) / (1 - q(free reels)) and a
 * base set's RTP = rtp(sym) + q * RTP(free game awarded).
 *
 * slotopol priced the free games with the HEIRESS calling (g.TS = scat1).
 * This par sheet prints that view, held against every number slotopol
 * printed, and the game as played, each call priced with its own heir, held
 * against GAME_RTP.
 *
 * Nothing about the rules is typed by hand: the paytable, the wild and the
 * heirs, the doubling, the run minimums, the crowned heir, the scatter pays,
 * the free games draw, the par sheet's 35 and the line shapes are read
 * straight out of slotopol's Go source and asserted equal to what the game
 * actually ships, so a typo in our tables is a failure here.
 *
 *   npm run sim:parsheet
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACTIVE_REELS, FREE_REELS, REEL_SETS } from '../engine/config/reelSets';
import { LINE_PAY, RUN_MIN, SCAT_MIN, SCAT_PAY, WILD_MULT, WILD_RUN_MIN } from '../engine/config/paytable';
import { PAYLINES } from '../engine/config/paylines';
import { GAME_RTP } from '../engine/config/rtp';
import { FREE_GAMES_DRAW, HEIRS, LINES, REELS, ROWS, SYMBOL_ORDER, WILD, type Heir, type SymbolId } from '../engine/types';
import { readPrinted } from './printed';

const RULE_FILE = resolve(import.meta.dirname, '../../slotopol/royaldynasty_rule.go');
const SCAN_FILE = resolve(import.meta.dirname, '../../slotopol/royaldynasty_scan.go');
const LINES_FILE = resolve(import.meta.dirname, '../../slotopol/slot/lines.go');
const rule = readFileSync(RULE_FILE, 'utf8');
const scan = readFileSync(SCAN_FILE, 'utf8');
const linesGo = readFileSync(LINES_FILE, 'utf8');

const need = (src: string, re: RegExp, what: string): RegExpExecArray => {
  const m = re.exec(src);
  if (!m) throw new Error(`could not read ${what} from the slotopol source`);
  return m;
};
const nums = (list: string): number[] => (list.trim() === '' ? [] : list.split(',').map((n) => Number(n.trim())));
/** The body of a Go func, from its signature to the closing brace at column 0. */
const funcBody = (name: string) => need(rule, new RegExp(`func \\(g \\*Game\\) ${name}\\(wins \\*slot\\.Wins\\) \\{([\\s\\S]*?)\\n\\}`), name)[1];

const SN = Number(need(rule, /\bsn\s*=\s*(\d+)/, 'sn')[1]);
const [, wildS, scat1S, scat2S] = need(rule, /wild, scat1, scat2\s*=\s*(\d+), (\d+), (\d+)/, 'wild, scat1, scat2');
const GO_WILD = Number(wildS);
const GO_SCAT1 = Number(scat1S);
const GO_SCAT2 = Number(scat2S);
/** LinePay from the Go, indexed [sym - 1][count - 1]; the heirs' rows are empty. */
const GO_PAY: number[][] = [];
const payBlock = need(rule, /var LinePay = \[sn\]\[5\]float64\{([\s\S]*?)\n\}/, 'LinePay')[1];
for (const m of payBlock.matchAll(/\{([\d,\s]*)\},/g)) GO_PAY.push(nums(m[1]));
const GO_SCATPAY = nums(need(rule, /var ScatPay = \[5\]float64\{([\d,\s]*)\}/, 'ScatPay')[1]);
const GO_DRAW = nums(need(rule, /var Freegames = \[\.\.\.\]int\{([\d,\s]*)\}/, 'Freegames')[1]);

const linedReg = funcBody('ScanLinedReg');
const linedBon = funcBody('ScanLinedBon');
const scatReg = funcBody('ScanScattersReg');
const scatBon = funcBody('ScanScattersBon');
const RUN_FROM_W = Number(need(linedReg, /if numw >= (\d+) \{/, 'wild run minimum')[1]);
const RUN_FROM_L = Number(need(linedReg, /if numl >= (\d+) && syml > 0 \{/, 'line run minimum')[1]);
const GO_MW = Number(need(linedReg, /mw = (\d+)/, 'wild multiplier')[1]);
/** Both scans pay max(run x mw, wild run), the substituted run only when it beats the wild run. */
const MAX_RULE = [linedReg, linedBon].every((b) => /if payl\*mw > payw \{/.test(b) && /Pay: g\.Bet \* payl,\s*MP:\s*mw,/.test(b));
/** In a free game the heir that did not call reads wild, doubling, exactly like the MONARCH. */
const CROWNED =
  /case scat1:\s*ps = scat2\s*case scat2:\s*ps = scat1/.test(linedBon) &&
  /if sx == wild \|\| sx == ps \{\s*if syml == 0 \{\s*numw = x\s*\}\s*mw = \d+/.test(linedBon) &&
  /if sx == wild \{\s*if syml == 0 \{\s*numw = x\s*\}\s*mw = \d+/.test(linedReg) &&
  Number(need(linedBon, /if numw >= (\d+) \{/, 'free wild run minimum')[1]) === RUN_FROM_W &&
  Number(need(linedBon, /if numl >= (\d+) && syml > 0 \{/, 'free line run minimum')[1]) === RUN_FROM_L;
/** Base game: 3+ scat1 call, else 3+ scat2; the win carries free games and no pay. */
const REG_CALL = new RegExp(
  `if count := g\\.SymNum\\(scat1\\); count >= (\\d+) \\{[\\s\\S]*?\\} else if count := g\\.SymNum\\(scat2\\); count >= (\\d+) \\{`,
).exec(scatReg);
const REG_UNPAID = !/Pay:/.test(scatReg) && /FS:\s*fs,/.test(scatReg) && /Freegames\[rand\.N\(len\(Freegames\)\)\]/.test(scatReg);
/** Free games: 3+ of the calling heir (g.TS) pay bet x lines x ScatPay and draw more free games. */
const BON_CALL = Number(need(scatBon, /if count := g\.SymNum\(g\.TS\); count >= (\d+) \{/, 'free games scatter minimum')[1]);
const BON_PAID =
  /var pay = ScatPay\[count-1\]/.test(scatBon) &&
  /Pay: g\.Bet \* float64\(g\.Sel\) \* pay,/.test(scatBon) &&
  /Freegames\[rand\.N\(len\(Freegames\)\)\]/.test(scatBon);
/** The caller is the heir whose win started the free games, kept for the whole session. */
const TS_SET = /if g\.FSR > 0 && g\.FSN == 0 \{\s*for _, wi := range wins \{\s*if wi\.FS > 0 \{\s*g\.TS = wi\.Sym/.test(rule);
/** The free games spin on ReelsBon, the base game on the closest base set. */
const BON_IN_FREE = /if g\.FSR == 0 \{\s*var reels, _ = ReelsMap\.FindClosest\(mrtp\)\s*return reels\s*\} else \{\s*return ReelsBon/.test(rule);
/** The par sheet: free games priced with scat1 calling, q = hits x 35 / N, no multiplier. */
const SCAN_TS1 = /g\.TS = scat1/.test(scan);
const SCAN_Q = [...scan.matchAll(/float64\(s[rb]\.Cfg\.Load\(\)\*(\d+)\) \/ N[rb]?/g)].map((m) => Number(m[1]));
const SCAN_M1 =
  /Parsheet_fgretrig_custom\(w, sp, sb, g\.Cost\(\), 1, q, ΣPL\)/.test(scan) &&
  /Parsheet_fgretrig_split_custom\(w, sp, sr, sb, g\.Cost\(\), 1, qr, qb, ΣPL\)/.test(scan);
/** The bet lines: royaldynasty names BetLinesNvm5x3v1; its rows, 1-based in the Go. */
const LINES_NAME = /var BetLines = slot\.BetLinesNvm5x3v1\[:\]/.test(rule);
const linesBlock = need(linesGo, /var BetLinesNvm5x3v1 = \[\.\.\.\]Linex\{([\s\S]*?)\n\}/, 'BetLinesNvm5x3v1')[1];
const GO_LINES = [...linesBlock.matchAll(/\{([\d,\s]+)\}/g)].map((m) => nums(m[1]).map((r) => r - 1));

// The shipped game must say the same thing as the Go.
const mismatch = (what: string) => {
  throw new Error(`the shipped game disagrees with slotopol's Go source on ${what}`);
};
const idOfHeir: Record<Heir, number> = { HEIRESS: GO_SCAT1, HEIR: GO_SCAT2 };
if (SN !== SYMBOL_ORDER.length || GO_PAY.length !== SN) mismatch(`symbol count (${SN})`);
if (SYMBOL_ORDER[GO_WILD - 1] !== WILD) mismatch('the wild');
if (SYMBOL_ORDER[GO_SCAT1 - 1] !== HEIRS[0] || SYMBOL_ORDER[GO_SCAT2 - 1] !== HEIRS[1]) mismatch('the heirs and the order they are checked in');
for (const id of [GO_SCAT1, GO_SCAT2]) if (GO_PAY[id - 1].some((p) => p !== 0)) mismatch('an heir paying on the lines');
if (RUN_FROM_W !== WILD_RUN_MIN || RUN_FROM_L !== RUN_MIN) mismatch('the run minimums');
if (GO_MW !== WILD_MULT) mismatch(`the wild double (${GO_MW})`);
if (!MAX_RULE) mismatch('a line paying the better of the doubled run and the wild run');
if (!CROWNED) mismatch('the heir who did not call turning wild in the free games');
if (!REG_CALL || Number(REG_CALL[1]) !== SCAT_MIN || Number(REG_CALL[2]) !== SCAT_MIN) mismatch('the base game call (3+ of an heir, scat1 first)');
if (!REG_UNPAID) mismatch('the base game call paying nothing and drawing the free games');
if (BON_CALL !== SCAT_MIN || !BON_PAID) mismatch('the free games scatter (3+ of the caller pay and draw more)');
if (!TS_SET) mismatch('the calling heir staying fixed for the session');
if (!BON_IN_FREE) mismatch('the free games spinning on their own strips');
if (GO_DRAW.length !== FREE_GAMES_DRAW.length || GO_DRAW.some((k, i) => k !== FREE_GAMES_DRAW[i])) mismatch('the free games draw');
if (!SCAN_TS1 || SCAN_Q.length !== 3 || !SCAN_M1) mismatch('the par sheet (scat1 calling, q = hits x 35 / N, no multiplier)');
if (!LINES_NAME) mismatch('the bet lines being BetLinesNvm5x3v1');
for (let s = 0; s < SN; s++) {
  const sym = SYMBOL_ORDER[s];
  for (let k = 0; k < 5; k++) {
    const go = GO_PAY[s][k] ?? 0;
    // a run shorter than the Go's minimum never pays, whatever the table says
    const want = k + 1 < (s + 1 === GO_WILD ? RUN_FROM_W : RUN_FROM_L) ? 0 : go;
    if (LINE_PAY[sym][k] !== want) mismatch(`${sym} x${k + 1}: ships ${LINE_PAY[sym][k]}, Go pays ${want}`);
  }
}
for (let k = 1; k <= 5; k++) {
  if (SCAT_PAY[k - 1] !== (k >= BON_CALL ? GO_SCATPAY[k - 1] : 0)) mismatch(`the pay for ${k} of the calling heir`);
}
if (GO_LINES.length !== LINES || PAYLINES.length !== LINES) mismatch(`the number of bet lines (${GO_LINES.length})`);
for (let li = 0; li < LINES; li++) {
  if (GO_LINES[li].length !== REELS || GO_LINES[li].some((r, x) => r !== PAYLINES[li][x])) mismatch(`bet line ${li + 1}`);
}
/** slotopol's par sheet constant: the free games of one call, on average. */
const PAR_K = SCAN_Q[0];
if (SCAN_Q.some((k) => k !== PAR_K) || PAR_K * GO_DRAW.length !== GO_DRAW.reduce((a, k) => a + k, 0)) {
  mismatch(`the par sheet's ${PAR_K} being the average draw`);
}

/** pay(sym, count) with 1-based sym and count, the Go's run minimums applied. */
const pay = (sym: number, n: number) =>
  n >= (sym === GO_WILD ? RUN_FROM_W : RUN_FROM_L) ? (GO_PAY[sym - 1][n - 1] ?? 0) : 0;
const idOf = (s: SymbolId) => {
  const id = SYMBOL_ORDER.indexOf(s) + 1;
  if (id === 0) throw new Error(`symbol ${s} on a strip`);
  return id;
};

interface Reels {
  /** L[i] for 1-based reel i */
  L: number[];
  /** wild[i][r]: stops of reel i that read wild on row r */
  wild: number[][];
  /** counts[sym][i][r]: stops of reel i that read sym on row r (sym 1-based, wilds excluded) */
  counts: number[][][];
  /** heirs[i]: stops of reel i by [scat1 count][scat2 count] in the window */
  heirs: number[][][];
}

/** `ps`: the id that reads wild beside the MONARCH (the crowned heir in a free game), 0 in the base game. */
function precalc(reels: SymbolId[][], ps: number): Reels {
  const L = [0, ...reels.map((r) => r.length)];
  const wild: number[][] = [[]];
  const counts: number[][][] = [];
  for (let s = 0; s <= SN; s++) counts[s] = [[], ...reels.map(() => new Array(ROWS).fill(0))];
  const heirs: number[][][] = [[]];
  for (let i = 1; i <= REELS; i++) {
    const reel = reels[i - 1].map(idOf);
    const wi = new Array(ROWS).fill(0);
    const h = Array.from({ length: ROWS + 1 }, () => new Array(ROWS + 1).fill(0));
    for (let stop = 0; stop < reel.length; stop++) {
      const win = [0, 1, 2].map((y) => reel[(stop + y) % reel.length]);
      for (let r = 0; r < ROWS; r++) {
        if (win[r] === GO_WILD || win[r] === ps) wi[r]++;
        else counts[win[r]][i][r]++;
      }
      h[win.filter((s) => s === GO_SCAT1).length][win.filter((s) => s === GO_SCAT2).length]++;
    }
    wild.push(wi);
    heirs.push(h);
  }
  return { L, wild, counts, heirs };
}

/** Sum over all reshuffles of ONE line's pay, the line reading row rows[i - 1] of reel i. Line-bet units. */
function lineEv({ L, wild, counts }: Reels, rows: readonly number[], N: number, ps: number): number {
  const w = (i: number) => wild[i][rows[i - 1]];
  const c = (s: number, i: number) => counts[s][i][rows[i - 1]];
  const payw = (k: number) => (k >= 1 ? pay(GO_WILD, k) : 0);
  let ev = 0;
  let combos = 0;
  let lead = 1;
  for (let k = 0; k < REELS; k++) {
    if (k > 0) lead *= w(k);
    if (lead === 0) break;
    for (let S = 1; S <= SN; S++) {
      if (S === GO_WILD || S === ps) continue;
      // run: S at k+1, then wild-or-S up to n; plain: the same with no wild inside (k = 0 only)
      let run = lead * c(S, k + 1);
      let plain = k === 0 ? c(S, 1) : 0;
      for (let n = k + 1; n <= REELS && run > 0; n++) {
        if (n > k + 1) {
          run *= w(n) + c(S, n);
          plain *= c(S, n);
        }
        if (run === 0) break;
        let tail = 1;
        if (n < REELS) {
          tail = L[n + 1] - w(n + 1) - c(S, n + 1);
          for (let i = n + 2; i <= REELS; i++) tail *= L[i];
        }
        combos += run * tail;
        ev += plain * tail * Math.max(pay(S, n), payw(k));
        ev += (run - plain) * tail * Math.max(pay(S, n) * GO_MW, payw(k));
      }
    }
  }
  let all = 1;
  for (let i = 1; i <= REELS; i++) all *= w(i);
  combos += all;
  ev += all * payw(REELS);
  // Every reshuffle lands in exactly one (k, S, n) case or the five-wild one.
  if (combos !== N) throw new Error(`par sheet cases cover ${combos} reshuffles, want ${N}`);
  return ev;
}

/** Reshuffles by heir counts: the calls (by heir) and, in a free game, the scatter pays (total bets). */
function scatEv({ heirs }: Reels, caller: Heir | null) {
  // ways[a][b]: reshuffles showing a of scat1 and b of scat2 in all
  let ways: number[][] = [[1]];
  for (let i = 1; i <= REELS; i++) {
    const next = Array.from({ length: ways.length + ROWS }, () => new Array(ways.length + ROWS).fill(0));
    for (let a = 0; a < ways.length; a++) {
      for (let b = 0; b < ways[a].length; b++) {
        if (ways[a][b] === 0) continue;
        for (let da = 0; da <= ROWS; da++) for (let db = 0; db <= ROWS; db++) next[a + da][b + db] += ways[a][b] * heirs[i][da][db];
      }
    }
    ways = next;
  }
  let pays = 0;
  const calls: Record<Heir, number> = { HEIRESS: 0, HEIR: 0 };
  for (let a = 0; a < ways.length; a++) {
    for (let b = 0; b < ways[a].length; b++) {
      const n = ways[a][b];
      if (n === 0) continue;
      if (caller === null) {
        if (a >= SCAT_MIN) calls.HEIRESS += n;
        else if (b >= SCAT_MIN) calls.HEIR += n;
      } else {
        const k = idOfHeir[caller] === GO_SCAT1 ? a : b;
        if (k >= BON_CALL) {
          if (k > 5) throw new Error(`${k} of the calling heir can land, the table stops at 5`);
          pays += n * GO_SCATPAY[k - 1];
          calls[caller] += n;
        }
      }
    }
  }
  return { pays, calls, triggers: calls.HEIRESS + calls.HEIR };
}

interface Block {
  N: number;
  /** each line's pay summed over every reshuffle, line bets */
  perLine: number[];
  scat: ReturnType<typeof scatEv>;
}

function block(reels: SymbolId[][], caller: Heir | null): Block {
  const ps = caller === null ? 0 : caller === 'HEIRESS' ? GO_SCAT2 : GO_SCAT1;
  const r = precalc(reels, ps);
  const N = reels.reduce((a, x) => a * x.length, 1);
  return { N, perLine: GO_LINES.map((rows) => lineEv(r, rows, N, ps)), scat: scatEv(r, caller) };
}

/** The block's figures scoring the first `sel` lines (slotopol's Sel; cost sel line bets). */
function figures(b: Block, sel: number) {
  let units = 0;
  for (let li = 0; li < sel; li++) units += b.perLine[li];
  const lined = units / sel / b.N;
  const scat = b.scat.pays / b.N;
  const q = (b.scat.triggers * PAR_K) / b.N;
  return { lined, scat, sym: lined + scat, q, sq: 1 / (1 - q), hr: b.N / b.scat.triggers };
}

const pct = (x: number) => (x * 100).toFixed(6);
const sig5 = (x: number) => Number(x.toPrecision(5));

const printed = readPrinted();
let bad = 0;
const check = (what: string, got: string | number, want: string | number) => {
  if (got !== want) {
    bad++;
    console.log(`  MISMATCH ${what}: ${got}, slotopol says ${want}`);
  }
};

const bon: Record<Heir, Block> = { HEIRESS: block(FREE_REELS, 'HEIRESS'), HEIR: block(FREE_REELS, 'HEIR') };
const bases = REEL_SETS.map((set) => ({ set, b: block(set.reels, null) }));
for (const [what, b] of [
  ...bases.map(({ set, b }) => [`set ${set.rtp}`, b] as [string, Block]),
  ...HEIRS.map((h) => [`free games, ${h} calling`, bon[h]] as [string, Block]),
]) {
  if (b.perLine.some((v) => v !== b.perLine[0])) {
    bad++;
    console.log(`  MISMATCH ${what}: the lines should all earn the same`);
  }
}

const rtpFsOf = {} as Record<Heir, number>;
for (const h of HEIRS) {
  const f = figures(bon[h], LINES);
  rtpFsOf[h] = f.sq * f.sym;
}

console.log("=== slotopol's par sheet as slotopol ran it: free games with the HEIRESS calling (g.TS = scat1) ===");
const fb = figures(bon.HEIRESS, 1);
const rtpFs = fb.sq * fb.sym;
console.log('*bonus reels calculations*');
console.log(`reels lengths [${FREE_REELS.map((r) => r.length).join(', ')}], total reshuffles ${bon.HEIRESS.N}`);
console.log(`symbols: ${sig5(fb.lined * 100)}(lined) + ${sig5(fb.scat * 100)}(scatter) = ${pct(fb.sym)}%`);
console.log(`calls ${bon.HEIRESS.scat.triggers}, q = ${sig5(fb.q)}, sq = 1/(1-q) = ${fb.sq.toFixed(6)}`);
console.log(`free games hit rate: 1/${sig5(fb.hr)}`);
console.log(`RTP = sq*rtp(sym) = ${fb.sq.toFixed(6)}*${pct(fb.sym)} = ${pct(rtpFs)}%`);
const pb = printed.bon;
check('reshuffles', bon.HEIRESS.N, pb.total);
check('lined', sig5(fb.lined * 100), pb.lined);
check('scatter', sig5(fb.scat * 100), pb.scat);
check('symbols', pct(fb.sym), pb.sym.toFixed(6));
check('q', sig5(fb.q), pb.q);
check('sq', fb.sq.toFixed(6), pb.sq.toFixed(6));
check('hit rate', sig5(fb.hr), pb.hr);
check('RTP per free game awarded', pct(rtpFs), pb.rtp.toFixed(6));
console.log('');

for (const { set, b } of bases) {
  const f = figures(b, 1);
  const total = f.sym + f.q * rtpFs;
  console.log(`*regular reels ${set.rtp.toFixed(6)}%*${set === ACTIVE_REELS ? ' (ACTIVE)' : ''}`);
  console.log(`reels lengths [${set.reels.map((r) => r.length).join(', ')}], total reshuffles ${b.N}`);
  console.log(`symbols: ${sig5(f.lined * 100)}(lined) + ${sig5(f.scat * 100)}(scatter) = ${pct(f.sym)}%`);
  console.log(
    `calls ${b.scat.triggers} (HEIRESS ${b.scat.calls.HEIRESS}, HEIR ${b.scat.calls.HEIR}), q = ${sig5(f.q)}, ` +
      `sq = 1/(1-q) = ${f.sq.toFixed(6)}, free games hit rate: 1/${sig5(f.hr)}`,
  );
  console.log(`RTP = ${sig5(f.sym * 100)}(sym) + ${sig5(f.q)}*${sig5(rtpFs * 100)}(fg) = ${pct(total)}%`);
  const want = printed.sets.get(set.rtp.toFixed(6));
  if (!want) {
    bad++;
    console.log('  MISMATCH: slotopol prints no figures for this set');
  } else {
    check('reshuffles', b.N, want.total);
    check('symbols', pct(f.sym), want.sym.toFixed(6));
    check('lined', sig5(f.lined * 100), want.lined);
    check('scatter', sig5(f.scat * 100), want.scat);
    check('q', sig5(f.q), want.q);
    check('sq', f.sq.toFixed(6), want.sq.toFixed(6));
    check('hit rate', sig5(f.hr), want.hr);
    check('RTP', pct(total), want.rtp.toFixed(6));
  }
  check('label', pct(total), set.rtp.toFixed(6));
}
console.log('');

console.log('=== the game as played and paid: all 20 lines, each call priced with the heir who made it ===');
for (const h of HEIRS) {
  const f = figures(bon[h], LINES);
  console.log(
    `free games, ${h} calling: symbols ${pct(f.sym)}% per free game, q = ${sig5(f.q)}, ` +
      `RTP ${pct(rtpFsOf[h])}% per free game awarded`,
  );
}
check('free games worth the same whichever heir calls', pct(rtpFsOf.HEIR), pct(rtpFsOf.HEIRESS));
let activeRtp = NaN;
for (const { set, b } of bases) {
  const f = figures(b, LINES);
  const total =
    f.sym +
    ((b.scat.calls.HEIRESS * PAR_K) / b.N) * rtpFsOf.HEIRESS +
    ((b.scat.calls.HEIR * PAR_K) / b.N) * rtpFsOf.HEIR;
  if (set === ACTIVE_REELS) activeRtp = total;
  check(`set ${set.rtp} as played`, pct(total), set.rtp.toFixed(6));
}
check('shipped GAME_RTP', pct(activeRtp), GAME_RTP.toFixed(6));
console.log(`ACTIVE ${ACTIVE_REELS.rtp.toFixed(6)} on 20 lines: RTP ${pct(activeRtp)}%, shipped GAME_RTP ${GAME_RTP.toFixed(6)}%\n`);

console.log(
  bad === 0
    ? `slotopol's par sheet is reproduced to 6 decimals for all ${REEL_SETS.length} base sets and the free games ` +
        `(symbols, q, sq, hit rate and RTP of every block), every line earns the same, the free games are worth the ` +
        `same whichever heir calls them, and the game as played returns GAME_RTP ${GAME_RTP.toFixed(6)}%.`
    : `${bad} figure(s) DO NOT match.`,
);
process.exit(bad === 0 ? 0 : 1);
