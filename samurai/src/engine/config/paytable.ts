import type { SymbolId } from '../types';

/**
 * Line pays in PER-LINE-BET units, indexed by run length 1-5 (slotopol
 * LinePay). Divide by LINES for total-bet multiples. Every run pays from 3.
 * The GONG has no line pay; it is listed with zeros like slotopol's empty
 * row.
 */
export const LINE_PAY: Record<SymbolId, readonly number[]> = {
  SAMURAI: [0, 0, 100, 500, 1000],
  DRAGON: [0, 0, 80, 250, 800],
  TIGER: [0, 0, 40, 200, 600],
  ONI: [0, 0, 40, 200, 600],
  HELMET: [0, 0, 30, 150, 500],
  FAN: [0, 0, 30, 150, 500],
  ACE: [0, 0, 10, 50, 200],
  KING: [0, 0, 10, 30, 150],
  QUEEN: [0, 0, 10, 30, 150],
  JACK: [0, 0, 10, 20, 100],
  TEN: [0, 0, 10, 20, 100],
  GONG: [0, 0, 0, 0, 0],
};

/** The fewest GONGs that pay and award free games (slotopol ScanScatters: count >= 3). */
export const SCAT_MIN = 3;

/**
 * GONG scatter pay in TOTAL-bet multiples, indexed by count 1-5 (slotopol
 * ScatPay, paid as bet x lines x pay). It pays in the base game and in the
 * free games alike.
 */
export const SCAT_PAY: readonly number[] = [0, 0, 2, 20, 200];

/** Free games awarded, indexed by GONG count 1-5 (slotopol ScatFreespin). */
export const SCAT_FREESPIN: readonly number[] = [0, 0, 10, 10, 10];
