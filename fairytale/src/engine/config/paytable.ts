import type { SymbolId } from '../types';

/**
 * Line pays in PER-LINE-BET units, indexed by run length 1-5 (slotopol
 * LinePay). Divide by LINES for total-bet multiples. The LANTERN and the
 * BLANK have no line pay; they are listed with zeros like slotopol's empty
 * row.
 */
export const LINE_PAY: Record<SymbolId, readonly number[]> = {
  ENCHANTRESS: [0, 10, 250, 2500, 9000],
  UNICORN: [0, 2, 25, 125, 750],
  GRIFFIN: [0, 2, 25, 125, 750],
  CASTLE: [0, 0, 20, 100, 400],
  SLIPPER: [0, 0, 15, 75, 250],
  MIRROR: [0, 0, 15, 75, 250],
  ACE: [0, 0, 10, 50, 125],
  KING: [0, 0, 10, 50, 125],
  QUEEN: [0, 0, 5, 25, 100],
  JACK: [0, 0, 5, 25, 100],
  TEN: [0, 0, 5, 25, 100],
  NINE: [0, 2, 5, 25, 100],
  LANTERN: [0, 0, 0, 0, 0],
  BLANK: [0, 0, 0, 0, 0],
};

/**
 * LANTERN scatter pay in TOTAL-bet multiples, indexed by count 1-5 (slotopol
 * ScatPay, paid as bet x lines x pay). It pays in the base game and in the
 * free games alike.
 */
export const SCAT_PAY: readonly number[] = [0, 2, 5, 75, 750];

/** Free games awarded, indexed by LANTERN count 1-5 (slotopol ScatFreespin). */
export const SCAT_FREESPIN: readonly number[] = [0, 0, 10, 10, 10];

/**
 * How many reels from the left the expanding symbol covers in the free games
 * (slotopol ReelNumBon): 2 for the symbols that pay from two of a kind and
 * for the LANTERN, 3 for the rest. Read per symbol, as slotopol's par sheet
 * (CalcStatBon) reads it; its live SpinBon indexes the table one place off,
 * which would cover 3 reels for the GRIFFIN and 2 for the TEN and crash on
 * the LANTERN, so it cannot be the game its published figures describe. The
 * ENCHANTRESS is never drawn.
 */
export const EXPAND_REELS: Record<SymbolId, number> = {
  ENCHANTRESS: 2,
  UNICORN: 2,
  GRIFFIN: 2,
  CASTLE: 3,
  SLIPPER: 3,
  MIRROR: 3,
  ACE: 3,
  KING: 3,
  QUEEN: 3,
  JACK: 3,
  TEN: 3,
  NINE: 2,
  LANTERN: 2,
  BLANK: 0,
};
