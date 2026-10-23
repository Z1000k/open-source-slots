import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/engine/evaluate';
import { playRound } from '../src/engine/round';
import { mulberry32 } from '../src/engine/rng';
import { ACTIVE_REELS, BONUS_REELS } from '../src/engine/config/reelSets';
import type { Grid, SymbolId } from '../src/engine/types';

type Row = [SymbolId, SymbolId, SymbolId, SymbolId, SymbolId];

// grid[reel][row]; helper builds a 5x3 grid from rows for readability
function fromRows(rows: [Row, Row, Row]): Grid {
  return Array.from({ length: 5 }, (_, x) => rows.map((r) => r[x])) as Grid;
}

/** Line 1 is the top row, line 0 the middle one - see config/paylines.ts. */
const TOP = 1;

/** Middle and bottom rows that complete no line on their own. */
const MID: Row = ['QUEEN', 'JACK', 'TEN', 'JACK', 'TEN'];
const BOT: Row = ['KING', 'TEN', 'JACK', 'TEN', 'JACK'];

describe('reel set', () => {
  it('deals the original Columbus Deluxe strips', () => {
    expect(ACTIVE_REELS.rtp).toBe(95.022795);
  });

  it('puts galleons on reels 1, 3 and 5 only, as the info screen says', () => {
    for (const reels of [ACTIVE_REELS.reels, BONUS_REELS]) {
      reels.forEach((strip, x) => expect(strip.includes('GALLEON')).toBe(x % 2 === 0));
    }
  });
});

describe('evaluate, lines', () => {
  it('pays a leftmost run, per-line-bet over 10 lines', () => {
    // top line: three ACEs, LinePay 10 -> 10/10 of the total bet
    const r = evaluate(fromRows([['ACE', 'ACE', 'ACE', 'COMPASS', 'KING'], MID, BOT]));
    expect(r.lineWins).toHaveLength(1);
    expect(r.lineWins[0]).toMatchObject({ line: TOP, symbol: 'ACE', count: 3 });
    expect(r.lineWins[0].amount).toBeCloseTo(10 / 10, 12);
    expect(r.totalWin).toBeCloseTo(10 / 10, 12);
    expect(r.freeGame).toBe(false);
  });

  it('lets a CAPTAIN complete a run, at the plain run pay', () => {
    // ACE CAPTAIN ACE ACE KING -> 4 ACE = 40, no wild multiplier in this game
    const r = evaluate(fromRows([['ACE', 'CAPTAIN', 'ACE', 'ACE', 'KING'], MID, BOT]));
    expect(r.lineWins).toHaveLength(1);
    expect(r.lineWins[0]).toMatchObject({ line: TOP, symbol: 'ACE', count: 4 });
    expect(r.lineWins[0].amount).toBeCloseTo(40 / 10, 12);
  });

  it('substitutes leading CAPTAINs into the run behind them', () => {
    // CAPTAIN CAPTAIN QUEEN QUEEN QUEEN -> 5 QUEEN = 150, which beats
    // paying the two CAPTAINs on their own (10)
    const r = evaluate(fromRows([['CAPTAIN', 'CAPTAIN', 'QUEEN', 'QUEEN', 'QUEEN'], MID, BOT]));
    const top = r.lineWins.find((w) => w.line === TOP);
    expect(top).toMatchObject({ symbol: 'QUEEN', count: 5 });
    expect(top!.amount).toBeCloseTo(150 / 10, 12);
  });

  it('pays the CAPTAIN run instead when that is worth more', () => {
    // CAPTAIN CAPTAIN CAPTAIN JACK KING -> 4 JACK (20) or 3 CAPTAIN (100)
    const r = evaluate(fromRows([['CAPTAIN', 'CAPTAIN', 'CAPTAIN', 'JACK', 'KING'], MID, BOT]));
    const top = r.lineWins.find((w) => w.line === TOP);
    expect(top).toMatchObject({ symbol: 'CAPTAIN', count: 3 });
    expect(top!.amount).toBeCloseTo(100 / 10, 12);
  });

  it('pays the wild run on a tie, as slotopol does', () => {
    // CAPTAIN CAPTAIN CAPTAIN TEN TEN -> 5 TEN (100) ties 3 CAPTAIN (100).
    // slotopol pays the substituted run only when it is strictly bigger.
    const r = evaluate(fromRows([['CAPTAIN', 'CAPTAIN', 'CAPTAIN', 'TEN', 'TEN'], MID, BOT]));
    const top = r.lineWins.find((w) => w.line === TOP);
    expect(top).toMatchObject({ symbol: 'CAPTAIN', count: 3 });
    expect(top!.amount).toBeCloseTo(100 / 10, 12);
  });

  it('pays five CAPTAINs at 500x the total bet on the line', () => {
    const r = evaluate(fromRows([['CAPTAIN', 'CAPTAIN', 'CAPTAIN', 'CAPTAIN', 'CAPTAIN'], MID, BOT]));
    const top = r.lineWins.find((w) => w.line === TOP);
    expect(top).toMatchObject({ symbol: 'CAPTAIN', count: 5 });
    expect(top!.amount).toBeCloseTo(5000 / 10, 12);
  });

  it('lets a GALLEON end a run on a paid spin, and never pays it on a line', () => {
    // CROWN CROWN GALLEON: the run stops at 2 CROWN, which pays 5
    const r = evaluate(fromRows([['CROWN', 'CROWN', 'GALLEON', 'KING', 'ACE'], MID, BOT]));
    const top = r.lineWins.find((w) => w.line === TOP);
    expect(top).toMatchObject({ symbol: 'CROWN', count: 2 });
    expect(top!.amount).toBeCloseTo(5 / 10, 12);
    // line 9 shares those first two cells, so it clips the same 2 CROWN pay
    expect(r.lineWins).toHaveLength(2);
    expect(r.totalWin).toBeCloseTo(10 / 10, 12);
    expect(r.scatterHit).toBeUndefined();
  });

  it('turns the GALLEON wild on a free game', () => {
    // the same grid on a free game: CROWN CROWN [GALLEON] -> 3 CROWN = 50,
    // line 9 still clips 2 CROWN = 5
    const r = evaluate(fromRows([['CROWN', 'CROWN', 'GALLEON', 'KING', 'ACE'], MID, BOT]), true);
    expect(r.freeGame).toBe(true);
    const top = r.lineWins.find((w) => w.line === TOP);
    expect(top).toMatchObject({ symbol: 'CROWN', count: 3 });
    expect(top!.amount).toBeCloseTo(50 / 10, 12);
    expect(r.totalWin).toBeCloseTo(55 / 10, 12);
  });

  it('pays a run of GALLEONs and CAPTAINs as wilds on a free game, nothing on a paid spin', () => {
    // GALLEON CAPTAIN GALLEON JACK KING: on a free game that is 3 wilds (100)
    // against 4 JACK (20); on a paid spin the GALLEON leads a run that never pays
    const grid = fromRows([['GALLEON', 'CAPTAIN', 'GALLEON', 'JACK', 'KING'], MID, BOT]);
    const free = evaluate(grid, true).lineWins.find((w) => w.line === TOP);
    expect(free).toMatchObject({ symbol: 'CAPTAIN', count: 3 });
    expect(free!.amount).toBeCloseTo(100 / 10, 12);
    expect(evaluate(grid).lineWins.find((w) => w.line === TOP)).toBeUndefined();
  });
});

describe('evaluate, scatters', () => {
  const withGalleons = (cells: [number, number][], freeGame = false) => {
    const rows: [Row, Row, Row] = [
      ['QUEEN', 'JACK', 'TEN', 'JACK', 'TEN'],
      ['TEN', 'QUEEN', 'JACK', 'TEN', 'JACK'],
      ['JACK', 'TEN', 'QUEEN', 'JACK', 'TEN'],
    ];
    for (const [x, y] of cells) rows[y][x] = 'GALLEON';
    return evaluate(fromRows(rows), freeGame);
  };

  it('gives nothing for two GALLEONs', () => {
    const r = withGalleons([
      [0, 0],
      [2, 2],
    ]);
    expect(r.scatterHit).toBeUndefined();
    expect(r.freeSpinsWon).toBe(0);
    expect(r.totalWin).toBe(0);
  });

  it('awards 10 free games for three GALLEONs, with no pay of their own', () => {
    const r = withGalleons([
      [0, 0],
      [2, 2],
      [4, 1],
    ]);
    expect(r.scatterHit).toMatchObject({ count: 3 });
    expect(r.scatterHit!.positions).toHaveLength(3);
    expect(r.freeSpinsWon).toBe(10);
    expect(r.totalWin).toBe(0);
  });

  it('still awards 10 for more GALLEONs than the strips can show', () => {
    const r = withGalleons([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 0],
      [4, 1],
      [4, 2],
    ]);
    expect(r.scatterHit).toMatchObject({ count: 6 });
    expect(r.freeSpinsWon).toBe(10);
  });

  it('retriggers 10 more on a free game', () => {
    const r = withGalleons(
      [
        [0, 0],
        [2, 2],
        [4, 1],
      ],
      true,
    );
    expect(r.scatterHit).toMatchObject({ count: 3 });
    expect(r.freeSpinsWon).toBe(10);
  });
});

describe('playRound', () => {
  it('settles the free games in full, retriggers included', () => {
    let checked = 0;
    let retriggered = 0;
    for (let seed = 1; seed < 200_000 && (checked < 40 || retriggered < 3); seed++) {
      const r = playRound(mulberry32(seed));
      if (!r.bonus) continue;
      checked++;
      if (r.bonus.retriggers > 0) retriggered++;
      expect(r.baseSpin.freeSpinsWon).toBe(10);
      expect(r.baseSpin.freeGame).toBe(false);
      // every retrigger adds another 10 spins to the session
      expect(r.bonus.spins.length).toBe(10 + r.bonus.retriggers * 10);
      expect(r.bonus.spinsPlayed).toBe(r.bonus.spins.length);
      for (const s of r.bonus.spins) expect(s.freeGame).toBe(true);
      const bonusSum = r.bonus.spins.reduce((a, s) => a + s.totalWin, 0);
      expect(r.bonus.totalWin).toBeCloseTo(bonusSum, 9);
      expect(r.totalWin).toBeCloseTo(r.baseSpin.totalWin + bonusSum, 9);
    }
    expect(checked).toBeGreaterThanOrEqual(40);
    expect(retriggered).toBeGreaterThanOrEqual(3);
  });
});
