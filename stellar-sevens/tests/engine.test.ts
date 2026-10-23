import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/engine/evaluate';
import { REEL_SETS, ACTIVE_REELS } from '../src/engine/config/reelSets';
import { LINE_PAY } from '../src/engine/config/paytable';
import { MAX_WIN, ROWS, SYMBOL_ORDER, type Grid, type SymbolId } from '../src/engine/types';

// grid[reel][row]; helper builds a 3x3 grid from rows for readability
function fromRows(rows: [string, string, string][]): Grid {
  return Array.from({ length: 3 }, (_, x) => rows.map((r) => r[x])) as Grid;
}

describe('evaluate', () => {
  it('pays a full middle line only, per-line-bet / 5 lines', () => {
    // three SEVENs on the middle line: LinePay 300 -> 60x total bet
    const r = evaluate(
      fromRows([
        ['CHERRY', 'LEMON', 'PLUM'],
        ['SEVEN', 'SEVEN', 'SEVEN'],
        ['ORANGE', 'BELL', 'MELON'],
      ]),
    );
    expect(r.lineWins).toHaveLength(1);
    expect(r.lineWins[0]).toMatchObject({ line: 0, symbol: 'SEVEN', count: 3, amount: 60 });
    expect(r.totalWin).toBe(60);
  });

  it('pays nothing for two of a kind', () => {
    const r = evaluate(
      fromRows([
        ['CHERRY', 'CHERRY', 'PLUM'],
        ['SEVEN', 'SEVEN', 'LEMON'],
        ['STAR', 'STAR', 'MELON'],
      ]),
    );
    expect(r.lineWins).toHaveLength(0);
    expect(r.totalWin).toBe(0);
  });

  it('scores top and bottom lines together', () => {
    // top line STARs (200 -> 40x), bottom line CHERRYs (40 -> 8x)
    const r = evaluate(
      fromRows([
        ['STAR', 'STAR', 'STAR'],
        ['MELON', 'LEMON', 'PLUM'],
        ['CHERRY', 'CHERRY', 'CHERRY'],
      ]),
    );
    expect(r.lineWins).toHaveLength(2);
    expect(r.lineWins[0]).toMatchObject({ line: 1, symbol: 'STAR', amount: 40 });
    expect(r.lineWins[1]).toMatchObject({ line: 2, symbol: 'CHERRY', amount: 8 });
    expect(r.totalWin).toBe(48);
  });

  it('pays the diagonals', () => {
    const r = evaluate(
      fromRows([
        ['MELON', 'LEMON', 'CHERRY'],
        ['PLUM', 'MELON', 'ORANGE'],
        ['STAR', 'BELL', 'MELON'],
      ]),
    );
    // diagonal down only: MELON 100 -> 20x total bet
    expect(r.lineWins).toHaveLength(1);
    expect(r.lineWins[0]).toMatchObject({ line: 3, symbol: 'MELON', amount: 20 });
  });

  it('pays all five lines on a full screen, with no doubler', () => {
    const seven3 = ['SEVEN', 'SEVEN', 'SEVEN'] as [string, string, string];
    const r = evaluate(fromRows([seven3, seven3, seven3]));
    // all 5 lines hit: 5 * 300 / 5 = 300x total bet, the advertised max win
    expect(r.lineWins).toHaveLength(5);
    expect(r.totalWin).toBe(MAX_WIN);
  });
});

describe('reel sets', () => {
  it('has 18 sets, all three reels identical, active is the 95.504233% original', () => {
    expect(REEL_SETS).toHaveLength(18);
    for (const set of REEL_SETS) {
      expect(set.reels).toHaveLength(3);
      expect(set.reels[1]).toEqual(set.reels[0]);
      expect(set.reels[2]).toEqual(set.reels[0]);
    }
    expect(ACTIVE_REELS.rtp).toBe(95.504233);
  });

  it('uses only known symbols and pays every one of them', () => {
    for (const set of REEL_SETS) {
      for (const sym of set.reels[0]) {
        expect(SYMBOL_ORDER).toContain(sym);
        expect(LINE_PAY[sym]).toBeGreaterThan(0);
      }
    }
  });

  it('every LINE_PAY is a whole multiple of the 5 lines', () => {
    for (const sym of SYMBOL_ORDER) expect(LINE_PAY[sym] % 5).toBe(0);
  });
});

describe('exact RTP of the active reels', () => {
  it('enumerates to slotopol 95.504233%', () => {
    const windows = (reel: SymbolId[]) =>
      reel.map((_, stop) =>
        Array.from({ length: ROWS }, (_, y) => reel[(stop + y) % reel.length]),
      );
    const [w0, w1, w2] = ACTIVE_REELS.reels.map(windows);
    const grid: Grid = new Array(3);
    let won = 0;
    let best = 0;
    for (const a of w0) {
      grid[0] = a;
      for (const b of w1) {
        grid[1] = b;
        for (const c of w2) {
          grid[2] = c;
          const r = evaluate(grid);
          won += r.totalWin;
          if (r.totalWin > best) best = r.totalWin;
        }
      }
    }
    const total = w0.length * w1.length * w2.length;
    expect(((won / total) * 100).toFixed(6)).toBe('95.504233');
    expect(best).toBe(MAX_WIN);
  });
});
