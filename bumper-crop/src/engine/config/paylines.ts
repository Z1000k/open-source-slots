/**
 * The 25 fixed bet lines, copied from slotopol BetLinesNvm5x3v3 (their rows
 * are 1-based, ours are 0-based, so every value is one lower). PAYLINES[i][x]
 * is the row this line uses on reel x. Row 0 is the top.
 *
 * The player cannot change the line count: the original game fixes all 25,
 * and slotopol's SetSel returns "feature unavailable".
 */
export const PAYLINES: readonly (readonly number[])[] = [
  [1, 1, 1, 1, 1], // 1
  [0, 0, 0, 0, 0], // 2
  [2, 2, 2, 2, 2], // 3
  [0, 1, 2, 1, 0], // 4
  [2, 1, 0, 1, 2], // 5
  [1, 2, 2, 2, 1], // 6
  [1, 0, 0, 0, 1], // 7
  [2, 2, 1, 0, 0], // 8
  [0, 0, 1, 2, 2], // 9
  [2, 1, 1, 1, 0], // 10
  [0, 1, 1, 1, 2], // 11
  [1, 2, 1, 0, 1], // 12
  [1, 0, 1, 2, 1], // 13
  [0, 1, 0, 1, 0], // 14
  [2, 1, 2, 1, 2], // 15
  [1, 1, 0, 1, 1], // 16
  [1, 1, 2, 1, 1], // 17
  [0, 2, 0, 2, 0], // 18
  [2, 0, 2, 0, 2], // 19
  [2, 0, 1, 0, 2], // 20
  [0, 2, 1, 2, 0], // 21
  [0, 0, 2, 0, 0], // 22
  [2, 2, 0, 2, 2], // 23
  [1, 0, 2, 0, 1], // 24
  [1, 2, 0, 2, 1], // 25
];
