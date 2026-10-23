import { describe, expect, it } from 'vitest';
import { evaluate, clearedCells } from '../src/engine/evaluate';
import { playBonus } from '../src/engine/bonus';
import { playRound, reelAt } from '../src/engine/round';
import { mulberry32 } from '../src/engine/rng';
import { REEL_SETS, ACTIVE_SET, ACTIVE_RTP } from '../src/engine/config/reelSets';
import { PAYLINES } from '../src/engine/config/paylines';
import { LINE_PAY, SCAT_PAY } from '../src/engine/config/paytable';
import {
  LINES,
  MAX_LADDER_WIN,
  REELS,
  ROWS,
  type Grid,
  type SymbolId,
} from '../src/engine/types';

/** Build a grid from five columns, top row first. */
function grid(...cols: SymbolId[][]): Grid {
  return cols;
}

const filler: SymbolId[] = ['NINE', 'TEN', 'JACK'];
/** A column that pays nothing and holds no wild or scatter. */
function dull(offset = 0): SymbolId[] {
  return [filler[offset % 3], filler[(offset + 1) % 3], filler[(offset + 2) % 3]];
}

describe('reel data', () => {
  it('carries all 12 slotopol reel sets', () => {
    expect(REEL_SETS).toHaveLength(12);
    for (const set of REEL_SETS) {
      expect(set.reels).toHaveLength(REELS);
      for (const reel of set.reels) expect(reel.length).toBeGreaterThan(30);
    }
  });

  it('ships on the original 95.55% par', () => {
    expect(ACTIVE_RTP).toBe(95.548865);
    expect(ACTIVE_SET.rtp).toBe(ACTIVE_RTP);
  });

  it('has 25 bet lines, every cell on the grid', () => {
    expect(PAYLINES).toHaveLength(LINES);
    for (const line of PAYLINES) {
      expect(line).toHaveLength(REELS);
      for (const row of line) expect(row).toBeGreaterThanOrEqual(0);
      for (const row of line) expect(row).toBeLessThan(ROWS);
    }
    // no duplicated lines
    const seen = new Set(PAYLINES.map((l) => l.join('')));
    expect(seen.size).toBe(LINES);
  });

  it('wraps reel positions in both directions', () => {
    const reel: SymbolId[] = ['COW', 'PIG', 'RAM'];
    expect(reelAt(reel, 0)).toBe('COW');
    expect(reelAt(reel, 3)).toBe('COW');
    expect(reelAt(reel, -1)).toBe('RAM');
    expect(reelAt(reel, -3)).toBe('COW');
  });
});

describe('line scoring', () => {
  it('pays five of a kind on the middle line', () => {
    // line 1 (index 0) is the middle row
    const g = grid(
      ['NINE', 'COW', 'TEN'],
      ['NINE', 'COW', 'TEN'],
      ['NINE', 'COW', 'TEN'],
      ['NINE', 'COW', 'TEN'],
      ['NINE', 'COW', 'TEN'],
    );
    const scan = evaluate(g);
    const cow = scan.lineWins.find((w) => w.symbol === 'COW' && w.count === 5);
    expect(cow).toBeDefined();
    expect(cow!.amount).toBeCloseTo(LINE_PAY.COW[4] / LINES, 12);
  });

  it('pays nothing for two in a row', () => {
    const g = grid(['NINE', 'COW', 'TEN'], ['NINE', 'COW', 'TEN'], dull(1), dull(2), dull(0));
    const scan = evaluate(g);
    expect(scan.lineWins.filter((w) => w.symbol === 'COW')).toHaveLength(0);
  });

  it('lets the scarecrow substitute and counts it in the run', () => {
    const g = grid(
      ['NINE', 'SCARECROW', 'TEN'],
      ['NINE', 'COW', 'TEN'],
      ['NINE', 'COW', 'TEN'],
      dull(1),
      dull(2),
    );
    const scan = evaluate(g);
    const cow = scan.lineWins.find((w) => w.symbol === 'COW');
    expect(cow?.count).toBe(3);
  });

  it('pays the better of the wild run and the symbol run, never both', () => {
    // 3 wilds then 2 nines: wild pays 100, nine over 5 pays 75. Wild wins.
    const g = grid(
      ['TEN', 'SCARECROW', 'JACK'],
      ['TEN', 'SCARECROW', 'JACK'],
      ['TEN', 'SCARECROW', 'JACK'],
      ['TEN', 'NINE', 'JACK'],
      ['TEN', 'NINE', 'JACK'],
    );
    const scan = evaluate(g);
    const onLine0 = scan.lineWins.filter((w) => w.line === 0);
    expect(onLine0).toHaveLength(1);
    expect(onLine0[0].symbol).toBe('SCARECROW');
    expect(onLine0[0].count).toBe(3);
    expect(onLine0[0].amount).toBeCloseTo(LINE_PAY.SCARECROW[2] / LINES, 12);
  });

  it('prefers the symbol run when it pays more than the wilds', () => {
    // 3 wilds (100) then 2 cows: cow over 5 pays 1000, so the cow run wins
    const g = grid(
      ['TEN', 'SCARECROW', 'JACK'],
      ['TEN', 'SCARECROW', 'JACK'],
      ['TEN', 'SCARECROW', 'JACK'],
      ['TEN', 'COW', 'JACK'],
      ['TEN', 'COW', 'JACK'],
    );
    const onLine0 = evaluate(g).lineWins.filter((w) => w.line === 0);
    expect(onLine0).toHaveLength(1);
    expect(onLine0[0].symbol).toBe('COW');
    expect(onLine0[0].count).toBe(5);
  });

  it('pays a full line of wilds as the top prize', () => {
    const g = grid(
      ['TEN', 'SCARECROW', 'JACK'],
      ['TEN', 'SCARECROW', 'JACK'],
      ['TEN', 'SCARECROW', 'JACK'],
      ['TEN', 'SCARECROW', 'JACK'],
      ['TEN', 'SCARECROW', 'JACK'],
    );
    const win = evaluate(g).lineWins.find((w) => w.line === 0)!;
    expect(win.symbol).toBe('SCARECROW');
    expect(win.count).toBe(5);
    expect(win.amount).toBeCloseTo(LINE_PAY.SCARECROW[4] / LINES, 12);
  });

  it('never pays a line of tractors', () => {
    const g = grid(
      ['NINE', 'TRACTOR', 'TEN'],
      ['NINE', 'TRACTOR', 'TEN'],
      ['NINE', 'TRACTOR', 'TEN'],
      dull(1),
      dull(2),
    );
    const scan = evaluate(g);
    expect(scan.lineWins.every((w) => (w.symbol as string) !== 'TRACTOR')).toBe(true);
  });
});

describe('scatter and bonus trigger', () => {
  it('pays 3 tractors anywhere and opens the ladder', () => {
    const g = grid(['TRACTOR', 'NINE', 'TEN'], dull(1), ['JACK', 'TRACTOR', 'NINE'], dull(2), [
      'TEN',
      'JACK',
      'TRACTOR',
    ]);
    const scan = evaluate(g);
    expect(scan.scatterWin?.count).toBe(3);
    expect(scan.scatterWin?.amount).toBe(SCAT_PAY[2]);
    expect(scan.bonusTriggered).toBe(true);
  });

  it('does not trigger on 2 tractors', () => {
    const g = grid(['TRACTOR', 'NINE', 'TEN'], dull(1), ['JACK', 'TRACTOR', 'NINE'], dull(2), dull(0));
    const scan = evaluate(g);
    expect(scan.scatterWin).toBeUndefined();
    expect(scan.bonusTriggered).toBe(false);
  });

  it('clears every winning cell exactly once', () => {
    // three tractors on the top row and three cows on the middle one, with
    // the bottom row deliberately mismatched so nothing else pays
    const g = grid(
      ['TRACTOR', 'COW', 'TEN'],
      ['TRACTOR', 'COW', 'JACK'],
      ['TRACTOR', 'COW', 'NINE'],
      dull(1),
      dull(2),
    );
    const cells = clearedCells(evaluate(g));
    const keys = cells.map(([x, y]) => `${x},${y}`);
    expect(new Set(keys).size).toBe(keys.length);
    // the three tractors and the three cows
    expect(cells.length).toBe(6);
  });
});

describe('the barn ladder', () => {
  it('always leaves the bottom floor, because it holds no bucket', () => {
    const rng = mulberry32(11);
    for (let i = 0; i < 5000; i++) {
      expect(playBonus(rng).levelsReached).toBeGreaterThanOrEqual(2);
    }
  });

  it('never reveals more crates than a floor holds', () => {
    const rng = mulberry32(12);
    for (let i = 0; i < 5000; i++) {
      const b = playBonus(rng);
      b.levels.forEach((level) => {
        expect(level.revealed).toBeLessThanOrEqual(level.cells.length);
      });
      // floors past the one that ended it are never opened
      for (let l = b.levelsReached; l < b.levels.length; l++) {
        expect(b.levels[l].revealed).toBe(0);
      }
    }
  });

  it('pays what it collected times what it multiplied', () => {
    const rng = mulberry32(13);
    for (let i = 0; i < 5000; i++) {
      const b = playBonus(rng);
      expect(b.totalWin).toBeCloseTo(b.pay * b.multiplier, 10);
      expect(b.multiplier).toBeGreaterThanOrEqual(1);
      expect(b.multiplier).toBeLessThanOrEqual(4);
    }
  });

  it('never beats the 688x ceiling worked out in types.ts', () => {
    const rng = mulberry32(15);
    for (let i = 0; i < 300_000; i++) {
      expect(playBonus(rng).totalWin).toBeLessThanOrEqual(MAX_LADDER_WIN);
    }
  });

  it('averages slotopol\'s Ebon of 50x the total bet', () => {
    const rng = mulberry32(14);
    const n = 400_000;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += playBonus(rng).totalWin;
    // 400k samples put the standard error near 0.18, so 1.5 is a wide net
    expect(Math.abs(sum / n - 50)).toBeLessThan(1.5);
  });
});

describe('rounds and avalanches', () => {
  it('always returns at least the opening drop', () => {
    const rng = mulberry32(21);
    for (let i = 0; i < 2000; i++) {
      const r = playRound(rng);
      expect(r.falls.length).toBeGreaterThanOrEqual(1);
      expect(r.falls[0].index).toBe(0);
      expect(r.cascades).toBe(r.falls.length - 1);
    }
  });

  it('adds every fall into the round total', () => {
    const rng = mulberry32(22);
    for (let i = 0; i < 5000; i++) {
      const r = playRound(rng);
      const sum = r.falls.reduce((acc, f) => acc + f.win, 0);
      expect(r.totalWin).toBeCloseTo(sum, 10);
    }
  });

  it('comes to rest on a grid that pays nothing, unless nothing ever paid', () => {
    const rng = mulberry32(26);
    for (let i = 0; i < 20_000; i++) {
      const r = playRound(rng);
      const last = r.falls[r.falls.length - 1];
      if (last.cleared.length === 0) {
        // nothing was harvested, so the field never moved
        expect(r.finalGrid).toEqual(last.grid);
      } else {
        expect(evaluate(r.finalGrid).win).toBe(0);
      }
    }
  });

  it('only continues the avalanche while falls keep paying', () => {
    const rng = mulberry32(23);
    for (let i = 0; i < 5000; i++) {
      const r = playRound(rng);
      // every fall after the first must have paid something to exist
      for (let f = 1; f < r.falls.length; f++) expect(r.falls[f].win).toBeGreaterThan(0);
      // and each fall that is followed by another must have cleared cells
      for (let f = 0; f < r.falls.length - 1; f++) {
        expect(r.falls[f].cleared.length).toBeGreaterThan(0);
      }
    }
  });

  it('drops the survivors down and refills from the top of the strip', () => {
    const rng = mulberry32(24);
    for (let i = 0; i < 3000; i++) {
      const r = playRound(rng);
      for (let f = 0; f + 1 < r.falls.length; f++) {
        const before = r.falls[f].grid;
        const after = r.falls[f + 1].grid;
        const gone: number[] = new Array(REELS).fill(0);
        for (const [x] of r.falls[f].cleared) gone[x]++;
        for (let x = 0; x < REELS; x++) {
          // the untouched part of the column is unchanged, just lower down
          const survivors: SymbolId[] = [];
          const clearedRows = new Set(
            r.falls[f].cleared.filter(([cx]) => cx === x).map(([, cy]) => cy),
          );
          for (let y = 0; y < ROWS; y++) if (!clearedRows.has(y)) survivors.push(before[x][y]);
          expect(after[x].slice(gone[x])).toEqual(survivors);
        }
      }
    }
  });

  it('holds a bonus result on any fall whose tractors triggered one', () => {
    const rng = mulberry32(25);
    let seen = 0;
    for (let i = 0; i < 200_000 && seen < 20; i++) {
      const r = playRound(rng);
      for (const fall of r.falls) {
        if (fall.scatterWin) {
          seen++;
          expect(fall.bonus).toBeDefined();
          expect(fall.win).toBeCloseTo(
            fall.lineWins.reduce((a, w) => a + w.amount, 0) +
              fall.scatterWin.amount +
              fall.bonus!.totalWin,
            10,
          );
        } else {
          expect(fall.bonus).toBeUndefined();
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});
