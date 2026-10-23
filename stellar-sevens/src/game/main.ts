// The live CSP on apexslots.eu has no 'unsafe-eval': this import MUST come
// first or Pixi hangs on boot when served from the site.
import 'pixi.js/unsafe-eval';
import { Application } from 'pixi.js';
import { mulberry32, playRound, randomSeed, type RoundResult } from '../engine';
import { Board, BOARD_H, BOARD_W, loadSymbolTextures } from './board';
import { Hud } from './hud';
import { initFit } from './fit';
import { fetchSession, REAL, serverSpin, tellLowBalance, WalletError } from './wallet';

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
  // still boots, shows zero, and says why.
  let balance = 1000;
  let sessionTrouble = '';
  if (REAL) {
    try {
      balance = (await fetchSession()).balanceCents / 100;
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
  board.land(playRound(mulberry32(7)).baseSpin.grid);

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

    let round: RoundResult;
    let settledBalance: number;
    if (REAL) {
      // the press starts the show: the reels roll while the server deals,
      // and the answer lands them (board.spin below)
      board.prime();
      try {
        const dealt = await serverSpin({ type: 'base' }, Math.round(bet * 100));
        round = dealt.round;
        settledBalance = dealt.balanceCents / 100;
        hud.setBalance(settledBalance - dealt.winCents / 100);
      } catch (err) {
        hud.message(err instanceof WalletError ? err.message : 'The spin failed. Nothing was charged.');
        if (err instanceof WalletError && err.balanceCents !== undefined) {
          hud.setBalance(err.balanceCents / 100);
        }
        // the reels come back down where they were
        await board.abort();
        busy = false;
        hud.setBusy(false);
        return;
      }
    } else {
      hud.setBalance(hud.balance - bet);
      round = playRound(rng);
      settledBalance = hud.balance + round.totalWin * bet;
    }

    await board.spin(round.baseSpin.grid);

    const win = round.totalWin * bet;
    if (win > 0) {
      const show = board.presentWins(round.baseSpin);
      await hud.countWin(win);
      if (win >= bet * 20) await hud.bigWin(win);
      await show;
      hud.message(`WIN ${win.toFixed(2)}`);
    }
    hud.setBalance(settledBalance);

    busy = false;
    hud.setBusy(false);
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
    const dismiss = (): void => {
      intro.classList.add('done');
      setTimeout(() => intro.remove(), 500);
      window.removeEventListener('keydown', onKey, true);
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
  }
}

void boot();
