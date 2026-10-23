/**
 * The 20 fixed bet lines — slotopol BetLinesNvm5x3v2 ("Novomatic 5x3 slots
 * bet 20 lines"), converted from 1-based to 0-based rows.
 * PAYLINES[line][reel] = row.
 */
export const PAYLINES: readonly (readonly number[])[] = [
  [1, 1, 1, 1, 1], // 1 middle
  [0, 0, 0, 0, 0], // 2 top
  [2, 2, 2, 2, 2], // 3 bottom
  [0, 1, 2, 1, 0], // 4 V
  [2, 1, 0, 1, 2], // 5 inverted V
  [0, 0, 1, 2, 2], // 6
  [2, 2, 1, 0, 0], // 7
  [1, 0, 0, 0, 1], // 8
  [1, 2, 2, 2, 1], // 9
  [0, 1, 1, 1, 0], // 10
  [2, 1, 1, 1, 2], // 11
  [1, 0, 1, 2, 1], // 12
  [1, 2, 1, 0, 1], // 13
  [0, 2, 0, 2, 0], // 14
  [2, 0, 2, 0, 2], // 15
  [0, 1, 0, 1, 0], // 16
  [2, 1, 2, 1, 2], // 17
  [0, 2, 2, 2, 2], // 18
  [2, 0, 0, 0, 0], // 19
  [1, 1, 0, 1, 1], // 20
];
