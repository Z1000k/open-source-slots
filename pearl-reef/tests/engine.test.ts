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
  it('pays a leftmost run, per-line-bet over 10 lines', () => {
    // top line: three ACEs, LinePay 10 -> 10/10 of the total bet
    const r = evaluate(
      fromRows([
        ['ACE', 'ACE', 'ACE', 'STARFISH', 'KING'],
        ['QUEEN', 'JACK', 'TEN', 'JACK', 'TEN'],
        ['KING', 'TEN', 'JACK', 'TEN', 'JACK'],
      ]),
    );
    const top = r.lineWins.find((w) => w.line === TOP);
    expect(top).toMatchObject({ symbol: 'ACE', count: 3, mult: 1 });
    expect(top!.amount).toBeCloseTo(10 / 10, 12);
    expect(r.multiplier).toBe(1);
  });

  it('doubles a run a TURTLE joined', () => {
    // top line: PUFFERFISH TURTLE PUFFERFISH PUFFERFISH ACE -> 4 PUFFERFISH = 75, doubled = 150
    const r = evaluate(
      fromRows([
        ['PUFFERFISH', 'TURTLE', 'PUFFERFISH', 'PUFFERFISH', 'ACE'],
        ['QUEEN', 'JACK', 'TEN', 'JACK', 'TEN'],
        ['KING', 'TEN', 'JACK', 'TEN', 'JACK'],
      ]),
    );
    expect(r.lineWins).toHaveLength(1);
    expect(r.lineWins[0]).toMatchObject({ line: TOP, symbol: 'PUFFERFISH', count: 4, mult: 2 });
    expect(r.lineWins[0].amount).toBeCloseTo(150 / 10, 12);
    expect(r.totalWin).toBeCloseTo(150 / 10, 12);
  });

  it('substitutes leading TURTLEs into the run behind them', () => {
    // TURTLE TURTLE QUEEN QUEEN QUEEN -> 5 QUEEN = 100 doubled = 200,
    // which beats paying the two TURTLEs on their own (10)
    const r = evaluate(
      fromRows([
        ['TURTLE', 'TURTLE', 'QUEEN', 'QUEEN', 'QUEEN'],
        ['TEN', 'JACK', 'TEN', 'JACK', 'TEN'],
        ['KING', 'TEN', 'JACK', 'TEN', 'JACK'],
      ]),
    );
    const top = r.lineWins.find((w) => w.line === TOP);
    expect(top).toMatchObject({ symbol: 'QUEEN', count: 5, mult: 2 });
    expect(top!.amount).toBeCloseTo(200 / 10, 12);
  });

  it('pays the TURTLE run instead when that is worth more', () => {
    // TURTLE TURTLE TURTLE NINE NINE -> either 5 NINE doubled (100*2 = 200)
    // or 3 TURTLE on their own (250). The turtles win, undoubled.
    const r = evaluate(
      fromRows([
        ['TURTLE', 'TURTLE', 'TURTLE', 'NINE', 'NINE'],
        ['TEN', 'JACK', 'TEN', 'JACK', 'TEN'],
        ['KING', 'TEN', 'JACK', 'TEN', 'JACK'],
      ]),
    );
    const top = r.lineWins.find((w) => w.line === TOP);
    expect(top).toMatchObject({ symbol: 'TURTLE', count: 3, mult: 1 });
    expect(top!.amount).toBeCloseTo(250 / 10, 12);
  });

  it('pays the wild run on a tie, as slotopol does', () => {
    // TURTLE TURTLE TURTLE SHARK KING -> 4 SHARK doubled (125*2 = 250) ties
    // 3 TURTLE (250). slotopol pays the substituted run only when it is
    // strictly bigger, so the turtles take it; the amount is the same.
    const r = evaluate(
      fromRows([
        ['TURTLE', 'TURTLE', 'TURTLE', 'SHARK', 'KING'],
        ['TEN', 'JACK', 'TEN', 'JACK', 'TEN'],
        ['KING', 'TEN', 'JACK', 'TEN', 'JACK'],
      ]),
    );
    const top = r.lineWins.find((w) => w.line === TOP);
    expect(top).toMatchObject({ symbol: 'TURTLE', count: 3, mult: 1 });
    expect(top!.amount).toBeCloseTo(250 / 10, 12);
  });

  it('pays five TURTLEs at 900x the total bet on the line', () => {
    const r = evaluate(
      fromRows([
        ['TURTLE', 'TURTLE', 'TURTLE', 'TURTLE', 'TURTLE'],
        ['TEN', 'JACK', 'TEN', 'JACK', 'TEN'],
        ['KING', 'TEN', 'JACK', 'TEN', 'JACK'],
      ]),
    );
    const top = r.lineWins.find((w) => w.line === TOP);
    expect(top).toMatchObject({ symbol: 'TURTLE', count: 5, mult: 1 });
    expect(top!.amount).toBeCloseTo(9000 / 10, 12);
  });

  it('lets a CLAM end a run, and never pays it on a line', () => {
    // OCTOPUS OCTOPUS CLAM: the run stops at 2 OCTOPUS, which pays 2
    const r = evaluate(
      fromRows([
        ['OCTOPUS', 'OCTOPUS', 'CLAM', 'KING', 'ACE'],
        ['TEN', 'JACK', 'TEN', 'JACK', 'TEN'],
        ['KING', 'TEN', 'JACK', 'TEN', 'JACK'],
      ]),
    );
    const top = r.lineWins.find((w) => w.line === TOP);
    expect(top).toMatchObject({ symbol: 'OCTOPUS', count: 2 });
    expect(top!.amount).toBeCloseTo(2 / 10, 12);
    // a single scatter pays nothing at all
    expect(r.scatterWin).toBeUndefined();
    // line 9 shares those first two cells, so it clips the same 2 OCTOPUS pay
    expect(r.lineWins).toHaveLength(2);
    expect(r.totalWin).toBeCloseTo(4 / 10, 12);
  });

  it('triples every line win on a free game, the wild double included', () => {
    // the doubled PUFFERFISH run again: 75 * 2 * 3 = 450 line-bets
    const r = evaluate(
      fromRows([
        ['PUFFERFISH', 'TURTLE', 'PUFFERFISH', 'PUFFERFISH', 'ACE'],
        ['QUEEN', 'JACK', 'TEN', 'JACK', 'TEN'],
        ['KING', 'TEN', 'JACK', 'TEN', 'JACK'],
      ]),
      true,
    );
    expect(r.multiplier).toBe(3);
    expect(r.lineWins[0]).toMatchObject({ symbol: 'PUFFERFISH', count: 4, mult: 2 });
    expect(r.lineWins[0].amount).toBeCloseTo(450 / 10, 12);
    expect(r.totalWin).toBeCloseTo(450 / 10, 12);
  });
});

describe('evaluate, scatters', () => {
  const withClams = (cells: [number, number][], freeGame = false) => {
    const rows: [Row, Row, Row] = [
      ['QUEEN', 'JACK', 'TEN', 'JACK', 'TEN'],
      ['TEN', 'QUEEN', 'JACK', 'TEN', 'JACK'],
      ['JACK', 'TEN', 'QUEEN', 'JACK', 'TEN'],
    ];
    for (const [x, y] of cells) rows[y][x] = 'CLAM';
    return evaluate(fromRows(rows), freeGame);
  };

  it('pays two CLAMs anywhere, without free games', () => {
    const r = withClams([
      [0, 0],
      [2, 2],
    ]);
    expect(r.scatterWin).toMatchObject({ count: 2, amount: 2 });
    expect(r.freeSpinsWon).toBe(0);
  });

  it('pays three CLAMs and awards 15 free games', () => {
    const r = withClams([
      [0, 0],
      [2, 2],
      [4, 1],
    ]);
    expect(r.scatterWin).toMatchObject({ count: 3, amount: 5 });
    expect(r.freeSpinsWon).toBe(15);
  });

  it('pays five CLAMs at 500x the total bet', () => {
    const r = withClams([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 0],
      [4, 1],
    ]);
    expect(r.scatterWin).toMatchObject({ count: 5, amount: 500 });
    expect(r.freeSpinsWon).toBe(15);
  });

  it('triples the scatter pay on a free game and retriggers 15 more', () => {
    const r = withClams(
      [
        [0, 0],
        [2, 2],
        [4, 1],
      ],
      true,
    );
    expect(r.scatterWin).toMatchObject({ count: 3, amount: 15 });
    expect(r.freeSpinsWon).toBe(15);
  });
});

describe('playRound', () => {
  it('settles the free games in full at triple pay, retriggers included', () => {
    let checked = 0;
    for (let seed = 1; seed < 60_000 && checked < 20; seed++) {
      const r = playRound(mulberry32(seed));
      if (!r.bonus) continue;
      checked++;
      expect(r.baseSpin.freeSpinsWon).toBe(15);
      expect(r.baseSpin.multiplier).toBe(1);
      // every retrigger adds another 15 spins to the session
      expect(r.bonus.spins.length).toBe(15 + r.bonus.retriggers * 15);
      expect(r.bonus.spinsPlayed).toBe(r.bonus.spins.length);
      for (const s of r.bonus.spins) expect(s.multiplier).toBe(3);
      const bonusSum = r.bonus.spins.reduce((a, s) => a + s.totalWin, 0);
      expect(r.bonus.totalWin).toBeCloseTo(bonusSum, 9);
      expect(r.totalWin).toBeCloseTo(r.baseSpin.totalWin + bonusSum, 9);
    }
    expect(checked).toBeGreaterThan(0);
  });
});
