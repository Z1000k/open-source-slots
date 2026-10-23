/**
 * PEARL REEF — 5x3, 10-line reef slot with a doubling wild and 15 free games
 * that pay triple.
 *
 * Math ported 1:1 from slotopol/server (MIT), game/slot/novomatic/dolphinspearl:
 * same reel strips, paytable, bet lines, wild-doubles rule, scatter pays and
 * retriggerable free games on their own strips with every win tripled, so the
 * published RTP figures carry over. Art, names and presentation are our own.
 */

/** Every symbol that can pay on a line. TURTLE is also the wild. */
export type PaySymbol =
  | 'TURTLE' // slotopol sym 1, wild, top pay
  | 'SHARK' // 2
  | 'OCTOPUS' // 3
  | 'JELLYFISH' // 4
  | 'PUFFERFISH' // 5
  | 'STARFISH' // 6
  | 'ACE' // 7
  | 'KING' // 8
  | 'QUEEN' // 9
  | 'JACK' // 10
  | 'TEN' // 11
  | 'NINE'; // 12

export type SymbolId = PaySymbol | 'CLAM'; // 13, scatter

/** Index order matches the slotopol numeric symbol ids (1-based). */
export const SYMBOL_ORDER: SymbolId[] = [
  'TURTLE',
  'SHARK',
  'OCTOPUS',
  'JELLYFISH',
  'PUFFERFISH',
  'STARFISH',
  'ACE',
  'KING',
  'QUEEN',
  'JACK',
  'TEN',
  'NINE',
  'CLAM',
];

/** The wild. It substitutes for every symbol but the scatter and pays on its own too. */
export const WILD: SymbolId = 'TURTLE';
/** The scatter. Pays anywhere from 2, and 3+ start the free games. */
export const SCATTER: SymbolId = 'CLAM';

export const REELS = 5;
export const ROWS = 3;
export const LINES = 10;

/** A win a wild helped complete is doubled (a run of wilds alone is not). */
export const WILD_MULT = 2;

/** Free games for 3+ CLAM, and again on every retrigger. */
export const FREE_SPINS_AWARD = 15;

/** Every win on a free game, line and scatter alike, pays this many times over. */
export const FREE_GAME_MULT = 3;

/**
 * Best possible SINGLE spin in total-bet multiples: 27450 line-bets, a free
 * game with five TURTLEs across the middle, tripled. The best paid spin is the
 * same grid untripled, 915x. Both measured by enumerating every stop
 * combination the shipped strips allow (src/sim/exact.ts). Informational:
 * like the original math there is no cap mechanic, a free games session
 * stacks 15+ of these spins and retriggers stack without limit.
 */
export const MAX_WIN = 27450 / 10;

/** grid[reel][row], 5x3 */
export type Grid = SymbolId[][];

export interface LineWin {
  /** payline index (0-based) */
  line: number;
  /** the symbol the run pays as (TURTLE when the run is wilds only) */
  symbol: PaySymbol;
  /** leftmost run length (2-5), wilds included */
  count: number;
  /** 2 when a wild completed the run, else 1 (the free-game triple is on SpinResult) */
  mult: number;
  /** value in TOTAL-bet multiples, every multiplier already applied */
  amount: number;
  /** [reel, row] cells that form the win */
  positions: [number, number][];
}

export interface ScatterWin {
  /** CLAM count anywhere on the grid (2-5) */
  count: number;
  /** value in TOTAL-bet multiples, the free-game triple already applied */
  amount: number;
  /** [reel, row] of every CLAM */
  positions: [number, number][];
}

export interface SpinResult {
  grid: Grid;
  lineWins: LineWin[];
  scatterWin?: ScatterWin;
  /** free games this spin awards (15 on 3+ CLAM, else 0) */
  freeSpinsWon: number;
  /** 3 on a free game, where every win pays triple; 1 on a paid spin */
  multiplier: number;
  /** sum of all wins, in TOTAL-bet multiples */
  totalWin: number;
}

/** The free games: 15 spins on the bonus strips at triple pay, retriggerable. */
export interface BonusResult {
  spins: SpinResult[];
  /** free games played in total, retriggers included */
  spinsPlayed: number;
  /** number of retriggers that happened (each added 15 more spins) */
  retriggers: number;
  /** total free games win in TOTAL-bet multiples */
  totalWin: number;
}

/** One complete game round: a base spin, plus free games when triggered. */
export interface RoundResult {
  baseSpin: SpinResult;
  bonus?: BonusResult;
  /** total round win in TOTAL-bet multiples */
  totalWin: number;
}
