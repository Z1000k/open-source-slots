import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/engine/evaluate';
import { playRound } from '../src/engine/round';
import { mulberry32 } from '../src/engine/rng';
import type { Grid, SymbolId } from '../src/engine/types';

// grid[reel][row]; helper builds a 5x3 grid from rows for readability
function fromRows(rows: [SymbolId, SymbolId, SymbolId, SymbolId, SymbolId][]): Grid {
  return Array.from({ length: 5 }, (_, x) => rows.map((r) => r[x])) as Grid;
}

const F = 'TEN'; // filler used away from paying positions in these fixtures

describe('evaluate, base game', () => {
  it('pays a leftmost run, per-line-bet / 10 lines', () => {
    // three EXPLORERs on the top line: LinePay 100 -> 10x total bet. Line 9
    // (top-top-mid-bot-bot) shares the first two cells, so it clips a
    // 2-EXPLORER pay too: 10 -> 1x. Lines overlapping is normal.
    const r = evaluate(
      fromRows([
        ['EXPLORER', 'EXPLORER', 'EXPLORER', 'ACE', 'KING'],
        ['MUMMY', 'ANUBIS', 'QUEEN', 'MUMMY', 'ANUBIS'],
        ['SCARAB', 'QUEEN', 'MUMMY', 'ANUBIS', 'QUEEN'],
      ]),
    );
    expect(r.lineWins).toHaveLength(2);
    const top = r.lineWins.find((w) => w.line === 1);
    expect(top).toMatchObject({ line: 1, symbol: 'EXPLORER', count: 3, amount: 10 });
    expect(r.totalWin).toBe(11);
  });

  it('substitutes PAPYRUS as wild, inside and in front of a run', () => {
    // top line: MUMMY PAPYRUS MUMMY MUMMY ACE -> 4 MUMMY = 400/10 = 40x
    // middle line: PAPYRUS PAPYRUS ANUBIS ACE KING -> 3 ANUBIS = 30/10 = 3x
    const r = evaluate(
      fromRows([
        ['MUMMY', 'PAPYRUS', 'MUMMY', 'MUMMY', 'ACE'],
        ['PAPYRUS', 'PAPYRUS', 'ANUBIS', 'ACE', 'KING'],
        [F, 'JACK', 'QUEEN', 'JACK', 'QUEEN'],
      ]),
    );
    const top = r.lineWins.find((w) => w.line === 1);
    const mid = r.lineWins.find((w) => w.line === 0);
    expect(top).toMatchObject({ symbol: 'MUMMY', count: 4, amount: 40 });
    expect(mid).toMatchObject({ symbol: 'ANUBIS', count: 3, amount: 3 });
  });

  it('pays 3+ PAPYRUS as scatter anywhere and awards 10 free spins', () => {
    const r = evaluate(
      fromRows([
        ['PAPYRUS', F, 'QUEEN', 'ACE', 'KING'],
        ['MUMMY', 'PAPYRUS', 'JACK', 'MUMMY', 'ANUBIS'],
        ['SCARAB', 'QUEEN', 'MUMMY', 'PAPYRUS', 'QUEEN'],
      ]),
    );
    expect(r.scatterWin).toMatchObject({ count: 3, amount: 2 });
    expect(r.freeSpinsWon).toBe(10);
  });

  it('pays the full screen of EXPLORERs at 5000x total bet', () => {
    const row: [SymbolId, SymbolId, SymbolId, SymbolId, SymbolId] = [
      'EXPLORER',
      'EXPLORER',
      'EXPLORER',
      'EXPLORER',
      'EXPLORER',
    ];
    const r = evaluate(fromRows([row, row, row]));
    expect(r.lineWins).toHaveLength(10);
    expect(r.totalWin).toBe(5000);
  });
});

describe('evaluate, free games (expanding symbol)', () => {
  it('collects the expanding symbol anywhere, paying all 10 lines at once', () => {
    // three ACEs scattered off-line with es = ACE: LinePay 5 on 10 lines
    // = 5x total bet, regardless of position
    const r = evaluate(
      fromRows([
        ['ACE', F, 'QUEEN', 'KING', 'JACK'],
        ['MUMMY', 'QUEEN', 'JACK', 'ACE', 'ANUBIS'],
        ['SCARAB', 'KING', 'ACE', 'JACK', 'QUEEN'],
      ]),
      'ACE',
    );
    expect(r.expandingWin).toMatchObject({ symbol: 'ACE', count: 3, amount: 5 });
    expect(r.totalWin).toBe(5);
  });

  it('needs only 2 of a high expanding symbol', () => {
    const r = evaluate(
      fromRows([
        ['EXPLORER', F, 'QUEEN', 'KING', 'JACK'],
        ['MUMMY', 'QUEEN', 'JACK', 'ACE', 'ANUBIS'],
        ['SCARAB', 'KING', 'EXPLORER', 'JACK', 'QUEEN'],
      ]),
      'EXPLORER',
    );
    expect(r.expandingWin).toMatchObject({ symbol: 'EXPLORER', count: 2, amount: 10 });
  });

  it('blocks the expanding symbol from starting an ordinary line run', () => {
    // top line is ACE ACE ACE but ACE is the expanding symbol: no line win,
    // only the grid collect (3 ACEs -> 5x)
    const r = evaluate(
      fromRows([
        ['ACE', 'ACE', 'ACE', 'KING', 'JACK'],
        ['MUMMY', 'QUEEN', 'JACK', 'QUEEN', 'ANUBIS'],
        ['SCARAB', 'KING', 'QUEEN', 'JACK', 'QUEEN'],
      ]),
      'ACE',
    );
    expect(r.lineWins).toHaveLength(0);
    expect(r.expandingWin).toMatchObject({ symbol: 'ACE', count: 3, amount: 5 });
    expect(r.totalWin).toBe(5);
  });

  it('lets the expanding symbol pay a line when wilds lead it (slotopol rule)', () => {
    // top line PAPYRUS ACE ACE ACE KING with es = ACE: wild leads, so the
    // line pays 4 ACEs (40/10 = 4x) AND the collect pays 3 ACEs (5x)
    const r = evaluate(
      fromRows([
        ['PAPYRUS', 'ACE', 'ACE', 'ACE', 'KING'],
        ['MUMMY', 'QUEEN', 'JACK', 'QUEEN', 'ANUBIS'],
        ['SCARAB', 'KING', 'TEN', 'JACK', 'QUEEN'],
      ]),
      'ACE',
    );
    const top = r.lineWins.find((w) => w.line === 1);
    expect(top).toMatchObject({ symbol: 'ACE', count: 4, amount: 4 });
    expect(r.expandingWin).toMatchObject({ symbol: 'ACE', count: 3, amount: 5 });
    expect(r.totalWin).toBe(9);
  });

  it('never pays a pure-wild line on its own', () => {
    const r = evaluate(
      fromRows([
        ['PAPYRUS', 'PAPYRUS', 'PAPYRUS', 'PAPYRUS', 'PAPYRUS'],
        ['MUMMY', 'QUEEN', 'JACK', 'QUEEN', 'ANUBIS'],
        ['SCARAB', 'KING', 'QUEEN', 'JACK', 'QUEEN'],
      ]),
    );
    // 5 PAPYRUS pay as scatter (200x) and trigger, but no line win
    expect(r.lineWins.filter((w) => w.line === 1)).toHaveLength(0);
    expect(r.scatterWin).toMatchObject({ count: 5, amount: 200 });
  });
});

describe('playRound', () => {
  it('settles free games in full, retriggers included, with one expanding symbol', () => {
    // Hunt for a seeded round that triggers, then check the invariants.
    let checkedBonus = 0;
    for (let seed = 1; seed < 40_000 && checkedBonus < 25; seed++) {
      const r = playRound(mulberry32(seed));
      if (!r.bonus) continue;
      checkedBonus++;
      expect(r.baseSpin.freeSpinsWon).toBe(10);
      // every retrigger adds 10 spins to the session
      expect(r.bonus.spins.length).toBe(10 + r.bonus.retriggers * 10);
      // the whole session pays out in the round total
      const bonusSum = r.bonus.spins.reduce((a, s) => a + s.totalWin, 0);
      expect(r.bonus.totalWin).toBeCloseTo(bonusSum, 9);
      expect(r.totalWin).toBeCloseTo(r.baseSpin.totalWin + bonusSum, 9);
      // free spins never draw PAPYRUS as the expanding symbol
      expect(r.bonus.expandingSymbol).not.toBe('PAPYRUS');
    }
    expect(checkedBonus).toBeGreaterThan(0);
  });
});
