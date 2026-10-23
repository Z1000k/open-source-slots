/**
 * The 20 fixed bet lines — slotopol BetLinesNvm5x3v1 ("Novomatic 5x3 slots
 * bet 20 lines"), converted from 1-based to 0-based rows.
 * PAYLINES[line][reel] = row.
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
  [0, 1, 1, 1, 2], // 11
  [0, 0, 1, 0, 0], // 12
  [2, 2, 1, 2, 2], // 13
  [1, 0, 1, 2, 1], // 14
  [1, 2, 1, 0, 1], // 15
  [0, 1, 0, 1, 0], // 16
  [2, 1, 2, 1, 2], // 17
  [1, 1, 0, 1, 1], // 18
  [1, 1, 2, 1, 1], // 19
  [0, 1, 1, 1, 0], // 20
];
