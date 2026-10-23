import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/engine/evaluate';
import { playRound } from '../src/engine/round';
import { mulberry32 } from '../src/engine/rng';
import { ACTIVE_REELS, FREE_REELS } from '../src/engine/config/reelSets';
import { GAME_RTP } from '../src/engine/config/rtp';
import type { Grid, SymbolId } from '../src/engine/types';

type Row = [SymbolId, SymbolId, SymbolId, SymbolId, SymbolId];

// grid[reel][row]; helper builds a 5x3 grid from rows for readability
function fromRows(rows: [Row, Row, Row]): Grid {
  return Array.from({ length: 5 }, (_, x) => rows.map((r) => r[x])) as Grid;
}

/** Line 1 is the top row, line 0 the middle one, line 3 the V - see config/paylines.ts. */
const TOP = 1;
const V = 3;

/** Middle and bottom rows that complete no line under the top rows used below. */
const MID: Row = ['QUEEN', 'JACK', 'TEN', 'JACK', 'TEN'];
const BOT: Row = ['KING', 'TEN', 'JACK', 'TEN', 'JACK'];

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('reel sets', () => {
  it('deals the original Dynasty of Ra base strips, and claims the proven RTP', () => {
    expect(ACTIVE_REELS.rtp).toBe(95.189553);
    // exact.ts and parsheet.ts both prove this figure; slotopol's label above is not it
    expect(GAME_RTP).toBe(95.182099);
  });
});

describe('evaluate, main game lines', () => {
  it('pays a leftmost run, per line bet over 10 lines', () => {
    // top line: three ACEs, LinePay 10 -> 10/10 of the total bet
    const r = evaluate(fromRows([['ACE', 'ACE', 'ACE', 'LOTUS', 'KING'], MID, BOT]));
    expect(r.lineWins).toHaveLength(1);
    expect(r.lineWins[0]).toMatchObject({ line: TOP, symbol: 'ACE', count: 3 });
    expect(r.lineWins[0].amount).toBeCloseTo(10 / 10, 12);
    expect(r.totalWin).toBeCloseTo(10 / 10, 12);
    expect(r.freeGame).toBe(false);
    expect(r.wayWin).toBeUndefined();
  });

  it('lets a SUN DISC stand in anywhere on the line', () => {
    // ACE SUNDISC ACE ACE KING -> 4 ACE = 30
    const r = evaluate(fromRows([['ACE', 'SUNDISC', 'ACE', 'ACE', 'KING'], MID, BOT]));
    expect(r.lineWins).toHaveLength(1);
    expect(r.lineWins[0]).toMatchObject({ line: TOP, symbol: 'ACE', count: 4 });
    expect(r.lineWins[0].amount).toBeCloseTo(30 / 10, 12);
    expect(r.totalWin).toBeCloseTo(30 / 10, 12);
  });

  it('joins leading SUN DISCs to the run behind them', () => {
    // SUNDISC SUNDISC QUEEN QUEEN QUEEN -> 5 QUEEN = 100
    const r = evaluate(fromRows([['SUNDISC', 'SUNDISC', 'QUEEN', 'QUEEN', 'QUEEN'], MID, BOT]));
    const top = r.lineWins.find((w) => w.line === TOP);
    expect(top).toMatchObject({ symbol: 'QUEEN', count: 5 });
    expect(top!.positions).toHaveLength(5);
    expect(top!.amount).toBeCloseTo(100 / 10, 12);
  });

  it('carries a PHARAOH through four SUN DISCs to the top line pay, and pays the 4 discs too', () => {
    const r = evaluate(fromRows([['PHARAOH', 'SUNDISC', 'SUNDISC', 'SUNDISC', 'SUNDISC'], MID, BOT]));
    const top = r.lineWins.find((w) => w.line === TOP);
    expect(top).toMatchObject({ symbol: 'PHARAOH', count: 5 });
    expect(top!.amount).toBeCloseTo(1000 / 10, 12);
    expect(r.scatterHit).toMatchObject({ count: 4, amount: 20 });
    expect(r.freeSpinsWon).toBe(10);
    expect(r.totalWin).toBeCloseTo(20 + sum(r.lineWins.map((w) => w.amount)), 12);
  });

  it('pays nothing for a line of SUN DISCs alone, but 5 of them pay 200x as the scatter', () => {
    const r = evaluate(fromRows([['SUNDISC', 'SUNDISC', 'SUNDISC', 'SUNDISC', 'SUNDISC'], MID, BOT]));
    expect(r.lineWins.find((w) => w.line === TOP)).toBeUndefined();
    expect(r.scatterHit).toMatchObject({ count: 5, amount: 200 });
    expect(r.freeSpinsWon).toBe(10);
    expect(r.totalWin).toBeCloseTo(200 + sum(r.lineWins.map((w) => w.amount)), 12);
  });

  it('pays the five picture symbols from 2 in a row and the cards only from 3', () => {
    // FALCON FALCON -> 5 on the top line, and line 9 shares those two cells
    const pics = evaluate(fromRows([['FALCON', 'FALCON', 'KING', 'ANKH', 'LOTUS'], MID, BOT]));
    expect(pics.lineWins).toHaveLength(2);
    expect(pics.lineWins.find((w) => w.line === TOP)).toMatchObject({ symbol: 'FALCON', count: 2 });
    expect(pics.totalWin).toBeCloseTo(10 / 10, 12);
    const cards = evaluate(fromRows([['KING', 'KING', 'ACE', 'LOTUS', 'COBRA'], MID, BOT]));
    expect(cards.lineWins).toHaveLength(0);
    expect(cards.totalWin).toBe(0);
  });
});

describe('evaluate, free games', () => {
  it('pays one V line in the main game, and the best way on every line in the free games', () => {
    // a PHARAOH on each of reels 1-3, one per row
    const grid = fromRows([
      ['PHARAOH', 'JACK', 'ACE', 'TEN', 'KING'],
      ['QUEEN', 'PHARAOH', 'JACK', 'ACE', 'TEN'],
      ['KING', 'TEN', 'PHARAOH', 'QUEEN', 'JACK'],
    ]);
    const base = evaluate(grid);
    expect(base.lineWins).toHaveLength(1);
    expect(base.lineWins[0]).toMatchObject({ line: V, symbol: 'PHARAOH', count: 3 });
    expect(base.totalWin).toBeCloseTo(50 / 10, 12);

    const free = evaluate(grid, true);
    expect(free.freeGame).toBe(true);
    expect(free.wayWin).toMatchObject({ symbol: 'PHARAOH', count: 3, amount: 50 });
    expect(free.wayWin!.positions).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
    expect(free.lineWins).toHaveLength(10);
    for (const w of free.lineWins) {
      expect(w).toMatchObject({ symbol: 'PHARAOH', count: 3 });
      expect(w.amount).toBeCloseTo(50 / 10, 12);
    }
    expect(free.totalWin).toBeCloseTo(50, 12);
  });

  it('pays the best way, not the highest symbol', () => {
    // TEN on all five reels (100) beats two PHARAOHs (10)
    const r = evaluate(
      fromRows([
        ['PHARAOH', 'KING', 'TEN', 'JACK', 'QUEEN'],
        ['TEN', 'PHARAOH', 'QUEEN', 'TEN', 'KING'],
        ['ACE', 'TEN', 'JACK', 'ACE', 'TEN'],
      ]),
      true,
    );
    expect(r.wayWin).toMatchObject({ symbol: 'TEN', count: 5, amount: 100 });
    expect(r.wayWin!.positions).toHaveLength(5);
    expect(r.totalWin).toBeCloseTo(100, 12);
  });

  it('gives a tie to the higher symbol, at the same pay', () => {
    // ANKH and LOTUS both run reels 1-3 for 20
    const r = evaluate(
      fromRows([
        ['ANKH', 'LOTUS', 'ANKH', 'KING', 'JACK'],
        ['LOTUS', 'ANKH', 'JACK', 'QUEEN', 'TEN'],
        ['KING', 'QUEEN', 'LOTUS', 'TEN', 'ACE'],
      ]),
      true,
    );
    expect(r.wayWin).toMatchObject({ symbol: 'ANKH', count: 3, amount: 20 });
    expect(r.totalWin).toBeCloseTo(20, 12);
  });

  it('pays five PHARAOHs anywhere on the reels 1000x the total bet', () => {
    const r = evaluate(
      fromRows([
        ['PHARAOH', 'QUEEN', 'TEN', 'PHARAOH', 'JACK'],
        ['ACE', 'PHARAOH', 'ACE', 'KING', 'PHARAOH'],
        ['KING', 'JACK', 'PHARAOH', 'QUEEN', 'TEN'],
      ]),
      true,
    );
    expect(r.wayWin).toMatchObject({ symbol: 'PHARAOH', count: 5, amount: 1000 });
    expect(r.lineWins).toHaveLength(10);
    for (const w of r.lineWins) expect(w.amount).toBeCloseTo(100, 12);
    expect(r.totalWin).toBeCloseTo(1000, 12);
  });

  it('never lets the SUN DISC stand in during the free games', () => {
    // ANKH SUNDISC ANKH: 3 ANKH on the top line in the main game, nothing in the free games
    const grid = fromRows([['ANKH', 'SUNDISC', 'ANKH', 'KING', 'QUEEN'], MID, BOT]);
    const top = evaluate(grid).lineWins.find((w) => w.line === TOP);
    expect(top).toMatchObject({ symbol: 'ANKH', count: 3 });
    expect(top!.amount).toBeCloseTo(20 / 10, 12);
    const free = evaluate(grid, true);
    expect(free.wayWin).toBeUndefined();
    expect(free.lineWins).toHaveLength(0);
    expect(free.totalWin).toBe(0);
  });
});

describe('evaluate, SUN DISC scatter', () => {
  /**
   * Rows that form no line in the main game and no way in the free games;
   * with SUN DISCs only on reels 1, 4 and 5 no line can reach 3 either.
   */
  const withDiscs = (cells: [number, number][], freeGame = false) => {
    const rows: [Row, Row, Row] = [
      ['KING', 'JACK', 'ACE', 'TEN', 'QUEEN'],
      ['TEN', 'QUEEN', 'KING', 'ACE', 'JACK'],
      ['JACK', 'ACE', 'TEN', 'QUEEN', 'KING'],
    ];
    for (const [x, y] of cells) rows[y][x] = 'SUNDISC';
    return evaluate(fromRows(rows), freeGame);
  };

  it('gives nothing for two SUN DISCs', () => {
    const r = withDiscs([
      [0, 0],
      [4, 2],
    ]);
    expect(r.scatterHit).toBeUndefined();
    expect(r.freeSpinsWon).toBe(0);
    expect(r.totalWin).toBe(0);
  });

  it('pays 2x the total bet for three and awards 10 free games', () => {
    const r = withDiscs([
      [0, 0],
      [3, 1],
      [4, 2],
    ]);
    expect(r.lineWins).toHaveLength(0);
    expect(r.scatterHit).toMatchObject({ count: 3, amount: 2 });
    expect(r.scatterHit!.positions).toHaveLength(3);
    expect(r.freeSpinsWon).toBe(10);
    expect(r.totalWin).toBe(2);
  });

  it('pays 20x for four and 200x for five, 10 free games either way', () => {
    const four = withDiscs(
      [
        [0, 0],
        [1, 1],
        [2, 2],
        [3, 0],
      ],
      true,
    );
    expect(four.scatterHit).toMatchObject({ count: 4, amount: 20 });
    expect(four.freeSpinsWon).toBe(10);
    expect(four.totalWin).toBe(20);
    const five = withDiscs(
      [
        [0, 0],
        [1, 1],
        [2, 2],
        [3, 0],
        [4, 1],
      ],
      true,
    );
    expect(five.scatterHit).toMatchObject({ count: 5, amount: 200 });
    expect(five.freeSpinsWon).toBe(10);
    expect(five.totalWin).toBe(200);
  });

  it('retriggers 10 more free games, with the scatter pay, inside the free games', () => {
    const r = withDiscs(
      [
        [0, 0],
        [3, 1],
        [4, 2],
      ],
      true,
    );
    expect(r.freeGame).toBe(true);
    expect(r.wayWin).toBeUndefined();
    expect(r.scatterHit).toMatchObject({ count: 3, amount: 2 });
    expect(r.freeSpinsWon).toBe(10);
    expect(r.totalWin).toBe(2);
  });
});

describe('playRound', () => {
  /** True when `col` is 3 consecutive symbols of `strip`, wrapping. */
  const isWindow = (strip: SymbolId[], col: SymbolId[]) =>
    strip.some((_, s) => col.every((sym, y) => strip[(s + y) % strip.length] === sym));

  it('settles the free games in full, retriggers included, on the right strips', () => {
    let checked = 0;
    let retriggered = 0;
    let freeOnly = 0;
    for (let seed = 1; seed < 200_000 && (checked < 40 || retriggered < 3); seed++) {
      const r = playRound(mulberry32(seed));
      r.baseSpin.grid.forEach((col, x) => expect(isWindow(ACTIVE_REELS.reels[x], col)).toBe(true));
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
        s.grid.forEach((col, x) => {
          expect(isWindow(FREE_REELS[x], col)).toBe(true);
          if (!isWindow(ACTIVE_REELS.reels[x], col)) freeOnly++;
        });
      }
      const bonusSum = sum(r.bonus.spins.map((s) => s.totalWin));
      expect(r.bonus.totalWin).toBeCloseTo(bonusSum, 9);
      expect(r.totalWin).toBeCloseTo(r.baseSpin.totalWin + bonusSum, 9);
    }
    expect(checked).toBeGreaterThanOrEqual(40);
    expect(retriggered).toBeGreaterThanOrEqual(3);
    // the stacked free strips show windows the base strips cannot
    expect(freeOnly).toBeGreaterThan(0);
  });
});
