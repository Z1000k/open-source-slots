import type { SymbolId } from '../types';

/**
 * Line pays in PER-LINE-BET units, indexed by run length 1-5 (slotopol
 * LinePay). Divide by LINES for total-bet multiples. In the free games the
 * best way pays its line pay on all 10 lines, i.e. this figure in total-bet
 * multiples. The SUN DISC has no line pay; it is listed with zeros like
 * slotopol's empty row.
 */
export const LINE_PAY: Record<SymbolId, readonly number[]> = {
  PHARAOH: [0, 10, 50, 200, 1000],
  FALCON: [0, 5, 25, 100, 500],
  ANKH: [0, 5, 20, 50, 250],
  LOTUS: [0, 5, 20, 50, 250],
  COBRA: [0, 5, 20, 50, 250],
  ACE: [0, 0, 10, 30, 125],
  KING: [0, 0, 10, 30, 125],
  QUEEN: [0, 0, 5, 20, 100],
  JACK: [0, 0, 5, 20, 100],
  TEN: [0, 0, 5, 20, 100],
  SUNDISC: [0, 0, 0, 0, 0],
};

/**
 * SUN DISC scatter pay in TOTAL-bet multiples, indexed by count 1-5 (slotopol
 * ScatPay, paid as bet x lines x pay). It pays in the base game and in the
 * free games alike.
 */
export const SCAT_PAY: readonly number[] = [0, 0, 2, 20, 200];

/** Free games awarded, indexed by SUN DISC count 1-5 (slotopol ScatFreespin). */
export const SCAT_FREESPIN: readonly number[] = [0, 0, 10, 10, 10];
