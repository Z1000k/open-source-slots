import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/engine/evaluate';
import type { Grid } from '../src/engine/types';

// grid[reel][row]; helper builds a 3x3 grid from rows for readability
function fromRows(rows: [string, string, string][]): Grid {
  return Array.from({ length: 3 }, (_, x) => rows.map((r) => r[x])) as Grid;
}

describe('evaluate', () => {
  it('pays a full middle line only, per-line-bet / 5 lines', () => {
    // three SEVENs on the middle line: LinePay 750 -> 150x total bet
    const r = evaluate(
      fromRows([
        ['CHERRY', 'LEMON', 'PLUM'],
        ['SEVEN', 'SEVEN', 'SEVEN'],
        ['ORANGE', 'X', 'BAR'],
      ]),
    );
    expect(r.lineWins).toHaveLength(1);
    expect(r.lineWins[0]).toMatchObject({ line: 0, symbol: 'SEVEN', count: 3, amount: 150 });
    expect(r.fillMult).toBe(1);
    expect(r.totalWin).toBe(150);
  });

  it('pays nothing for two of a kind', () => {
    const r = evaluate(
      fromRows([
        ['CHERRY', 'CHERRY', 'PLUM'],
        ['SEVEN', 'SEVEN', 'LEMON'],
        ['STAR', 'STAR', 'BAR'],
      ]),
    );
    expect(r.lineWins).toHaveLength(0);
    expect(r.totalWin).toBe(0);
  });

  it('pays STAR and X as ordinary line symbols', () => {
    // top line STARs (200 -> 40x), bottom line Xs (5 -> 1x)
    const r = evaluate(
      fromRows([
        ['STAR', 'STAR', 'STAR'],
        ['CHERRY', 'LEMON', 'PLUM'],
        ['X', 'X', 'X'],
      ]),
    );
    expect(r.lineWins).toHaveLength(2);
    expect(r.lineWins[0]).toMatchObject({ line: 1, symbol: 'STAR', amount: 40 });
    expect(r.lineWins[1]).toMatchObject({ line: 2, symbol: 'X', amount: 1 });
    expect(r.totalWin).toBe(41);
  });

  it('pays the diagonals', () => {
    const r = evaluate(
      fromRows([
        ['BAR', 'LEMON', 'CHERRY'],
        ['PLUM', 'BAR', 'ORANGE'],
        ['STAR', 'X', 'BAR'],
      ]),
    );
    // diagonal down only: BAR 60 -> 12x total bet
    expect(r.lineWins).toHaveLength(1);
    expect(r.lineWins[0]).toMatchObject({ line: 3, symbol: 'BAR', amount: 12 });
  });

  it('doubles every line on a full screen of one fruit', () => {
    const cherry3 = ['CHERRY', 'CHERRY', 'CHERRY'] as [string, string, string];
    const r = evaluate(fromRows([cherry3, cherry3, cherry3]));
    // all 5 lines hit: 5 * 40 * 2 / 5 = 80x total bet
    expect(r.fillMult).toBe(2);
    expect(r.lineWins).toHaveLength(5);
    expect(r.totalWin).toBe(80);
  });

  it('does not double a full screen of X', () => {
    const x3 = ['X', 'X', 'X'] as [string, string, string];
    const r = evaluate(fromRows([x3, x3, x3]));
    // all 5 lines at 5 per-line-bet, no doubler: 5 * 5 / 5 = 5x total bet
    expect(r.fillMult).toBe(1);
    expect(r.lineWins).toHaveLength(5);
    expect(r.totalWin).toBe(5);
  });
});
