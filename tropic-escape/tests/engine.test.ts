import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/engine/evaluate';
import { playRound } from '../src/engine/round';
import { mulberry32 } from '../src/engine/rng';
import type { Grid, SymbolId } from '../src/engine/types';

type Row = [SymbolId, SymbolId, SymbolId, SymbolId, SymbolId];

// grid[reel][row]; helper builds a 5x3 grid from rows for readability
function fromRows(rows: [Row, Row, Row]): Grid {
  return Array.from({ length: 5 }, (_, x) => rows.map((r) => r[x])) as Grid;
}

/** Line 1 is the top row, line 0 the middle one - see config/paylines.ts. */
const TOP = 1;

describe('evaluate, lines', () => {
  it('pays a leftmost run, per-line-bet over 9 lines', () => {
    // top line: three ACEs, LinePay 10 -> 10/9 of the total bet
    const r = evaluate(
      fromRows([
        ['ACE', 'ACE', 'ACE', 'MANGO', 'KING'],
        ['QUEEN', 'JACK', 'TEN', 'JACK', 'TEN'],
        ['KING', 'TEN', 'JACK', 'TEN', 'JACK'],
      ]),
    );
    const top = r.lineWins.find((w) => w.line === TOP);
    expect(top).toMatchObject({ symbol: 'ACE', count: 3, mult: 1 });
    expect(top!.amount).toBeCloseTo(10 / 9, 12);
  });

  it('doubles a run a BANANA joined', () => {
    // top line: MANGO BANANA MANGO MANGO ACE -> 4 MANGO = 70, doubled = 140
    const r = evaluate(
      fromRows([
        ['MANGO', 'BANANA', 'MANGO', 'MANGO', 'ACE'],
        ['QUEEN', 'JACK', 'TEN', 'JACK', 'TEN'],
        ['KING', 'TEN', 'JACK', 'TEN', 'JACK'],
      ]),
    );
    expect(r.lineWins).toHaveLength(1);
    expect(r.lineWins[0]).toMatchObject({ line: TOP, symbol: 'MANGO', count: 4, mult: 2 });
    expect(r.lineWins[0].amount).toBeCloseTo(140 / 9, 12);
    expect(r.totalWin).toBeCloseTo(140 / 9, 12);
  });

  it('substitutes leading BANANAs into the run behind them', () => {
    // BANANA BANANA QUEEN QUEEN QUEEN -> 5 QUEEN = 100 doubled = 200,
    // which beats paying the two BANANAs on their own (10)
    const r = evaluate(
      fromRows([
        ['BANANA', 'BANANA', 'QUEEN', 'QUEEN', 'QUEEN'],
        ['TEN', 'JACK', 'TEN', 'JACK', 'TEN'],
        ['KING', 'TEN', 'JACK', 'TEN', 'JACK'],
      ]),
    );
    const top = r.lineWins.find((w) => w.line === TOP);
    expect(top).toMatchObject({ symbol: 'QUEEN', count: 5, mult: 2 });
    expect(top!.amount).toBeCloseTo(200 / 9, 12);
  });

  it('pays the BANANA run instead when that is worth more', () => {
    // BANANA BANANA BANANA NINE NINE -> either 5 NINE doubled (100*2 = 200)
    // or 3 BANANA on their own (250). The bananas win, undoubled.
    const r = evaluate(
      fromRows([
        ['BANANA', 'BANANA', 'BANANA', 'NINE', 'NINE'],
        ['TEN', 'JACK', 'TEN', 'JACK', 'TEN'],
        ['KING', 'TEN', 'JACK', 'TEN', 'JACK'],
      ]),
    );
    const top = r.lineWins.find((w) => w.line === TOP);
    expect(top).toMatchObject({ symbol: 'BANANA', count: 3, mult: 1 });
    expect(top!.amount).toBeCloseTo(250 / 9, 12);
  });

  it('pays five BANANAs at 1000x the total bet on the line', () => {
    const r = evaluate(
      fromRows([
        ['BANANA', 'BANANA', 'BANANA', 'BANANA', 'BANANA'],
        ['TEN', 'JACK', 'TEN', 'JACK', 'TEN'],
        ['KING', 'TEN', 'JACK', 'TEN', 'JACK'],
      ]),
    );
    const top = r.lineWins.find((w) => w.line === TOP);
    expect(top).toMatchObject({ symbol: 'BANANA', count: 5, mult: 1 });
    expect(top!.amount).toBeCloseTo(9000 / 9, 12);
  });

  it('lets a SUITCASE end a run, and never pays it on a line', () => {
    // MELON MELON SUITCASE: the run stops at 2 MELON, which pays 2
    const r = evaluate(
      fromRows([
        ['MELON', 'MELON', 'SUITCASE', 'KING', 'ACE'],
        ['TEN', 'JACK', 'TEN', 'JACK', 'TEN'],
        ['KING', 'TEN', 'JACK', 'TEN', 'JACK'],
      ]),
    );
    const top = r.lineWins.find((w) => w.line === TOP);
    expect(top).toMatchObject({ symbol: 'MELON', count: 2 });
    expect(top!.amount).toBeCloseTo(2 / 9, 12);
    // a single scatter pays nothing at all
    expect(r.scatterWin).toBeUndefined();
    // line 9 shares those first two cells, so it clips the same 2 MELON pay
    expect(r.lineWins).toHaveLength(2);
    expect(r.totalWin).toBeCloseTo(4 / 9, 12);
  });
});

describe('evaluate, scatters', () => {
  const withSuitcases = (cells: [number, number][]) => {
    const rows: [Row, Row, Row] = [
      ['QUEEN', 'JACK', 'TEN', 'JACK', 'TEN'],
      ['TEN', 'QUEEN', 'JACK', 'TEN', 'JACK'],
      ['JACK', 'TEN', 'QUEEN', 'JACK', 'TEN'],
    ];
    for (const [x, y] of cells) rows[y][x] = 'SUITCASE';
    return evaluate(fromRows(rows));
  };

  it('pays two SUITCASEs anywhere, without free games', () => {
    const r = withSuitcases([
      [0, 0],
      [2, 2],
    ]);
    expect(r.scatterWin).toMatchObject({ count: 2, amount: 2 });
    expect(r.freeSpinsWon).toBe(0);
  });

  it('pays three SUITCASEs and awards 45 free games', () => {
    const r = withSuitcases([
      [0, 0],
      [2, 2],
      [4, 1],
    ]);
    expect(r.scatterWin).toMatchObject({ count: 3, amount: 4 });
    expect(r.freeSpinsWon).toBe(45);
  });

  it('pays five SUITCASEs at 500x the total bet', () => {
    const r = withSuitcases([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 0],
      [4, 1],
    ]);
    expect(r.scatterWin).toMatchObject({ count: 5, amount: 500 });
    expect(r.freeSpinsWon).toBe(45);
  });
});

describe('playRound', () => {
  it('settles the free games in full, retriggers included', () => {
    let checked = 0;
    for (let seed = 1; seed < 60_000 && checked < 20; seed++) {
      const r = playRound(mulberry32(seed));
      if (!r.bonus) continue;
      checked++;
      expect(r.baseSpin.freeSpinsWon).toBe(45);
      // every retrigger adds another 45 spins to the session
      expect(r.bonus.spins.length).toBe(45 + r.bonus.retriggers * 45);
      expect(r.bonus.spinsPlayed).toBe(r.bonus.spins.length);
      const bonusSum = r.bonus.spins.reduce((a, s) => a + s.totalWin, 0);
      expect(r.bonus.totalWin).toBeCloseTo(bonusSum, 9);
      expect(r.totalWin).toBeCloseTo(r.baseSpin.totalWin + bonusSum, 9);
    }
    expect(checked).toBeGreaterThan(0);
  });
});
