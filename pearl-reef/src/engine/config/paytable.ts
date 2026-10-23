import type { SymbolId } from '../types';

/**
 * Line pays in PER-LINE-BET units, indexed by run length 1-5 (slotopol
 * LinePay). Divide by LINES for total-bet multiples. CLAM never pays on a
 * line; it is listed with zeros so a scatter can end a run without a special
 * case, exactly like slotopol's empty row.
 */
export const LINE_PAY: Record<SymbolId, readonly number[]> = {
  TURTLE: [0, 10, 250, 2500, 9000],
  SHARK: [0, 2, 25, 125, 750],
  OCTOPUS: [0, 2, 25, 125, 750],
  JELLYFISH: [0, 0, 20, 100, 400],
  PUFFERFISH: [0, 0, 15, 75, 250],
  STARFISH: [0, 0, 15, 75, 250],
  ACE: [0, 0, 10, 50, 125],
  KING: [0, 0, 10, 50, 125],
  QUEEN: [0, 0, 5, 25, 100],
  JACK: [0, 0, 5, 25, 100],
  TEN: [0, 0, 5, 25, 100],
  NINE: [0, 2, 5, 25, 100],
  CLAM: [0, 0, 0, 0, 0],
};

/**
 * CLAM scatter pays in TOTAL-bet multiples, indexed by count 1-5 (slotopol
 * ScatPay is per-line-bet times Sel, which is exactly the total bet).
 */
export const SCAT_PAY: readonly number[] = [0, 2, 5, 20, 500];

/** Free games awarded, indexed by CLAM count 1-5 (slotopol ScatFreespin). */
export const SCAT_FREESPIN: readonly number[] = [0, 0, 15, 15, 15];
