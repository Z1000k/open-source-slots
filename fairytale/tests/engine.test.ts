import { describe, expect, it } from 'vitest';
import { evaluate, expansionOf } from '../src/engine/evaluate';
import { playRound } from '../src/engine/round';
import { mulberry32 } from '../src/engine/rng';
import { ACTIVE_REELS, EXPAND_POOL, FREE_REELS } from '../src/engine/config/reelSets';
import { EXPAND_REELS } from '../src/engine/config/paytable';
import { GAME_RTP } from '../src/engine/config/rtp';
import type { Expansion, Grid, SymbolId } from '../src/engine/types';

type Row = [SymbolId, SymbolId, SymbolId, SymbolId, SymbolId];

// grid[reel][row]; helper builds a 5x3 grid from rows for readability
function fromRows(rows: [Row, Row, Row]): Grid {
  return Array.from({ length: 5 }, (_, x) => rows.map((r) => r[x])) as Grid;
}

/** Line 0 is the middle row, line 1 the top one - see config/paylines.ts. */
const MIDDLE = 0;

/**
 * Top and bottom rows of cards around a middle row under test. No line can
 * start a paying run on them, and with them no other line joins a middle
 * run unless a test says so.
 */
const TOP: Row = ['KING', 'JACK', 'ACE', 'TEN', 'KING'];
const BOT: Row = ['JACK', 'TEN', 'QUEEN', 'ACE', 'JACK'];

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('reel sets', () => {
  it('deals the original Fairy Queen strips at the proven RTP', () => {
    expect(ACTIVE_REELS.rtp).toBe(95.566989);
    // exact.ts and parsheet.ts both prove this figure, and it is slotopol's label
    expect(GAME_RTP).toBe(95.566989);
    expect(EXPAND_POOL).toHaveLength(28);
    expect(FREE_REELS.map((r) => r.length)).toEqual([0, 0, 55, 55, 55]);
  });
});

describe('evaluate, main game lines', () => {
  it('pays a leftmost run, per line bet over 10 lines', () => {
    // middle line: three ACEs, LinePay 10 -> 10/10 of the total bet
    const r = evaluate(fromRows([TOP, ['ACE', 'ACE', 'ACE', 'CASTLE', 'KING'], BOT]));
    expect(r.lineWins).toHaveLength(1);
    expect(r.lineWins[0]).toMatchObject({ line: MIDDLE, symbol: 'ACE', count: 3 });
    expect(r.lineWins[0].amount).toBeCloseTo(10 / 10, 12);
    expect(r.totalWin).toBeCloseTo(10 / 10, 12);
    expect(r.freeGame).toBe(false);
    expect(r.expand).toBeUndefined();
  });

  it('lets the ENCHANTRESS stand in anywhere on the line, without doubling', () => {
    // ACE ENCHANTRESS ACE ACE KING -> 4 ACE = 50
    const r = evaluate(fromRows([TOP, ['ACE', 'ENCHANTRESS', 'ACE', 'ACE', 'KING'], BOT]));
    expect(r.lineWins).toHaveLength(1);
    expect(r.lineWins[0]).toMatchObject({ line: MIDDLE, symbol: 'ACE', count: 4 });
    expect(r.lineWins[0].amount).toBeCloseTo(50 / 10, 12);
    expect(r.totalWin).toBeCloseTo(50 / 10, 12);
  });

  it('joins leading ENCHANTRESSES to the run behind them', () => {
    // ENCHANTRESS ENCHANTRESS QUEEN QUEEN QUEEN -> 5 QUEEN = 100 beats 2 enchantresses = 10
    const r = evaluate(fromRows([TOP, ['ENCHANTRESS', 'ENCHANTRESS', 'QUEEN', 'QUEEN', 'QUEEN'], BOT]));
    expect(r.lineWins).toHaveLength(1);
    expect(r.lineWins[0]).toMatchObject({ line: MIDDLE, symbol: 'QUEEN', count: 5 });
    expect(r.lineWins[0].positions).toHaveLength(5);
    expect(r.totalWin).toBeCloseTo(100 / 10, 12);
  });

  it('pays a run of ENCHANTRESSES as the top symbol when that is worth more', () => {
    // 3 enchantresses = 250 beats 4 QUEEN = 25
    const r = evaluate(fromRows([TOP, ['ENCHANTRESS', 'ENCHANTRESS', 'ENCHANTRESS', 'QUEEN', 'KING'], BOT]));
    const mid = r.lineWins.find((w) => w.line === MIDDLE);
    expect(mid).toMatchObject({ symbol: 'ENCHANTRESS', count: 3 });
    expect(mid!.positions).toHaveLength(3);
    expect(mid!.amount).toBeCloseTo(250 / 10, 12);
  });

  it('gives a tie to the ENCHANTRESS, at the same pay', () => {
    // 2 enchantresses = 10, 3 KING = 10
    const r = evaluate(fromRows([TOP, ['ENCHANTRESS', 'ENCHANTRESS', 'KING', 'CASTLE', 'MIRROR'], BOT]));
    expect(r.lineWins).toHaveLength(1);
    expect(r.lineWins[0]).toMatchObject({ line: MIDDLE, symbol: 'ENCHANTRESS', count: 2 });
    expect(r.totalWin).toBeCloseTo(10 / 10, 12);
  });

  it('pays UNICORN, GRIFFIN and NINE from 2 in a row, everything else from 3', () => {
    for (const sym of ['UNICORN', 'GRIFFIN', 'NINE'] as const) {
      const r = evaluate(fromRows([TOP, [sym, sym, 'KING', 'CASTLE', 'MIRROR'], BOT]));
      expect(r.lineWins).toHaveLength(1);
      expect(r.lineWins[0]).toMatchObject({ line: MIDDLE, symbol: sym, count: 2 });
      expect(r.totalWin).toBeCloseTo(2 / 10, 12);
    }
    for (const sym of ['CASTLE', 'SLIPPER', 'ACE', 'TEN'] as const) {
      const r = evaluate(fromRows([TOP, [sym, sym, 'KING', 'MIRROR', 'QUEEN'], BOT]));
      expect(r.lineWins).toHaveLength(0);
      expect(r.totalWin).toBe(0);
    }
  });
});

describe('evaluate, LANTERN scatter', () => {
  /** Card rows that form no line; LANTERNs pay nothing on a line, so placing them adds none. */
  const withLanterns = (cells: [number, number][]) => {
    const rows: [Row, Row, Row] = [
      ['KING', 'JACK', 'ACE', 'TEN', 'QUEEN'],
      ['TEN', 'QUEEN', 'KING', 'ACE', 'JACK'],
      ['JACK', 'ACE', 'TEN', 'QUEEN', 'KING'],
    ];
    for (const [x, y] of cells) rows[y][x] = 'LANTERN';
    return evaluate(fromRows(rows));
  };

  it('pays 2x the total bet for two LANTERNs, no free games', () => {
    const r = withLanterns([
      [0, 0],
      [4, 2],
    ]);
    expect(r.lineWins).toHaveLength(0);
    expect(r.scatterHit).toMatchObject({ count: 2, amount: 2 });
    expect(r.freeSpinsWon).toBe(0);
    expect(r.totalWin).toBe(2);
  });

  it('pays 5x for three and awards 10 free games', () => {
    const r = withLanterns([
      [0, 0],
      [2, 1],
      [4, 2],
    ]);
    expect(r.scatterHit).toMatchObject({ count: 3, amount: 5 });
    expect(r.scatterHit!.positions).toHaveLength(3);
    expect(r.freeSpinsWon).toBe(10);
    expect(r.totalWin).toBe(5);
  });

  it('pays 75x for four and 750x for five, 10 free games either way', () => {
    const four = withLanterns([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 0],
    ]);
    expect(four.scatterHit).toMatchObject({ count: 4, amount: 75 });
    expect(four.freeSpinsWon).toBe(10);
    const five = withLanterns([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 0],
      [4, 1],
    ]);
    expect(five.scatterHit).toMatchObject({ count: 5, amount: 750 });
    expect(five.freeSpinsWon).toBe(10);
    expect(five.totalWin).toBe(750);
  });

  it('gives nothing for one LANTERN', () => {
    const r = withLanterns([[2, 1]]);
    expect(r.scatterHit).toBeUndefined();
    expect(r.totalWin).toBe(0);
  });
});

describe('evaluate, free games', () => {
  const cover = (symbol: SymbolId): SymbolId[] =>
    symbol === 'LANTERN' ? ['BLANK', 'LANTERN', 'BLANK'] : [symbol, symbol, symbol];
  const freeGrid = (symbol: SymbolId, rest: SymbolId[][]): { grid: Grid; expand: Expansion } => {
    const reels = EXPAND_REELS[symbol];
    const grid: Grid = [];
    for (let x = 0; x < reels; x++) grid.push(cover(symbol));
    grid.push(...rest.slice(rest.length - (5 - reels)));
    return { grid, expand: { symbol, reels } };
  };

  it('pays the covered reels on every line: two UNICORN reels are 10 wins of 2', () => {
    const { grid, expand } = freeGrid('UNICORN', [
      ['KING', 'JACK', 'ACE'],
      ['TEN', 'QUEEN', 'KING'],
      ['ACE', 'TEN', 'JACK'],
    ]);
    expect(expand.reels).toBe(2);
    const r = evaluate(grid, expand);
    expect(r.freeGame).toBe(true);
    expect(r.expand).toEqual({ symbol: 'UNICORN', reels: 2 });
    expect(r.lineWins).toHaveLength(10);
    for (const w of r.lineWins) expect(w).toMatchObject({ symbol: 'UNICORN', count: 2 });
    expect(r.totalWin).toBeCloseTo((10 * 2) / 10, 12);
  });

  it('runs the drawn symbol on through the ENCHANTRESS on the free reels', () => {
    // CASTLE covers reels 1-3; reel 4 ENCHANTRESS/KING/QUEEN, reel 5 CASTLE/JACK/TEN
    const { grid, expand } = freeGrid('CASTLE', [
      ['ENCHANTRESS', 'KING', 'QUEEN'],
      ['CASTLE', 'JACK', 'TEN'],
    ]);
    expect(expand.reels).toBe(3);
    const r = evaluate(grid, expand);
    expect(r.lineWins).toHaveLength(10);
    const byLine = new Map(r.lineWins.map((w) => [w.line, w]));
    // line 1 (the top row) and line 7 (bottom, bottom, middle, top, top) reach CASTLE x5 = 400
    expect(byLine.get(1)).toMatchObject({ symbol: 'CASTLE', count: 5 });
    expect(byLine.get(7)).toMatchObject({ symbol: 'CASTLE', count: 5 });
    // line 6 (middle, top, top, top, middle) stops at 4 = 100, the other seven at 3 = 20
    expect(byLine.get(6)).toMatchObject({ symbol: 'CASTLE', count: 4 });
    expect(r.totalWin).toBeCloseTo((2 * 400 + 100 + 7 * 20) / 10, 12);
  });

  it('pays a LANTERN cover only as the scatter: the blanks block every line', () => {
    // KINGs straight along the top and bottom rows of reels 3-5 would pay from reel 3 if a
    // line could skip the blanks, which slotopol's live scan does and its par sheet does not
    const { grid, expand } = freeGrid('LANTERN', [
      ['KING', 'ACE', 'KING'],
      ['KING', 'QUEEN', 'KING'],
      ['KING', 'JACK', 'KING'],
    ]);
    const r = evaluate(grid, expand);
    expect(r.lineWins).toHaveLength(0);
    expect(r.scatterHit).toMatchObject({ count: 2, amount: 2 });
    expect(r.scatterHit!.positions).toEqual([
      [0, 1],
      [1, 1],
    ]);
    expect(r.freeSpinsWon).toBe(0);
    expect(r.totalWin).toBe(2);
  });

  it('retriggers 10 more free games when a LANTERN cover sees one more', () => {
    const { grid, expand } = freeGrid('LANTERN', [
      ['KING', 'LANTERN', 'ACE'],
      ['QUEEN', 'KING', 'JACK'],
      ['TEN', 'ACE', 'KING'],
    ]);
    const r = evaluate(grid, expand);
    expect(r.scatterHit).toMatchObject({ count: 3, amount: 5 });
    expect(r.freeSpinsWon).toBe(10);
    expect(r.totalWin).toBe(5);
  });
});

describe('expansionOf', () => {
  it('reads the drawn symbol and its reels back off a free-game grid', () => {
    const spun: SymbolId[][] = [
      ['KING', 'JACK', 'ACE'],
      ['TEN', 'QUEEN', 'KING'],
      ['ACE', 'TEN', 'JACK'],
    ];
    const unicorn: Grid = [['UNICORN', 'UNICORN', 'UNICORN'], ['UNICORN', 'UNICORN', 'UNICORN'], ...spun];
    expect(expansionOf(unicorn)).toEqual({ symbol: 'UNICORN', reels: 2 });
    const ace: Grid = [['ACE', 'ACE', 'ACE'], ['ACE', 'ACE', 'ACE'], ['ACE', 'ACE', 'ACE'], spun[1], spun[2]];
    expect(expansionOf(ace)).toEqual({ symbol: 'ACE', reels: 3 });
    const lantern: Grid = [['BLANK', 'LANTERN', 'BLANK'], ['BLANK', 'LANTERN', 'BLANK'], ...spun];
    expect(expansionOf(lantern)).toEqual({ symbol: 'LANTERN', reels: 2 });
  });

  it('finds no expansion on a main game grid or a single matching reel', () => {
    expect(expansionOf(fromRows([TOP, ['ACE', 'ACE', 'ACE', 'CASTLE', 'KING'], BOT]))).toBeUndefined();
    const one: Grid = [['ACE', 'ACE', 'ACE'], ['TEN', 'QUEEN', 'KING'], ['ACE', 'TEN', 'JACK'], ['KING', 'JACK', 'ACE'], ['TEN', 'QUEEN', 'KING']];
    expect(expansionOf(one)).toBeUndefined();
  });
});

describe('playRound', () => {
  /** True when `col` is 3 consecutive symbols of `strip`, wrapping. */
  const isWindow = (strip: SymbolId[], col: SymbolId[]) =>
    strip.some((_, s) => col.every((sym, y) => strip[(s + y) % strip.length] === sym));

  it('settles the free games in full, a fresh symbol drawn for every spin, retriggers included', () => {
    let checked = 0;
    let retriggered = 0;
    const drawn = new Set<SymbolId>();
    for (let seed = 1; seed < 400_000 && (checked < 60 || retriggered < 3); seed++) {
      const r = playRound(mulberry32(seed));
      r.baseSpin.grid.forEach((col, x) => expect(isWindow(ACTIVE_REELS.reels[x], col)).toBe(true));
      expect(expansionOf(r.baseSpin.grid)).toBeUndefined();
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
        const e = s.expand!;
        expect(EXPAND_POOL).toContain(e.symbol);
        expect(e.reels).toBe(EXPAND_REELS[e.symbol]);
        drawn.add(e.symbol);
        s.grid.forEach((col, x) => {
          if (x < e.reels) {
            expect(col).toEqual(e.symbol === 'LANTERN' ? ['BLANK', 'LANTERN', 'BLANK'] : [e.symbol, e.symbol, e.symbol]);
          } else expect(isWindow(FREE_REELS[x], col)).toBe(true);
        });
        // the board is handed grids only and reads the expansion back
        expect(expansionOf(s.grid)).toEqual(e);
      }
      const bonusSum = sum(r.bonus.spins.map((s) => s.totalWin));
      expect(r.bonus.totalWin).toBeCloseTo(bonusSum, 9);
      expect(r.totalWin).toBeCloseTo(r.baseSpin.totalWin + bonusSum, 9);
    }
    expect(checked).toBeGreaterThanOrEqual(60);
    expect(retriggered).toBeGreaterThanOrEqual(3);
    // 600+ draws reach every symbol in the pool
    expect([...drawn].sort()).toEqual([...new Set(EXPAND_POOL)].sort());
  });
});
