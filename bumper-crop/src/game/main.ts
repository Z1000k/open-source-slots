// The live CSP on apexslots.eu has no 'unsafe-eval': this import MUST come
// first or Pixi hangs on boot when served from the site.
import 'pixi.js/unsafe-eval';
import { Application } from 'pixi.js';
import { mulberry32, playRound, randomSeed, type RoundResult } from '../engine';
import { Board, BOARD_H, BOARD_W, loadSymbolTextures } from './board';
import { Hud } from './hud';
import { initFit } from './fit';
import {
  deliverRound,
  fetchSession,
  REAL,
  serverSpin,
  tellLowBalance,
  WalletError,
  type PendingRound,
} from './wallet';

const rng = mulberry32(randomSeed());

function loaderProgress(pct: number): void {
  const fill = document.querySelector<HTMLElement>('.loader-fill');
  if (fill) fill.style.width = `${pct}%`;
}

async function boot(): Promise<void> {
  initFit();
  loaderProgress(15);

  const app = new Application();
  await app.init({
    width: BOARD_W,
    height: BOARD_H,
    backgroundAlpha: 0,
    antialias: true,
    powerPreference: 'high-performance',
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  // autoDensity writes inline width/height styles; clear both so the
  // responsive #stage canvas CSS rules control the displayed size.
  app.canvas.style.width = '';
  app.canvas.style.height = '';
  document.getElementById('stage')!.appendChild(app.canvas);
  loaderProgress(45);

  const board = new Board(app, await loadSymbolTextures());
  loaderProgress(75);

  // Played for real, the opening balance comes from the casino's books, not
  // from numbers in this file. If the server cannot be reached the game
  // still boots, shows zero, and says why. An unfinished bonus from an
  // earlier visit comes back too, and plays out before anything else.
  let balance = 1000;
  let sessionTrouble = '';
  let unfinished: PendingRound | null = null;
  if (REAL) {
    try {
      const session = await fetchSession();
      balance = session.balanceCents / 100;
      unfinished = session.pending;
    } catch (err) {
      balance = 0;
      sessionTrouble =
        err instanceof WalletError ? err.message : 'The casino did not answer. Reload to try again.';
    }
  }
  loaderProgress(90);

  let busy = false;

  const hud = new Hud(document.getElementById('ui')!, {
    onSpin: () => {
      if (busy) {
        board.hurry();
        return;
      }
      void play();
    },
  });
  hud.setBalance(balance);
  if (sessionTrouble) hud.message(sessionTrouble);

  // land an opening grid so the frame never sits empty
  board.land(playRound(mulberry32(7)).falls[0].grid);

  /**
   * Present one settled round from the opening drop on: the avalanche fall by
   * fall, each fall's wins added to the meter, and the barn ladder whenever
   * the tractors open one. `settle` runs after everything has been watched and
   * returns the balance to show (for real play it delivers the held win and
   * returns the server's answer).
   */
  async function presentRound(
    round: RoundResult,
    bet: number,
    landBase: boolean,
    settle: () => Promise<number>,
  ): Promise<void> {
    if (landBase) await board.spin(round.falls[0].grid);

    let shown = 0;
    for (let i = 0; i < round.falls.length; i++) {
      const fall = round.falls[i];
      // after the last paying fall the crops still burst and drop, onto the
      // grid the round came to rest on
      const next = round.falls[i + 1]?.grid ?? round.finalGrid;
      hud.setChain(i);

      await board.presentFall(fall, next, i, async () => {
        // the tractors paid, now the ladder is climbed before the crops burst
        await hud.ladderIntro();
        await hud.playLadder(fall.bonus!, bet);
      });

      if (fall.win > 0) {
        shown += fall.win * bet;
        await hud.countWin(shown, i === 0 ? 700 : 420);
      }
    }
    hud.setChain(null);

    const win = round.totalWin * bet;
    if (win > 0) {
      hud.setWin(win);
      if (win >= bet * 20) await hud.bigWin(win);
      hud.message(
        round.cascades > 0
          ? `WIN ${win.toFixed(2)} after ${round.cascades} avalanche${round.cascades > 1 ? 's' : ''}`
          : `WIN ${win.toFixed(2)}`,
      );
    }
    hud.setBalance(await settle());
  }

  async function play(): Promise<void> {
    const bet = hud.bet;
    if (hud.balance < bet) {
      if (!tellLowBalance()) hud.message(REAL ? 'Balance exhausted.' : 'Balance exhausted, refresh to reset the demo.');
      return;
    }

    busy = true;
    hud.setBusy(true);
    hud.setWin(0);
    hud.message('');

    try {
      if (REAL) {
        let dealt;
        // the press starts the show: the reels roll while the server deals,
        // and the answer lands them (presentRound below)
        board.prime();
        try {
          dealt = await serverSpin({ type: 'base' }, Math.round(bet * 100));
        } catch (err) {
          // the reels come back down where they were
          await board.abort();
          if (err instanceof WalletError && err.pending) {
            // The server found an unwatched ladder: it plays out now.
            hud.message('Your unfinished barn ladder plays out first.');
            await resumePending(err.pending);
            return;
          }
          hud.message(err instanceof WalletError ? err.message : 'The spin failed. Nothing was charged.');
          if (err instanceof WalletError && err.balanceCents !== undefined) {
            hud.setBalance(err.balanceCents / 100);
          }
          return;
        }
        const paid = dealt.balanceCents / 100;
        // While the round plays, the meter shows the post-stake balance; a
        // held win is not on the books yet, an instant win is backed out
        // until it has been presented.
        hud.setBalance(dealt.held ? paid : paid - dealt.winCents / 100);
        await presentRound(dealt.round, bet, true, async () =>
          dealt.held ? (await deliverRound(dealt.roundId)) / 100 : paid,
        );
      } else {
        hud.setBalance(hud.balance - bet);
        const round = playRound(rng);
        const after = hud.balance + round.totalWin * bet;
        await presentRound(round, bet, true, async () => after);
      }
    } catch (err) {
      hud.message(err instanceof WalletError ? err.message : 'Something went wrong. Reload to re-sync.');
    } finally {
      busy = false;
      hud.setBusy(false);
    }
  }

  /** Play out a round recorded earlier: land its base grid, then the bonus. */
  async function resumePending(pending: PendingRound): Promise<void> {
    const bet = pending.betCents / 100;
    busy = true;
    hud.setBusy(true);
    hud.setWin(0);
    try {
      board.land(pending.round.falls[0].grid);
      await presentRound(
        pending.round,
        bet,
        false,
        async () => (await deliverRound(pending.roundId)) / 100,
      );
    } catch (err) {
      hud.message(err instanceof WalletError ? err.message : 'Something went wrong. Reload to re-sync.');
    } finally {
      busy = false;
      hud.setBusy(false);
    }
  }

  // loader away, then the intro waits for its click
  loaderProgress(100);
  await new Promise((r) => setTimeout(r, 350));
  const loader = document.getElementById('loader');
  if (loader) {
    loader.classList.add('done');
    setTimeout(() => loader.remove(), 600);
  }

  const intro = document.getElementById('intro');
  if (intro) {
    await new Promise<void>((resolve) => {
      const dismiss = (): void => {
        intro.classList.add('done');
        setTimeout(() => intro.remove(), 500);
        window.removeEventListener('keydown', onKey, true);
        resolve();
      };
      const onKey = (e: KeyboardEvent): void => {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          dismiss();
        }
      };
      intro.addEventListener('click', dismiss, { once: true });
      window.addEventListener('keydown', onKey, true);
    });
  }

  // An unfinished bonus greets the player as soon as the intro is gone.
  if (unfinished) {
    hud.message('Your unfinished barn ladder plays out first.');
    await resumePending(unfinished);
  }
}

void boot();
