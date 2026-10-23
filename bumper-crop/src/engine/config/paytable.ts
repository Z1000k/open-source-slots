import type { PaySymbol } from '../types';

/**
 * Line pays in PER-LINE-BET units, indexed by run length 1-5 (slotopol
 * LinePay). Divide by LINES for total-bet multiples. Nothing pays for fewer
 * than 3 in a row. SCARECROW is the wild and also the top payer: a line of
 * leading wilds is scored on its own and the better of the two wins is paid,
 * exactly as slotopol's ScanLined does it.
 */
export const LINE_PAY: Record<PaySymbol, readonly number[]> = {
  SCARECROW: [0, 0, 100, 750, 5000],
  COW: [0, 0, 75, 300, 1000],
  RAM: [0, 0, 50, 150, 500],
  PIG: [0, 0, 50, 150, 500],
  RABBIT: [0, 0, 30, 100, 300],
  ROOSTER: [0, 0, 30, 100, 300],
  ACE: [0, 0, 15, 75, 200],
  KING: [0, 0, 15, 75, 200],
  QUEEN: [0, 0, 10, 50, 150],
  JACK: [0, 0, 10, 50, 150],
  TEN: [0, 0, 5, 25, 75],
  NINE: [0, 0, 5, 25, 75],
};

/**
 * TRACTOR scatter pays in TOTAL-bet multiples, indexed by count 1-5 (slotopol
 * ScatPay is per-line-bet times Sel, which is exactly the total bet). 3 or
 * more also open the barn ladder bonus, and the scatter pay is kept as well:
 * that is how slotopol's own RTP figures for this game are made up.
 */
export const SCAT_PAY: readonly number[] = [0, 0, 5, 20, 200];
