import type { PaySymbol } from '../types';

/**
 * Line pays in PER-LINE-BET units, indexed by run length 1-5 (slotopol
 * LinePay). Divide by LINES for total-bet multiples — every entry is a
 * multiple of 5 so the results stay whole numbers.
 */
export const LINE_PAY: Record<PaySymbol, readonly number[]> = {
  SEVEN: [0, 0, 100, 1000, 5000],
  MELON: [0, 0, 50, 200, 500],
  GRAPES: [0, 0, 50, 200, 500],
  PLUM: [0, 0, 20, 50, 200],
  ORANGE: [0, 0, 20, 50, 200],
  LEMON: [0, 0, 20, 50, 200],
  CHERRY: [0, 5, 20, 50, 200],
};

/**
 * STAR scatter pays in TOTAL-bet multiples, indexed by count 1-5 (slotopol
 * ScatPay is per-line-bet times Sel, which is exactly the total bet).
 */
export const SCAT_PAY: readonly number[] = [0, 0, 2, 10, 50];
