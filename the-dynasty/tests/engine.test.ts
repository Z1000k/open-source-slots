import { describe, expect, it } from 'vitest';
import { callerOf, evaluate } from '../src/engine/evaluate';
import { playRound } from '../src/engine/round';
import { mulberry32 } from '../src/engine/rng';
import { ACTIVE_REELS, FREE_REELS, REEL_SETS } from '../src/engine/config/reelSets';
import { GAME_RTP } from '../src/engine/config/rtp';
import { FREE_GAMES_DRAW, type Grid, type Heir, type SymbolId } from '../src/engine/types';

type Row = [SymbolId, SymbolId, SymbolId, SymbolId, SymbolId];

// grid[reel][row]; helper builds a 5x3 grid from rows for readability
function fromRows(rows: [Row, Row, Row]): Grid {
  return Array.from({ length: 5 }, (_, x) => rows.map((r) => r[x])) as Grid;
}

/** Line 0 is the middle row, line 1 the top one - see config/paylines.ts. */
const MIDDLE = 0;

/**
 * Top and bottom rows around a middle row under test, for the BASE game. An
 * heir heads each (one of each, so no call), and an heir pays nothing on a
 * line, so no line starting on them can pay; only the seven lines that start
 * on the middle of reel 1 can (lines 0, 5, 6, 13, 14, 17, 18), and these
 * rows break the ones that leave the middle row on reel 2. Lines 17 and 18
 * stay on the middle for reels 1 and 2 and read WOLF / SCEPTER on reel 3.
 */
const TOP: Row = ['HEIRESS', 'EAGLE', 'WOLF', 'EAGLE', 'WOLF'];
const BOT: Row = ['HEIR', 'CHALICE', 'SCEPTER', 'CHALICE', 'SCEPTER'];

/**
 * Card rows that form no line at all: reels 1 and 2 share no symbol, so no
 * run ever reaches 2. Replacing a cell with an heir that is not wild cannot
 * make one either.
 */
const filler = (): [Row, Row, Row] => [
  ['KING', 'JACK', 'ACE', 'TEN', 'QUEEN'],
  ['TEN', 'QUEEN', 'KING', 'ACE', 'JACK'],
  ['JACK', 'ACE', 'TEN', 'QUEEN', 'KING'],
];
const withCells = (cells: [number, number][], sym: SymbolId, caller: Heir | null = null) => {
  const rows = filler();
  for (const [x, y] of cells) rows[y][x] = sym;
  return evaluate(fromRows(rows), caller);
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('reel sets', () => {
  it('deals the original Royal Dynasty strips at the proven RTP', () => {
    expect(REEL_SETS).toHaveLength(18);
    expect(ACTIVE_REELS.rtp).toBe(94.138004);
    // exact.ts and parsheet.ts both prove this figure for the game as played
    expect(GAME_RTP).toBe(94.138004);
    expect(FREE_REELS.map((r) => r.length)).toEqual([33, 33, 33, 33, 33]);
  });
});

describe('evaluate, main game lines', () => {
  it('pays a leftmost run of 3, per line bet over 20 lines', () => {
    // middle line: three ACEs, LinePay 10 -> 10/20 of the total bet
    const r = evaluate(fromRows([TOP, ['ACE', 'ACE', 'ACE', 'KNIGHT', 'KING'], BOT]));
    expect(r.lineWins).toHaveLength(1);
    expect(r.lineWins[0]).toMatchObject({ line: MIDDLE, symbol: 'ACE', count: 3, mult: 1 });
    expect(r.lineWins[0].positions).toEqual([
      [0, 1],
      [1, 1],
      [2, 1],
    ]);
    expect(r.totalWin).toBe(10 / 20);
    expect(r.freeGame).toBe(false);
    expect(r.caller).toBeNull();
  });

  it('pays nothing for 2 in a row of anything but the MONARCH', () => {
    for (const sym of ['KNIGHT', 'ACE', 'NINE'] as const) {
      const r = evaluate(fromRows([TOP, [sym, sym, 'KING', 'WOLF', 'CHALICE'], BOT]));
      expect(r.lineWins).toHaveLength(0);
      expect(r.totalWin).toBe(0);
    }
  });

  it('pays the MONARCH from 2, without doubling his own run', () => {
    // M M HEIR: the heir pays nothing, so the line pays 2 MONARCH = 10.
    // Lines 17 and 18 run M M into WOLF / SCEPTER on reel 3: 3 of each, doubled.
    const r = evaluate(fromRows([TOP, ['MONARCH', 'MONARCH', 'HEIR', 'KING', 'WOLF'], BOT]));
    expect(r.lineWins.map((w) => [w.line, w.symbol, w.count, w.mult])).toEqual([
      [MIDDLE, 'MONARCH', 2, 1],
      [17, 'WOLF', 3, 2],
      [18, 'SCEPTER', 3, 2],
    ]);
    expect(r.totalWin).toBe((10 + 40 + 30) / 20);
    expect(r.scatterHit).toBeUndefined();
  });

  it('lets the MONARCH stand in anywhere on the line, doubling the run', () => {
    // ACE MONARCH ACE ACE KING -> 4 ACE = 50, doubled = 100
    const r = evaluate(fromRows([TOP, ['ACE', 'MONARCH', 'ACE', 'ACE', 'KING'], BOT]));
    expect(r.lineWins).toHaveLength(1);
    expect(r.lineWins[0]).toMatchObject({ line: MIDDLE, symbol: 'ACE', count: 4, mult: 2, amount: 100 / 20 });
    expect(r.totalWin).toBe(100 / 20);
  });

  it('joins leading MONARCHs to the run behind them, doubled', () => {
    // M M QUEEN QUEEN QUEEN -> 5 QUEEN = 100, doubled = 200 (beats 2 MONARCH = 10)
    const r = evaluate(fromRows([TOP, ['MONARCH', 'MONARCH', 'QUEEN', 'QUEEN', 'QUEEN'], BOT]));
    expect(r.lineWins.map((w) => [w.line, w.symbol, w.count, w.mult])).toEqual([
      [MIDDLE, 'QUEEN', 5, 2],
      [17, 'WOLF', 3, 2],
      [18, 'SCEPTER', 3, 2],
    ]);
    expect(r.lineWins[0].positions).toHaveLength(5);
    expect(r.totalWin).toBe((200 + 40 + 30) / 20);
  });

  it('pays a run of MONARCHs as his own when that is worth more than the doubled run', () => {
    // 3 MONARCH = 200 beats 4 QUEEN doubled = 50
    const r = evaluate(fromRows([TOP, ['MONARCH', 'MONARCH', 'MONARCH', 'QUEEN', 'KING'], BOT]));
    const mid = r.lineWins.find((w) => w.line === MIDDLE);
    expect(mid).toMatchObject({ symbol: 'MONARCH', count: 3, mult: 1, amount: 200 / 20 });
    expect(mid!.positions).toHaveLength(3);
  });

  it('gives a tie to the MONARCH, at the same pay', () => {
    // 3 MONARCH = 200, 5 JACK doubled = 200
    const r = evaluate(fromRows([TOP, ['MONARCH', 'MONARCH', 'MONARCH', 'JACK', 'JACK'], BOT]));
    const mid = r.lineWins.find((w) => w.line === MIDDLE);
    expect(mid).toMatchObject({ symbol: 'MONARCH', count: 3, mult: 1, amount: 200 / 20 });
  });

  it('never lets an heir pay on a line or stand in for anything in the main game', () => {
    const r = evaluate(fromRows([TOP, ['MONARCH', 'HEIR', 'QUEEN', 'QUEEN', 'QUEEN'], BOT]));
    expect(r.lineWins).toHaveLength(0);
    expect(r.totalWin).toBe(0);
    expect(withCells([[1, 1]], 'HEIR').lineWins).toHaveLength(0);
  });
});

describe('evaluate, the heirs in the main game', () => {
  it('gives nothing for two of an heir', () => {
    const r = withCells(
      [
        [0, 0],
        [4, 2],
      ],
      'HEIRESS',
    );
    expect(r.scatterHit).toBeUndefined();
    expect(r.totalWin).toBe(0);
    expect(callerOf(r.grid)).toBeNull();
  });

  it('lets 3+ of either heir call the free games, paying nothing themselves', () => {
    for (const heir of ['HEIRESS', 'HEIR'] as const) {
      const r = withCells(
        [
          [0, 0],
          [2, 1],
          [4, 2],
        ],
        heir,
      );
      expect(r.lineWins).toHaveLength(0);
      expect(r.scatterHit).toMatchObject({ symbol: heir, count: 3, amount: 0 });
      expect(r.scatterHit!.positions).toHaveLength(3);
      // the number of free games is drawn in playRound, not here
      expect(r.freeSpinsWon).toBe(0);
      expect(r.totalWin).toBe(0);
      expect(callerOf(r.grid)).toBe(heir);
    }
    const five = withCells(
      [
        [0, 0],
        [1, 1],
        [2, 2],
        [3, 0],
        [4, 1],
      ],
      'HEIR',
    );
    expect(five.scatterHit).toMatchObject({ symbol: 'HEIR', count: 5, amount: 0 });
  });

  it('checks the HEIRESS first, as slotopol does', () => {
    // no strip window holds both heirs, so this grid cannot land; the rule still has an order
    const rows = filler();
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [2, 0],
    ] as const)
      rows[y][x] = 'HEIRESS';
    for (const [x, y] of [
      [0, 2],
      [1, 2],
      [2, 2],
    ] as const)
      rows[y][x] = 'HEIR';
    const grid = fromRows(rows);
    expect(evaluate(grid).scatterHit?.symbol).toBe('HEIRESS');
    expect(callerOf(grid)).toBe('HEIRESS');
  });
});

describe('evaluate, free games', () => {
  /** reel 2's middle cell, crossed by lines 0, 3, 4, 9, 10, 15, 16, 17, 18, 19 */
  const center: [number, number][] = [[1, 1]];

  it('crowns the heir who did not call: wild and doubling, like the MONARCH', () => {
    const r = withCells(center, 'HEIR', 'HEIRESS');
    expect(r.freeGame).toBe(true);
    expect(r.caller).toBe('HEIRESS');
    // KING x HEIR x KING on lines 10 and 19, TEN x HEIR x TEN on line 18, all doubled
    expect(r.lineWins.map((w) => [w.line, w.symbol, w.count, w.mult])).toEqual([
      [10, 'KING', 3, 2],
      [18, 'TEN', 3, 2],
      [19, 'KING', 3, 2],
    ]);
    expect(r.totalWin).toBe((20 + 10 + 20) / 20);
    // the grid itself stays as it landed
    expect(r.grid[1][1]).toBe('HEIR');
  });

  it('never crowns the calling heir, and never an heir in the main game', () => {
    expect(withCells(center, 'HEIR', 'HEIR').lineWins).toHaveLength(0);
    expect(withCells(center, 'HEIR').lineWins).toHaveLength(0);
    expect(withCells(center, 'HEIRESS', 'HEIR').lineWins.map((w) => w.line)).toEqual([10, 18, 19]);
  });

  it('pays a run of crowned heirs as the MONARCH\'s own run', () => {
    const r = withCells(
      [
        [0, 1],
        [1, 1],
        [2, 1],
      ],
      'HEIRESS',
      'HEIR',
    );
    // 3 wild = 200 beats 4 ACE doubled = 100
    expect(r.lineWins.find((w) => w.line === MIDDLE)).toMatchObject({ symbol: 'MONARCH', count: 3, mult: 1, amount: 10 });
    // three of the crowned heir do not retrigger: only the caller counts
    expect(r.scatterHit).toBeUndefined();
  });

  it('pays the calling heir 5x / 25x / 500x the total bet and lets it retrigger', () => {
    const cells: [number, number][] = [
      [0, 0],
      [2, 1],
      [4, 2],
      [1, 2],
      [3, 0],
    ];
    const pays = [5, 25, 500];
    for (let k = 3; k <= 5; k++) {
      const r = withCells(cells.slice(0, k), 'HEIRESS', 'HEIRESS');
      expect(r.lineWins).toHaveLength(0);
      expect(r.scatterHit).toMatchObject({ symbol: 'HEIRESS', count: k, amount: pays[k - 3] });
      expect(r.freeSpinsWon).toBe(0);
      expect(r.totalWin).toBe(pays[k - 3]);
    }
  });
});

describe('playRound', () => {
  /** True when `col` is 3 consecutive symbols of `strip`, wrapping. */
  const isWindow = (strip: SymbolId[], col: SymbolId[]) =>
    strip.some((_, s) => col.every((sym, y) => strip[(s + y) % strip.length] === sym));

  it('settles the free games in full on their own reels, draws and retriggers included', () => {
    let checked = 0;
    let retriggered = 0;
    const callers = new Set<Heir>();
    const draws = new Set<number>();
    for (let seed = 1; seed < 400_000 && (checked < 60 || retriggered < 3 || callers.size < 2 || draws.size < 5); seed++) {
      const r = playRound(mulberry32(seed));
      r.baseSpin.grid.forEach((col, x) => expect(isWindow(ACTIVE_REELS.reels[x], col)).toBe(true));
      expect(r.baseSpin.freeGame).toBe(false);
      expect(r.baseSpin.caller).toBeNull();
      if (!r.bonus) {
        expect(r.baseSpin.scatterHit).toBeUndefined();
        expect(r.baseSpin.freeSpinsWon).toBe(0);
        expect(callerOf(r.baseSpin.grid)).toBeNull();
        continue;
      }
      checked++;
      if (r.bonus.retriggers > 0) retriggered++;
      // the board is handed grids only and reads the caller back off the base grid
      expect(r.bonus.caller).toBe(r.baseSpin.scatterHit!.symbol);
      expect(callerOf(r.baseSpin.grid)).toBe(r.bonus.caller);
      callers.add(r.bonus.caller);
      // the opening award and every retrigger are draws from 25 / 30 / 35 / 40 / 45
      expect(r.baseSpin.freeSpinsWon).toBe(r.bonus.draws[0]);
      for (const d of r.bonus.draws) {
        expect(FREE_GAMES_DRAW).toContain(d);
        draws.add(d);
      }
      expect(r.bonus.draws).toHaveLength(r.bonus.retriggers + 1);
      expect(r.bonus.spins.length).toBe(sum(r.bonus.draws));
      expect(r.bonus.spinsPlayed).toBe(r.bonus.spins.length);
      const retriggerDraws: number[] = [];
      for (const s of r.bonus.spins) {
        expect(s.freeGame).toBe(true);
        expect(s.caller).toBe(r.bonus.caller);
        s.grid.forEach((col, x) => expect(isWindow(FREE_REELS[x], col)).toBe(true));
        expect(s.freeSpinsWon > 0).toBe(s.scatterHit !== undefined);
        if (s.scatterHit) {
          expect(s.scatterHit.symbol).toBe(r.bonus.caller);
          retriggerDraws.push(s.freeSpinsWon);
        }
      }
      expect(retriggerDraws).toEqual(r.bonus.draws.slice(1));
      const bonusSum = sum(r.bonus.spins.map((s) => s.totalWin));
      expect(r.bonus.totalWin).toBeCloseTo(bonusSum, 9);
      expect(r.totalWin).toBeCloseTo(r.baseSpin.totalWin + bonusSum, 9);
    }
    expect(checked).toBeGreaterThanOrEqual(60);
    expect(retriggered).toBeGreaterThanOrEqual(3);
    expect([...callers].sort()).toEqual(['HEIR', 'HEIRESS']);
    expect([...draws].sort((a, b) => a - b)).toEqual([...FREE_GAMES_DRAW]);
  });
});
