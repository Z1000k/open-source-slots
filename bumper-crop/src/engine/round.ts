import type { Fall, Grid, RoundResult, SymbolId } from './types';
import { FALL_LIMIT, REELS, ROWS } from './types';
import type { RNG } from './rng';
import { randInt } from './rng';
import { clearedCells, evaluate } from './evaluate';
import { playBonus } from './bonus';
import { ACTIVE_REELS } from './config/reelSets';

/** Cyclic reel lookup that also accepts negative positions (slotopol ReelAt). */
export function reelAt(reel: SymbolId[], pos: number): SymbolId {
  const n = reel.length;
  return reel[((pos % n) + n) % n];
}

/** State the avalanche needs between falls: the grid and each reel's position. */
interface Board {
  grid: Grid;
  /** strip index showing in the top row of each reel */
  seed: number[];
}

/** The opening drop: every reel stops at a random position. */
function baseRoll(rng: RNG, reels: SymbolId[][]): Board {
  const grid: Grid = [];
  const seed: number[] = [];
  for (let x = 0; x < REELS; x++) {
    const reel = reels[x];
    const pos = randInt(rng, reel.length);
    const col: SymbolId[] = [];
    for (let y = 0; y < ROWS; y++) col.push(reel[(pos + y) % reel.length]);
    grid.push(col);
    seed.push(pos);
  }
  return { grid, seed };
}

/**
 * Clear the winning cells and let the column fall into the gaps, topping up
 * from the strip above (slotopol Cascade5x3.PushFall). The reel rolls BACKWARDS
 * by exactly as many symbols as were cleared from that column, so the new
 * symbols are the ones that were sitting just above the window.
 */
function pushFall(board: Board, reels: SymbolId[][], cleared: [number, number][]): void {
  const hits: boolean[][] = [];
  for (let x = 0; x < REELS; x++) hits.push(new Array(ROWS).fill(false));
  for (const [x, y] of cleared) hits[x][y] = true;

  for (let x = 0; x < REELS; x++) {
    const col = board.grid[x];
    let n = 0;
    for (let y = 0; y < ROWS; y++) {
      if (!hits[x][y]) continue;
      // everything above this cell drops one row into it
      for (let i = 0; i < y; i++) col[y - i] = col[y - i - 1];
      n++;
    }
    board.seed[x] -= n;
    for (let y = 0; y < n; y++) col[y] = reelAt(reels[x], board.seed[x] + y);
  }
}

function copyGrid(grid: Grid): Grid {
  return grid.map((col) => col.slice());
}

/**
 * Play one round: the base spin, then the whole avalanche chain it sets off.
 *
 * Winning symbols are cleared, the columns fall, and the new grid is scored
 * again; the chain runs until a fall pays nothing. Every fall can pay lines,
 * pay scatters and open the barn ladder, so one round can hold several
 * bonuses. All amounts are in TOTAL-bet multiples.
 */
export function playRound(rng: RNG, reels: SymbolId[][] = ACTIVE_REELS): RoundResult {
  const board = baseRoll(rng, reels);
  const falls: Fall[] = [];
  let totalWin = 0;

  for (let index = 0; index < FALL_LIMIT; index++) {
    const scan = evaluate(board.grid);
    // a fall that pays nothing ends the round, and is what the player is left
    // looking at rather than something the round records as a win
    if (index > 0 && scan.win === 0) break;

    const cleared = clearedCells(scan);
    const bonus = scan.bonusTriggered ? playBonus(rng) : undefined;
    const win = scan.win + (bonus?.totalWin ?? 0);
    totalWin += win;

    falls.push({
      index,
      grid: copyGrid(board.grid),
      lineWins: scan.lineWins,
      scatterWin: scan.scatterWin,
      bonus,
      cleared,
      win,
    });

    if (cleared.length === 0) break;
    pushFall(board, reels, cleared);
  }

  return {
    falls,
    finalGrid: copyGrid(board.grid),
    cascades: Math.max(0, falls.length - 1),
    totalWin,
  };
}
