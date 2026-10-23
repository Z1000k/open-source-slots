import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/engine/evaluate';
import type { Grid } from '../src/engine/types';

// grid[reel][row]; helper builds a 5x3 grid from rows for readability
function fromRows(rows: [string, string, string, string, string][]): Grid {
  return Array.from({ length: 5 }, (_, x) => rows.map((r) => r[x])) as Grid;
}

const F = 'LEMON'; // filler that never lines up in these fixtures

describe('evaluate', () => {
  it('pays a leftmost run only, per-line-bet / 5 lines', () => {
    // three SEVENs on the top line: LinePay 100 -> 20x total bet
    const r = evaluate(
      fromRows([
        ['SEVEN', 'SEVEN', 'SEVEN', 'CHERRY', 'PLUM'],
        ['MELON', 'GRAPES', 'ORANGE', 'MELON', 'GRAPES'],
        ['PLUM', 'ORANGE', 'MELON', 'GRAPES', 'ORANGE'],
      ]),
    );
    expect(r.lineWins).toHaveLength(1);
    expect(r.lineWins[0]).toMatchObject({ line: 1, symbol: 'SEVEN', count: 3, amount: 20 });
    expect(r.totalWin).toBe(20);
  });

  it('pays two cherries but no other pair', () => {
    const r = evaluate(
      fromRows([
        ['CHERRY', 'CHERRY', F, 'PLUM', 'ORANGE'],
        ['SEVEN', 'SEVEN', 'MELON', 'GRAPES', 'PLUM'],
        ['MELON', 'GRAPES', 'ORANGE', 'MELON', 'GRAPES'],
      ]),
    );
    // cherries: LinePay 5 -> 1x total bet; the SEVEN pair pays nothing
    expect(r.lineWins).toHaveLength(1);
    expect(r.lineWins[0]).toMatchObject({ line: 1, symbol: 'CHERRY', count: 2, amount: 1 });
  });

  it('counts scatter stars anywhere and never on a line', () => {
    const r = evaluate(
      fromRows([
        ['STAR', F, 'CHERRY', 'PLUM', 'ORANGE'],
        ['GRAPES', 'STAR', 'MELON', 'GRAPES', 'PLUM'],
        ['MELON', 'GRAPES', 'STAR', 'MELON', 'STAR'],
      ]),
    );
    expect(r.lineWins).toHaveLength(0);
    expect(r.scatterWin).toMatchObject({ count: 4, amount: 10 });
    expect(r.totalWin).toBe(10);
  });

  it('pays the full screen of SEVENs at the 5000x max', () => {
    const r = evaluate(
      fromRows([
        ['SEVEN', 'SEVEN', 'SEVEN', 'SEVEN', 'SEVEN'],
        ['SEVEN', 'SEVEN', 'SEVEN', 'SEVEN', 'SEVEN'],
        ['SEVEN', 'SEVEN', 'SEVEN', 'SEVEN', 'SEVEN'],
      ]),
    );
    // all 5 lines pay 5000 per-line-bet: 5 * 5000 / 5 = 5000x total bet
    expect(r.lineWins).toHaveLength(5);
    expect(r.totalWin).toBe(5000);
  });
});
