/**
 * The control bar and money meters, plain DOM under the Pixi frame: balance,
 * bet stepper, win meter, the SPIN button and the message line, plus the
 * BIG WIN plaque and the whole free games ceremony (the opening plaque, the
 * spins-left counter with its SKIP button, retrigger flashes, the closing
 * tally). Meters say DEMO in the demo and nothing but the truth behind the
 * login.
 */
import { FREE_SPINS_AWARD } from '../engine';
import { sound } from './audio';
import { countUp } from './tween';
import { GameInfo } from './gameinfo';
import { symbolArt } from './assets';
import { REAL } from './wallet';

const DEMO = REAL ? '' : 'DEMO ';

const ALL_BETS = [
  0.1, 0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 35,
  40, 45, 50, 75, 100,
];
/** Real play caps the stake at €5 (the server refuses more); the demo keeps the full ladder. */
const BETS = REAL ? ALL_BETS.filter((b) => b <= 5) : ALL_BETS;

export interface HudCallbacks {
  /** manual spin, and the quick-stop while the reels roll */
  onSpin: () => void;
}

export class Hud {
  private betIndex = BETS.indexOf(1);
  private busy = false;
  private balanceValue = 0;
  private skipFree = false;

  private readonly balanceEl: HTMLElement;
  private readonly winEl: HTMLElement;
  private readonly betEl: HTMLElement;
  private readonly messageEl: HTMLElement;
  private readonly spinBtn: HTMLButtonElement;
  private readonly betUp: HTMLButtonElement;
  private readonly betDown: HTMLButtonElement;
  private readonly bigwinEl: HTMLElement;
  private readonly fsPanel: HTMLElement;
  private readonly skipBtn: HTMLButtonElement;
  private readonly overlayEl: HTMLDivElement;
  private readonly info: GameInfo;

  constructor(root: HTMLElement, cb: HudCallbacks) {
    root.innerHTML = `
      <div id="hud-bar">
        <button id="info-btn" type="button" aria-label="Game info">i</button>
        <button id="sound-btn" type="button" aria-label="Toggle sound"></button>
        <div class="meter"><span class="meter-label">${DEMO}BALANCE</span><span id="m-balance">0.00</span></div>
        <div class="bet-stepper">
          <button id="bet-down" type="button" aria-label="Lower bet">-</button>
          <div class="meter"><span class="meter-label">TOTAL BET</span><span id="m-bet"></span></div>
          <button id="bet-up" type="button" aria-label="Raise bet">+</button>
        </div>
        <button id="spin-btn" type="button" aria-label="Spin">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round">
            <path d="M 40 24 A 16 16 0 1 1 33 11" />
            <path d="M 33 3 L 33 12 L 42 12" stroke-linejoin="round"/>
          </svg>
        </button>
        <div class="meter"><span class="meter-label">WIN</span><span id="m-win">0.00</span></div>
        <div id="hud-message"></div>
        <div id="fs-panel" hidden>
          <span class="fs-art"></span>
          <span class="fs-text">FREE GAMES <b class="fs-left">0</b></span>
          <span class="fs-wild">GALLEONS WILD</span>
          <button id="fs-skip" type="button">SKIP</button>
        </div>
      </div>
      <div id="bigwin" hidden><div class="bigwin-title">BIG WIN</div><div class="bigwin-amount">0.00</div></div>
    `;
    this.balanceEl = root.querySelector('#m-balance')!;
    this.winEl = root.querySelector('#m-win')!;
    this.betEl = root.querySelector('#m-bet')!;
    this.messageEl = root.querySelector('#hud-message')!;
    this.spinBtn = root.querySelector('#spin-btn')!;
    this.betUp = root.querySelector('#bet-up')!;
    this.betDown = root.querySelector('#bet-down')!;
    this.bigwinEl = root.querySelector('#bigwin')!;
    this.fsPanel = root.querySelector('#fs-panel')!;
    this.skipBtn = root.querySelector('#fs-skip')!;
    this.info = new GameInfo(() => this.bet);

    // Skipping only skips the watching: the free games were all decided the
    // moment they were triggered, and every one of them is still paid.
    this.skipBtn.addEventListener('click', () => {
      sound.click();
      this.skipFree = true;
      this.skipBtn.hidden = true;
    });

    this.overlayEl = document.createElement('div');
    this.overlayEl.id = 'bonus-overlay';
    this.overlayEl.hidden = true;
    document.body.appendChild(this.overlayEl);

    const soundBtn = root.querySelector<HTMLButtonElement>('#sound-btn')!;
    const speaker = (muted: boolean): string =>
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 9.5 L8 9.5 L13 5 L13 19 L8 14.5 L4 14.5 Z" fill="currentColor" stroke="none"/>
        ${muted ? '<path d="M16.5 9.5 L21 14.5 M21 9.5 L16.5 14.5"/>' : '<path d="M16 9 Q18.5 12 16 15 M18.5 6.5 Q22.5 12 18.5 17.5"/>'}
      </svg>`;
    soundBtn.innerHTML = speaker(sound.muted);
    const toggleSound = (): void => {
      soundBtn.innerHTML = speaker(sound.toggle());
      sound.click();
    };
    soundBtn.addEventListener('click', toggleSound);

    this.spinBtn.addEventListener('click', cb.onSpin);
    this.betUp.addEventListener('click', () => {
      sound.click();
      this.stepBet(1);
    });
    this.betDown.addEventListener('click', () => {
      sound.click();
      this.stepBet(-1);
    });
    root.querySelector('#info-btn')!.addEventListener('click', () => {
      sound.click();
      this.info.open();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyS' && !e.repeat) {
        toggleSound();
        return;
      }
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        if (this.info.isOpen) return;
        cb.onSpin();
      }
    });

    this.renderBet();
    this.refresh();
  }

  get bet(): number {
    return BETS[this.betIndex];
  }

  get balance(): number {
    return this.balanceValue;
  }

  setBalance(v: number): void {
    this.balanceValue = v;
    this.balanceEl.textContent = v.toFixed(2);
  }

  setWin(v: number): void {
    this.winEl.textContent = v.toFixed(2);
  }

  /** Animate the win meter counting up to `v`, bubbling as it climbs. */
  async countWin(v: number, ms = 700): Promise<void> {
    sound.countStart();
    await countUp(ms, 0, v, (n) => (this.winEl.textContent = n.toFixed(2)));
    sound.countStop();
  }

  /** The BIG WIN plaque with its own count-up; resolves when it fades. */
  async bigWin(v: number): Promise<void> {
    const amount = this.bigwinEl.querySelector('.bigwin-amount')!;
    sound.bigwin();
    this.bigwinEl.hidden = false;
    this.bigwinEl.classList.add('show');
    await countUp(1400, 0, v, (n) => (amount.textContent = n.toFixed(2)));
    await new Promise((r) => setTimeout(r, 700));
    this.bigwinEl.classList.remove('show');
    await new Promise((r) => setTimeout(r, 350));
    this.bigwinEl.hidden = true;
  }

  message(text: string): void {
    this.messageEl.textContent = text;
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    this.refresh();
  }

  // -------------------------------------------------------- free games UI

  /**
   * True once the player has asked to skip the rest of the free games. The
   * outcome was decided before the first one rolled, so skipping only skips
   * the watching.
   */
  get skipping(): boolean {
    return this.skipFree;
  }

  /** Arm the counter for a fresh session. */
  resetSkip(): void {
    this.skipFree = false;
    this.skipBtn.hidden = false;
  }

  /** Show or clear the spins-left counter beside the meters. */
  setFreeSpins(left: number | null): void {
    if (left === null) {
      this.fsPanel.hidden = true;
      return;
    }
    this.fsPanel.hidden = false;
    this.fsPanel.querySelector('.fs-left')!.textContent = String(left);
    this.fsPanel.querySelector('.fs-art')!.innerHTML = symbolArt('GALLEON', 'fs-sym');
  }

  /** A full-screen plaque; resolves on click or after `ms`. */
  private plaque(html: string, ms: number): Promise<void> {
    this.overlayEl.innerHTML = `<div class="bo-inner">${html}</div>`;
    this.overlayEl.hidden = false;
    requestAnimationFrame(() => this.overlayEl.classList.add('show'));
    return new Promise((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        this.overlayEl.classList.remove('show');
        setTimeout(() => {
          this.overlayEl.hidden = true;
          resolve();
        }, 300);
      };
      this.overlayEl.onclick = finish;
      setTimeout(finish, ms);
    });
  }

  /** The trigger ceremony: land ho, 10 free games with every galleon wild. */
  async bonusIntro(): Promise<void> {
    sound.bonusStart();
    await this.plaque(
      `<div class="bo-kicker">LAND HO</div>
       <div class="bo-title">${FREE_SPINS_AWARD} FREE GAMES</div>
       <div class="bo-art">${symbolArt('GALLEON', 'bo-sym')}</div>
       <div class="bo-sub">EVERY GALLEON SAILS WILD, AT THE TRIGGERING BET</div>
       <div class="bo-hint">3 GALLEONS DURING THE FREE GAMES ADD ${FREE_SPINS_AWARD} MORE, WITHOUT LIMIT</div>`,
      3400,
    );
  }

  /** More free games landed mid-bonus. */
  async retriggerFlash(): Promise<void> {
    sound.retrigger();
    await this.plaque(`<div class="bo-title">+${FREE_SPINS_AWARD} FREE GAMES</div>`, 1700);
  }

  /** The closing tally; `win` in money. */
  async bonusEnd(win: number): Promise<void> {
    sound.bonusEnd();
    await this.plaque(
      `<div class="bo-kicker">SAFE IN HARBOUR</div>
       <div class="bo-title bo-amount">${win.toFixed(2)}</div>
       <div class="bo-sub">${win > 0 ? 'ADDED TO YOUR BALANCE' : 'THE SEA KEPT ITS TREASURE THIS TIME'}</div>`,
      3200,
    );
  }

  private stepBet(dir: number): void {
    if (this.busy) return;
    this.betIndex = Math.min(BETS.length - 1, Math.max(0, this.betIndex + dir));
    this.renderBet();
    this.refresh();
  }

  private renderBet(): void {
    this.betEl.textContent = this.bet.toFixed(2);
  }

  private refresh(): void {
    this.betUp.disabled = this.busy || this.betIndex === BETS.length - 1;
    this.betDown.disabled = this.busy || this.betIndex === 0;
  }
}
