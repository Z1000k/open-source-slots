/**
 * THE DYNASTY — 5x3, 20-line royal court slot. The MONARCH is wild, pays
 * from 2 of a kind and doubles every line he helps complete. The two heirs
 * are the scatters: 3+ of either one start 25 to 45 free games (the number
 * is drawn at random) on their own reels. In the free games the heir who
 * called them pays as the scatter and retriggers, while the other heir takes
 * the throne: it plays as the MONARCH, wild and doubling. Free games
 * retrigger without limit.
 *
 * Ported 1:1 from slotopol/server (MIT), game/slot/novomatic/royaldynasty:
 * same reel strips, paytable, bet lines, wild, doubling and scatter rules and
 * the same free games draw, so slotopol's published figures carry over
 * exactly. Art, names and presentation are our own.
 */

/** Every symbol that can pay on a line. */
export type PaySymbol =
  | 'MONARCH' // slotopol sym 1, wild and top pay
  | 'KNIGHT' // 2
  | 'EAGLE' // 3
  | 'WOLF' // 4
  | 'CHALICE' // 5
  | 'SCEPTER' // 6
  | 'ACE' // 7
  | 'KING' // 8
  | 'QUEEN' // 9
  | 'JACK' // 10
  | 'TEN' // 11
  | 'NINE'; // 12

/** The two scatters (slotopol syms 13 and 14); neither has a line pay. */
export type Heir = 'HEIRESS' | 'HEIR';

export type SymbolId = PaySymbol | Heir;

/** Index order matches the slotopol numeric symbol ids (1-based). */
export const SYMBOL_ORDER: SymbolId[] = [
  'MONARCH',
  'KNIGHT',
  'EAGLE',
  'WOLF',
  'CHALICE',
  'SCEPTER',
  'ACE',
  'KING',
  'QUEEN',
  'JACK',
  'TEN',
  'NINE',
  'HEIRESS',
  'HEIR',
];

/**
 * The MONARCH: wild on the lines (he joins any run from the left) and a run
 * of his own pays from 2, 10 / 200 / 1200 / 5000 line bets. A run he helps
 * complete pays double; his own run never does.
 */
export const WILD: SymbolId = 'MONARCH';

/**
 * The scatters, in the order the base game checks them: 3+ HEIRESS call the
 * free games, else 3+ HEIR do (slotopol checks scat1 first, so a grid with
 * 3+ of both is the HEIRESS's).
 */
export const HEIRS: readonly Heir[] = ['HEIRESS', 'HEIR'];

/** In free games called by one heir, the other takes the throne. */
export function otherHeir(heir: Heir): Heir {
  return heir === 'HEIRESS' ? 'HEIR' : 'HEIRESS';
}

export const REELS = 5;
export const ROWS = 3;
export const LINES = 20;

/**
 * The free games a trigger awards: one of these, drawn uniformly at random
 * (slotopol Freegames, rand.N over the list), on the first call and again on
 * every retrigger. 35 on average.
 */
export const FREE_GAMES_DRAW: readonly number[] = [25, 30, 35, 40, 45];

/** grid[reel][row], 5x3 */
export type Grid = SymbolId[][];

export interface LineWin {
  /** payline index (0-based) */
  line: number;
  /** the symbol the line pays as */
  symbol: PaySymbol;
  /** leftmost run length (2-5 for the MONARCH's own run, else 3-5), wilds included */
  count: number;
  /** 2 when a wild helped complete the run, else 1 */
  mult: 1 | 2;
  /** value in TOTAL-bet multiples, the double included */
  amount: number;
  /** [reel, row] cells that form the win */
  positions: [number, number][];
}

/** 3+ of one heir anywhere: the free games, and in the free games a scatter pay. */
export interface ScatterHit {
  /** the heir that hit */
  symbol: Heir;
  /** how many of that heir anywhere on the grid (3-5) */
  count: number;
  /** [reel, row] of every one */
  positions: [number, number][];
  /** scatter pay in TOTAL-bet multiples: 5, 25 or 500 in the free games, nothing in the base game */
  amount: number;
}

export interface SpinResult {
  /** the grid exactly as the reels landed (a crowned heir still shows as itself here) */
  grid: Grid;
  lineWins: LineWin[];
  /** present exactly when this spin awards free games */
  scatterHit?: ScatterHit;
  /**
   * Free games this spin awards: the draw (25 to 45) when scatterHit is
   * present, else 0. evaluate() scores the grid only and leaves it 0; the
   * draw needs the RNG, so playRound() fills it in.
   */
  freeSpinsWon: number;
  /** true on a free game */
  freeGame: boolean;
  /**
   * Free games only: the heir who called them. It pays as the scatter and
   * retriggers; the other heir plays as the MONARCH. Null in the base game.
   */
  caller: Heir | null;
  /** sum of all wins, in TOTAL-bet multiples */
  totalWin: number;
}

/** The free games: the drawn number of spins on the free-games reels, retriggerable. */
export interface BonusResult {
  /** the heir whose 3+ called the free games, for the whole session */
  caller: Heir;
  spins: SpinResult[];
  /** free games played in total, retriggers included */
  spinsPlayed: number;
  /** number of retriggers that happened */
  retriggers: number;
  /** every draw in order: the opening award, then one per retrigger */
  draws: number[];
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
