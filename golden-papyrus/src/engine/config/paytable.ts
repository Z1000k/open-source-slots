import type { PaySymbol } from '../types';

/**
 * Line pays in PER-LINE-BET units, indexed by run length 1-5 (slotopol
 * LinePay). Divide by LINES for total-bet multiples. The same table also
 * prices the expanding symbol in free games: the per-line pay for the count
 * of that symbol anywhere on the grid, collected on all 10 lines at once.
 */
export const LINE_PAY: Record<PaySymbol, readonly number[]> = {
  EXPLORER: [0, 10, 100, 1000, 5000],
  MUMMY: [0, 5, 40, 400, 2000],
  ANUBIS: [0, 5, 30, 100, 750],
  SCARAB: [0, 5, 30, 100, 750],
  ACE: [0, 0, 5, 40, 150],
  KING: [0, 0, 5, 40, 150],
  QUEEN: [0, 0, 5, 25, 100],
  JACK: [0, 0, 5, 25, 100],
  TEN: [0, 0, 5, 25, 100],
};

/**
 * PAPYRUS scatter pays in TOTAL-bet multiples, indexed by count 1-5 (slotopol
 * ScatPay is per-line-bet times Sel, which is exactly the total bet).
 */
export const SCAT_PAY: readonly number[] = [0, 0, 2, 20, 200];
