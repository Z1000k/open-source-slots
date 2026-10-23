import type { SymbolId } from '../types';

/**
 * Line pays in PER-LINE-BET units, indexed by run length 1-5 (slotopol
 * LinePay). Divide by LINES for total-bet multiples. GALLEON never pays; it
 * is listed with zeros so a scatter can end a run without a special case,
 * exactly like slotopol's empty row.
 */
export const LINE_PAY: Record<SymbolId, readonly number[]> = {
  CAPTAIN: [0, 10, 100, 1000, 5000],
  CROWN: [0, 5, 50, 200, 1000],
  CHEST: [0, 5, 25, 100, 500],
  COMPASS: [0, 5, 15, 75, 250],
  ACE: [0, 0, 10, 40, 150],
  KING: [0, 0, 10, 40, 150],
  QUEEN: [0, 0, 10, 40, 150],
  JACK: [0, 0, 5, 20, 100],
  TEN: [0, 0, 5, 20, 100],
  GALLEON: [0, 0, 0, 0, 0],
};

/**
 * Free games awarded, indexed by GALLEON count 1-5 (slotopol ScanScatters:
 * 3 or more anywhere award 10). The GALLEON has no pay of its own.
 */
export const SCAT_FREESPIN: readonly number[] = [0, 0, 10, 10, 10];
