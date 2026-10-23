/**
 * BUMPER CROP — 5x3, 25-line cascading farm slot with a ladder bonus.
 *
 * Math ported 1:1 from slotopol/server (MIT), game/slot/novomatic/cashfarm:
 * same reel strips, paytable, 25 fixed bet lines, wild rule, scatter rule,
 * avalanche behaviour and bonus ladder, so slotopol's published RTP figures
 * carry over. Art, name and presentation are our own.
 */

/** Paying symbols, in slotopol's numeric id order (1-based). */
export type PaySymbol =
  | 'SCARECROW' // slotopol sym 1, the wild, and the top payer
  | 'COW' // 2
  | 'RAM' // 3
  | 'PIG' // 4
  | 'RABBIT' // 5
  | 'ROOSTER' // 6
  | 'ACE' // 7
  | 'KING' // 8
  | 'QUEEN' // 9
  | 'JACK' // 10
  | 'TEN' // 11
  | 'NINE'; // 12

export type SymbolId = PaySymbol | 'TRACTOR'; // 13, scatter, never pays on a line

/** Index order matches the slotopol numeric symbol ids (1-based). */
export const SYMBOL_ORDER: SymbolId[] = [
  'SCARECROW',
  'COW',
  'RAM',
  'PIG',
  'RABBIT',
  'ROOSTER',
  'ACE',
  'KING',
  'QUEEN',
  'JACK',
  'TEN',
  'NINE',
  'TRACTOR',
];

export const WILD: SymbolId = 'SCARECROW';
export const SCATTER: SymbolId = 'TRACTOR';

export const REELS = 5;
export const ROWS = 3;
/** Fixed, exactly as in the original: the player cannot deselect lines. */
export const LINES = 25;

/**
 * slotopol's FallLimit: an avalanche chain is abandoned after this many falls.
 * With these strips the longest chain ever enumerated is 11, so the limit is
 * a safety net, not a rule the player can reach.
 */
export const FALL_LIMIT = 20;

/**
 * The most one barn ladder can ever pay, in TOTAL-bet multiples.
 *
 * Each floor offers a best case, and floors 2 and 3 force a choice between
 * their golden prize and their golden multiplier, since either one ends the
 * floor. Taking the multiplier on both is what maximises the product:
 *
 *   floor 1  3 plain 14s then a golden 14        56
 *   floor 2  2 plain 14s then the multiplier     28, x2
 *   floor 3  1 plain 14 then the multiplier      14, x3
 *   floor 4  the 24 then the multiplier          24, x4
 *   floor 5  the 50                              50
 *            172 collected, multiplied by 4  =  688
 *
 * Informational, like the original math there is no cap mechanic. A round can
 * open more than one ladder, so it is not a round cap either.
 */
export const MAX_LADDER_WIN = 688;

/** grid[reel][row], 5 columns of 3, row 0 is the top. */
export type Grid = SymbolId[][];

export interface LineWin {
  /** payline index (0-based) */
  line: number;
  /** the paying symbol; wilds joined the run and count toward it */
  symbol: PaySymbol;
  /** leftmost run length (3-5) */
  count: number;
  /** value in TOTAL-bet multiples */
  amount: number;
  /** [reel, row] cells that form the win */
  positions: [number, number][];
}

export interface ScatterWin {
  /** TRACTOR count anywhere on the grid (3-5) */
  count: number;
  /** value in TOTAL-bet multiples */
  amount: number;
  /** [reel, row] of every TRACTOR */
  positions: [number, number][];
}

/** One cell on the bonus ladder. */
export interface BonusCell {
  /** 'pay' adds its value, 'mult' adds 1 to the multiplier, 'bucket' ends the bonus */
  kind: 'pay' | 'mult' | 'bucket';
  /** pay value in TOTAL-bet multiples (0 for mult and bucket cells) */
  value: number;
  /** revealing this cell climbs to the next level */
  climbs: boolean;
}

/** One level of the ladder, already shuffled, in reveal order. */
export interface BonusLevel {
  cells: BonusCell[];
  /** how many cells of this level were revealed (the rest are never seen) */
  revealed: number;
}

export interface BonusResult {
  levels: BonusLevel[];
  /** how many levels were entered (1-5) */
  levelsReached: number;
  /** collected pay before the multiplier, in TOTAL-bet multiples */
  pay: number;
  /** final multiplier, starts at 1 and rises by 1 per mult cell */
  multiplier: number;
  /** pay x multiplier, in TOTAL-bet multiples */
  totalWin: number;
}

/** One drop of the grid: the base spin is fall 0, each avalanche adds one. */
export interface Fall {
  /** fall index, 0 for the base spin */
  index: number;
  grid: Grid;
  lineWins: LineWin[];
  scatterWin?: ScatterWin;
  /** awarded when the scatter win triggers it, once per fall at most */
  bonus?: BonusResult;
  /** [reel, row] cells that pay and so are cleared before the next fall */
  cleared: [number, number][];
  /** sum of this fall's wins, bonus included, in TOTAL-bet multiples */
  win: number;
}

/** One complete round: the base spin plus its whole avalanche chain. */
export interface RoundResult {
  /** every fall that PAID, opening drop first */
  falls: Fall[];
  /**
   * The grid the round comes to rest on. When the last paying fall harvested
   * something, this is what dropped in afterwards and paid nothing, which is
   * what the player is left looking at. With no win at all it is the opening
   * grid unchanged.
   */
  finalGrid: Grid;
  /** number of paying avalanche falls after the opening drop */
  cascades: number;
  /** total round win in TOTAL-bet multiples */
  totalWin: number;
}
