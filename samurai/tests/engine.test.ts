import { describe, expect, it } from 'vitest';
import { evaluate, wildReelsOf } from '../src/engine/evaluate';
import { playRound } from '../src/engine/round';
import { mulberry32 } from '../src/engine/rng';
import { ACTIVE_REELS, FREE_REELS, REEL_SETS } from '../src/engine/config/reelSets';
import { GAME_RTP } from '../src/engine/config/rtp';
import type { Grid, SymbolId } from '../src/engine/types';

type Row = [SymbolId, SymbolId, SymbolId, SymbolId, SymbolId];

// grid[reel][row]; helper builds a 5x3 grid from rows for readability
function fromRows(rows: [Row, Row, Row]): Grid {
  return Array.from({ length: 5 }, (_, x) => rows.map((r) => r[x])) as Grid;
}

/** Line 0 is the middle row, line 1 the top one - see config/paylines.ts. */
const MIDDLE = 0;

/**
 * Top and bottom rows around a middle row under test. A GONG heads each, so
 * no line starting on them can pay (the GONG has no line pay, and two GONGs
 * pay nothing as scatters); only the six lines that start on the middle of
 * reel 1 can, and these rows break them on reel 2 unless a test says so.
 */
const TOP: Row = ['GONG', 'HELMET', 'FAN', 'HELMET', 'FAN'];
const BOT: Row = ['GONG', 'TIGER', 'DRAGON', 'TIGER', 'DRAGON'];

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('reel sets', () => {
  it('deals the original Katana strips at the proven 20-line RTP', () => {
    expect(REEL_SETS).toHaveLength(7);
    expect(ACTIVE_REELS.rtp).toBe(95.385457);
    // exact.ts and parsheet.ts both prove this figure for all 20 lines; slotopol's
    // label is the same reels scored on the middle line only
    expect(GAME_RTP).toBe(95.388785);
    expect(FREE_REELS.map((r) => r.length)).toEqual([33, 33, 33, 33, 33]);
  });
});

describe('evaluate, main game lines', () => {
  it('pays a leftmost run of 3, per line bet over 20 lines', () => {
    // middle line: three ACEs, LinePay 10 -> 10/20 of the total bet
    const r = evaluate(fromRows([TOP, ['ACE', 'ACE', 'ACE', 'ONI', 'KING'], BOT]));
    expect(r.lineWins).toHaveLength(1);
    expect(r.lineWins[0]).toMatchObject({ line: MIDDLE, symbol: 'ACE', count: 3 });
    expect(r.lineWins[0].positions).toEqual([
      [0, 1],
      [1, 1],
      [2, 1],
    ]);
    expect(r.totalWin).toBe(10 / 20);
    expect(r.freeGame).toBe(false);
    expect(r.wildReels).toEqual([]);
  });

  it('pays nothing for 2 in a row, even of a top symbol', () => {
    for (const sym of ['DRAGON', 'ACE', 'TEN'] as const) {
      const r = evaluate(fromRows([TOP, [sym, sym, 'KING', 'ONI', 'FAN'], BOT]));
      expect(r.lineWins).toHaveLength(0);
      expect(r.totalWin).toBe(0);
    }
  });

  it('lets the SAMURAI stand in anywhere on the line, without doubling', () => {
    // ACE SAMURAI ACE ACE KING -> 4 ACE = 50
    const r = evaluate(fromRows([TOP, ['ACE', 'SAMURAI', 'ACE', 'ACE', 'KING'], BOT]));
    expect(r.lineWins).toHaveLength(1);
    expect(r.lineWins[0]).toMatchObject({ line: MIDDLE, symbol: 'ACE', count: 4 });
    expect(r.totalWin).toBe(50 / 20);
  });

  it('joins leading SAMURAI to the run behind them', () => {
    // SAMURAI SAMURAI QUEEN QUEEN QUEEN -> 5 QUEEN = 150 (2 samurai alone pay nothing).
    // Line 20 (middle, middle, top, middle, middle) shares the two samurai and reads
    // the FAN on top of reel 3: 3 FAN = 30, the substitution doing its job there too.
    const r = evaluate(fromRows([TOP, ['SAMURAI', 'SAMURAI', 'QUEEN', 'QUEEN', 'QUEEN'], BOT]));
    expect(r.lineWins.map((w) => [w.line, w.symbol, w.count])).toEqual([
      [MIDDLE, 'QUEEN', 5],
      [19, 'FAN', 3],
    ]);
    expect(r.lineWins[0].positions).toHaveLength(5);
    expect(r.totalWin).toBe((150 + 30) / 20);
  });

  it('pays a run of SAMURAI as the top symbol when that is worth more', () => {
    // 3 samurai = 100 beats 4 QUEEN = 30
    const r = evaluate(fromRows([TOP, ['SAMURAI', 'SAMURAI', 'SAMURAI', 'QUEEN', 'KING'], BOT]));
    const mid = r.lineWins.find((w) => w.line === MIDDLE);
    expect(mid).toMatchObject({ symbol: 'SAMURAI', count: 3 });
    expect(mid!.positions).toHaveLength(3);
    expect(mid!.amount).toBe(100 / 20);
  });

  it('gives a tie to the SAMURAI, at the same pay', () => {
    // 3 samurai = 100, 5 JACK = 100
    const r = evaluate(fromRows([TOP, ['SAMURAI', 'SAMURAI', 'SAMURAI', 'JACK', 'JACK'], BOT]));
    const mid = r.lineWins.find((w) => w.line === MIDDLE);
    expect(mid).toMatchObject({ symbol: 'SAMURAI', count: 3 });
    expect(mid!.amount).toBe(100 / 20);
  });

  it('never turns a reel wild in the main game', () => {
    // a SAMURAI on the top row of reels 2 and 3 helps only the lines that cross him there
    const r = evaluate(
      fromRows([
        ['ACE', 'SAMURAI', 'SAMURAI', 'TEN', 'JACK'],
        ['KING', 'TIGER', 'ONI', 'QUEEN', 'TEN'],
        ['QUEEN', 'FAN', 'HELMET', 'JACK', 'QUEEN'],
      ]),
    );
    expect(r.wildReels).toEqual([]);
    // line 2 (top row) ACE x3, line 8 (middle, top, top, top, middle) KING x3, line 19 QUEEN x3
    expect(r.lineWins.map((w) => [w.line, w.symbol, w.count])).toEqual([
      [1, 'ACE', 3],
      [7, 'KING', 3],
      [18, 'QUEEN', 3],
    ]);
    expect(r.totalWin).toBe(30 / 20);
  });
});

describe('evaluate, GONG scatter', () => {
  /** Card rows that form no line; GONGs pay nothing on a line, so placing them adds none. */
  const withGongs = (cells: [number, number][], freeGame = false) => {
    const rows: [Row, Row, Row] = [
      ['KING', 'JACK', 'ACE', 'TEN', 'QUEEN'],
      ['TEN', 'QUEEN', 'KING', 'ACE', 'JACK'],
      ['JACK', 'ACE', 'TEN', 'QUEEN', 'KING'],
    ];
    for (const [x, y] of cells) rows[y][x] = 'GONG';
    return evaluate(fromRows(rows), freeGame);
  };

  it('gives nothing for two GONGs', () => {
    const r = withGongs([
      [0, 0],
      [4, 2],
    ]);
    expect(r.scatterHit).toBeUndefined();
    expect(r.freeSpinsWon).toBe(0);
    expect(r.totalWin).toBe(0);
  });

  it('pays 2x for three and awards 10 free games', () => {
    const r = withGongs([
      [0, 0],
      [2, 1],
      [4, 2],
    ]);
    expect(r.lineWins).toHaveLength(0);
    expect(r.scatterHit).toMatchObject({ count: 3, amount: 2 });
    expect(r.scatterHit!.positions).toHaveLength(3);
    expect(r.freeSpinsWon).toBe(10);
    expect(r.totalWin).toBe(2);
  });

  it('pays 20x for four and 200x for five, 10 free games either way', () => {
    const four = withGongs([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 0],
    ]);
    expect(four.scatterHit).toMatchObject({ count: 4, amount: 20 });
    expect(four.freeSpinsWon).toBe(10);
    const five = withGongs([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 0],
      [4, 1],
    ]);
    expect(five.scatterHit).toMatchObject({ count: 5, amount: 200 });
    expect(five.freeSpinsWon).toBe(10);
    expect(five.totalWin).toBe(200);
  });

  it('pays and retriggers the same way in the free games', () => {
    const r = withGongs(
      [
        [0, 0],
        [2, 1],
        [4, 2],
      ],
      true,
    );
    expect(r.freeGame).toBe(true);
    expect(r.scatterHit).toMatchObject({ count: 3, amount: 2 });
    expect(r.freeSpinsWon).toBe(10);
  });
});

describe('evaluate, free games', () => {
  const twoTaken = fromRows([
    ['ACE', 'SAMURAI', 'SAMURAI', 'TEN', 'JACK'],
    ['KING', 'TIGER', 'ONI', 'QUEEN', 'TEN'],
    ['QUEEN', 'FAN', 'HELMET', 'JACK', 'QUEEN'],
  ]);

  it('turns every reel showing a SAMURAI wild, for every line', () => {
    const r = evaluate(twoTaken, true);
    expect(r.freeGame).toBe(true);
    expect(r.wildReels).toEqual([1, 2]);
    // reels 2 and 3 read wild on every row, so all 20 lines make 3 of what reel 1 shows;
    // lines 5, 11 and 17 run on through QUEEN, QUEEN to 5 QUEEN = 150, the rest pay 10
    expect(r.lineWins).toHaveLength(20);
    const fives = r.lineWins.filter((w) => w.count === 5).map((w) => w.line);
    expect(fives).toEqual([4, 10, 16]);
    for (const w of r.lineWins) expect(w.symbol).toBe(w.count === 5 ? 'QUEEN' : ['ACE', 'KING', 'QUEEN'][PAY_ROW[w.line]]);
    expect(r.totalWin).toBe((17 * 10 + 3 * 150) / 20);
    // the grid itself stays as it landed
    expect(r.grid).toBe(twoTaken);
  });

  it('pays 1000x the total bet when all five reels are taken', () => {
    const grid = fromRows([
      ['SAMURAI', 'ACE', 'KING', 'QUEEN', 'JACK'],
      ['TEN', 'SAMURAI', 'ACE', 'SAMURAI', 'KING'],
      ['QUEEN', 'JACK', 'SAMURAI', 'TEN', 'SAMURAI'],
    ]);
    const r = evaluate(grid, true);
    expect(r.wildReels).toEqual([0, 1, 2, 3, 4]);
    expect(r.lineWins).toHaveLength(20);
    for (const w of r.lineWins) expect(w).toMatchObject({ symbol: 'SAMURAI', count: 5 });
    expect(r.totalWin).toBe(1000);
  });

  it('reads the taken reels back off any grid', () => {
    expect(wildReelsOf(twoTaken)).toEqual([1, 2]);
    expect(wildReelsOf(fromRows([TOP, ['ACE', 'ACE', 'ACE', 'DRAGON', 'KING'], BOT]))).toEqual([]);
  });
});

/** Which row reel 1 sits on for each line (0 top, 1 middle, 2 bottom), for the two-taken grid's symbols. */
const PAY_ROW = [1, 0, 2, 0, 2, 0, 2, 1, 1, 0, 2, 1, 1, 0, 2, 0, 2, 0, 2, 1];

describe('playRound', () => {
  /** True when `col` is 3 consecutive symbols of `strip`, wrapping. */
  const isWindow = (strip: SymbolId[], col: SymbolId[]) =>
    strip.some((_, s) => col.every((sym, y) => strip[(s + y) % strip.length] === sym));

  it('settles the free games in full on their own reels, retriggers included', () => {
    let checked = 0;
    let retriggered = 0;
    let taken = 0;
    for (let seed = 1; seed < 400_000 && (checked < 60 || retriggered < 3); seed++) {
      const r = playRound(mulberry32(seed));
      r.baseSpin.grid.forEach((col, x) => expect(isWindow(ACTIVE_REELS.reels[x], col)).toBe(true));
      expect(r.baseSpin.wildReels).toEqual([]);
      if (!r.bonus) continue;
      checked++;
      if (r.bonus.retriggers > 0) retriggered++;
      expect(r.baseSpin.freeSpinsWon).toBe(10);
      expect(r.baseSpin.freeGame).toBe(false);
      // every retrigger adds another 10 spins to the session
      expect(r.bonus.spins.length).toBe(10 + r.bonus.retriggers * 10);
      expect(r.bonus.spinsPlayed).toBe(r.bonus.spins.length);
      for (const s of r.bonus.spins) {
        expect(s.freeGame).toBe(true);
        s.grid.forEach((col, x) => expect(isWindow(FREE_REELS[x], col)).toBe(true));
        // the board is handed grids only and reads the taken reels back
        expect(s.wildReels).toEqual(wildReelsOf(s.grid));
        taken += s.wildReels.length;
      }
      const bonusSum = sum(r.bonus.spins.map((s) => s.totalWin));
      expect(r.bonus.totalWin).toBeCloseTo(bonusSum, 9);
      expect(r.totalWin).toBeCloseTo(r.baseSpin.totalWin + bonusSum, 9);
    }
    expect(checked).toBeGreaterThanOrEqual(60);
    expect(retriggered).toBeGreaterThanOrEqual(3);
    expect(taken).toBeGreaterThan(0);
  });
});
