import type { SymbolId } from '../types';

/**
 * Line pays in PER-LINE-BET units, indexed by run length 1-5 (slotopol
 * LinePay). Divide by LINES for total-bet multiples. The MONARCH's own run
 * pays from 2, every other run from 3. The heirs have no line pay; they are
 * listed with zeros like slotopol's empty rows.
 */
export const LINE_PAY: Record<SymbolId, readonly number[]> = {
  MONARCH: [0, 10, 200, 1200, 5000],
  KNIGHT: [0, 0, 25, 100, 500],
  EAGLE: [0, 0, 20, 80, 300],
  WOLF: [0, 0, 20, 80, 300],
  CHALICE: [0, 0, 15, 60, 200],
  SCEPTER: [0, 0, 15, 60, 200],
  ACE: [0, 0, 10, 50, 150],
  KING: [0, 0, 10, 50, 150],
  QUEEN: [0, 0, 5, 25, 100],
  JACK: [0, 0, 5, 25, 100],
  TEN: [0, 0, 5, 25, 100],
  NINE: [0, 0, 5, 25, 100],
  HEIRESS: [0, 0, 0, 0, 0],
  HEIR: [0, 0, 0, 0, 0],
};

/** The shortest run of the MONARCH's own that pays (slotopol: numw >= 2). */
export const WILD_RUN_MIN = 2;
/** The shortest run of any other symbol that pays (slotopol: numl >= 3). */
export const RUN_MIN = 3;
/** A run a wild helped complete pays this many times over (slotopol mw = 2). */
export const WILD_MULT = 2;

/** The fewest of one heir that call the free games (slotopol: count >= 3). */
export const SCAT_MIN = 3;

/**
 * The calling heir's scatter pay in the FREE GAMES, in TOTAL-bet multiples,
 * indexed by count 1-5 (slotopol ScatPay, paid as bet x lines x pay). In the
 * base game the heirs pay nothing; they only call the free games.
 */
export const SCAT_PAY: readonly number[] = [0, 0, 5, 25, 500];
