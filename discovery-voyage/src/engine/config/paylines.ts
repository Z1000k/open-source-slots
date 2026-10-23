/**
 * The 10 fixed bet lines — slotopol BetLinesNvm10, converted from 1-based to
 * 0-based rows. PAYLINES[line][reel] = row.
 */
export const PAYLINES: readonly (readonly number[])[] = [
  [1, 1, 1, 1, 1], // 1 middle
  [0, 0, 0, 0, 0], // 2 top
  [2, 2, 2, 2, 2], // 3 bottom
  [0, 1, 2, 1, 0], // 4 V
  [2, 1, 0, 1, 2], // 5 inverted V
  [1, 2, 2, 2, 1], // 6
  [1, 0, 0, 0, 1], // 7
  [2, 2, 1, 0, 0], // 8
  [0, 0, 1, 2, 2], // 9
  [2, 1, 1, 1, 0], // 10
];
