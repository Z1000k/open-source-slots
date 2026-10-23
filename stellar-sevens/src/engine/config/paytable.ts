import type { SymbolId } from '../types';

/**
 * Pay for 3-of-a-kind on a line, in PER-LINE-BET units (slotopol LinePay).
 * Only full lines pay; there are no shorter runs and no scatter. Divide by
 * LINES for total-bet multiples - every entry is a multiple of 5 so the
 * results stay whole numbers.
 */
export const LINE_PAY: Record<SymbolId, number> = {
  SEVEN: 300,
  STAR: 200,
  MELON: 100,
  GRAPES: 80,
  BELL: 80,
  ORANGE: 40,
  PLUM: 40,
  LEMON: 40,
  CHERRY: 40,
};
