import type { SymbolId } from '../types';

/**
 * Line pays in PER-LINE-BET units, indexed by run length 1-5 (slotopol
 * LinePay). Divide by LINES for total-bet multiples. SUITCASE never pays on a
 * line; it is listed with zeros so a scatter can end a run without a special
 * case, exactly like slotopol's empty row.
 */
export const LINE_PAY: Record<SymbolId, readonly number[]> = {
  BANANA: [0, 10, 250, 2500, 9000],
  STRAWBERRY: [0, 2, 30, 120, 800],
  MELON: [0, 2, 30, 120, 800],
  PINEAPPLE: [0, 0, 20, 100, 400],
  MANGO: [0, 0, 20, 70, 250],
  COCONUT: [0, 0, 20, 70, 250],
  ACE: [0, 0, 10, 50, 120],
  KING: [0, 0, 10, 50, 120],
  QUEEN: [0, 0, 4, 30, 100],
  JACK: [0, 0, 4, 30, 100],
  TEN: [0, 0, 4, 30, 100],
  NINE: [0, 2, 4, 30, 100],
  SUITCASE: [0, 0, 0, 0, 0],
};

/**
 * SUITCASE scatter pays in TOTAL-bet multiples, indexed by count 1-5 (slotopol
 * ScatPay is per-line-bet times Sel, which is exactly the total bet).
 */
export const SCAT_PAY: readonly number[] = [0, 2, 4, 20, 500];

/** Free games awarded, indexed by SUITCASE count 1-5 (slotopol ScatFreespin). */
export const SCAT_FREESPIN: readonly number[] = [0, 0, 45, 45, 45];
