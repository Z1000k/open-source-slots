/**
 * The control bar and money meters, plain DOM under the Pixi frame: balance,
 * bet stepper, win meter, the SPIN button and the message line, plus the
 * BIG WIN plaque, the avalanche counter and the whole barn ladder bonus.
 * Meters say DEMO in the demo and nothing but the truth behind the login.
 */
import type { BonusResult } from '../engine';
import { sound } from './audio';
import { countUp, sleep } from './tween';
import { GameInfo } from './gameinfo';
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

  private readonly balanceEl: HTMLElement;
  private readonly winEl: HTMLElement;
  private readonly betEl: HTMLElement;
  private readonly messageEl: HTMLElement;
  private readonly spinBtn: HTMLButtonElement;
  private readonly betUp: HTMLButtonElement;
  private readonly betDown: HTMLButtonElement;
  private readonly bigwinEl: HTMLElement;
  private readonly chainPanel: HTMLElement;
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
        <div id="chain-panel" hidden>
          <span class="chain-text">AVALANCHE <b class="chain-n">0</b></span>
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
    this.chainPanel = root.querySelector('#chain-panel')!;
    this.info = new GameInfo(() => this.bet);

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

  /** Animate the win meter counting up to `v`, with the temple ticking. */
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

  // ------------------------------------------------------------ avalanche

  /** Show or clear the avalanche counter beside the meters. */
  setChain(n: number | null): void {
    if (n === null || n < 1) {
      this.chainPanel.hidden = true;
      return;
    }
    this.chainPanel.hidden = false;
    this.chainPanel.querySelector('.chain-n')!.textContent = String(n);
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

  // --------------------------------------------------------- barn ladder

  /** The trigger ceremony. */
  async ladderIntro(): Promise<void> {
    sound.bonusStart();
    await this.plaque(
      `<div class="bo-kicker">THREE TRACTORS</div>
       <div class="bo-title">THE BARN LADDER</div>
       <div class="bo-sub">CLIMB THE LOFT, ONE CRATE AT A TIME</div>
       <div class="bo-hint">A GOLDEN CRATE LIFTS YOU A FLOOR, THE BUCKET ENDS IT</div>`,
      3200,
    );
  }

  /**
   * Play the ladder out: five floors of face-down crates, turned over one at a
   * time from the bottom floor up. The result is already decided by the engine
   * or the server; this only lets the player watch it happen.
   */
  async playLadder(bonus: BonusResult, bet: number): Promise<void> {
    const floors = bonus.levels
      .map((level, li) => {
        const crates = level.cells
          .map((_, ci) => `<span class="crate" data-l="${li}" data-c="${ci}">?</span>`)
          .join('');
        return `<div class="floor" data-l="${li}"><span class="floor-no">${li + 1}</span>${crates}</div>`;
      })
      .reverse()
      .join('');

    this.overlayEl.innerHTML = `<div class="bo-inner ladder-wrap">
      <div class="bo-kicker">THE BARN LADDER</div>
      <div class="ladder">${floors}</div>
      <div class="ladder-meters">
        <span>COLLECTED <b class="ladder-pay">0.00</b></span>
        <span>MULTIPLIER <b class="ladder-mult">x1</b></span>
      </div>
    </div>`;
    this.overlayEl.hidden = false;
    requestAnimationFrame(() => this.overlayEl.classList.add('show'));

    const payEl = this.overlayEl.querySelector('.ladder-pay')!;
    const multEl = this.overlayEl.querySelector('.ladder-mult')!;
    let pay = 0;
    let mult = 1;

    for (let li = 0; li < bonus.levelsReached; li++) {
      const level = bonus.levels[li];
      const floorEl = this.overlayEl.querySelector<HTMLElement>(`.floor[data-l="${li}"]`)!;
      floorEl.classList.add('active');
      await sleep(320);

      for (let ci = 0; ci < level.revealed; ci++) {
        const cell = level.cells[ci];
        const el = this.overlayEl.querySelector<HTMLElement>(
          `.crate[data-l="${li}"][data-c="${ci}"]`,
        )!;
        el.classList.add('open');
        if (cell.kind === 'bucket') {
          el.classList.add('bucket');
          el.textContent = 'SPILL';
          sound.ladderBust();
        } else if (cell.kind === 'mult') {
          el.classList.add('gold', 'mult');
          el.textContent = '+1x';
          mult++;
          multEl.textContent = `x${mult}`;
          sound.ladderMult();
        } else {
          el.classList.toggle('gold', cell.climbs);
          el.textContent = (cell.value * bet).toFixed(2);
          pay += cell.value;
          payEl.textContent = (pay * bet).toFixed(2);
          sound.ladderPrize(cell.climbs);
        }
        await sleep(cell.kind === 'bucket' ? 900 : 620);
      }

      floorEl.classList.remove('active');
      floorEl.classList.add('done');
      if (li + 1 < bonus.levelsReached) sound.ladderClimb();
    }

    await sleep(500);
    this.overlayEl.classList.remove('show');
    await sleep(320);
    this.overlayEl.hidden = true;

    await this.ladderEnd(bonus, bet);
  }

  /** The closing tally. */
  private async ladderEnd(bonus: BonusResult, bet: number): Promise<void> {
    sound.bonusEnd();
    const win = bonus.totalWin * bet;
    await this.plaque(
      `<div class="bo-kicker">LADDER COMPLETE</div>
       <div class="bo-title bo-amount">${win.toFixed(2)}</div>
       <div class="bo-sub">${
         bonus.multiplier > 1
           ? `${(bonus.pay * bet).toFixed(2)} COLLECTED, MULTIPLIED BY ${bonus.multiplier}`
           : 'ADDED TO YOUR BALANCE'
       }</div>`,
      3000,
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
