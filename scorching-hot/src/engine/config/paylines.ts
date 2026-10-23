/**
 * The 5 fixed bet lines — slotopol BetLinesNvm10[:5], converted from 1-based
 * to 0-based rows. PAYLINES[line][reel] = row.
 */
export const PAYLINES: readonly (readonly number[])[] = [
  [1, 1, 1, 1, 1], // middle
  [0, 0, 0, 0, 0], // top
  [2, 2, 2, 2, 2], // bottom
  [0, 1, 2, 1, 0], // V
  [2, 1, 0, 1, 2], // inverted V
];
