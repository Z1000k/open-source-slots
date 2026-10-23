/**
 * The control bar and money meters, plain DOM under the Pixi frame: balance,
 * bet stepper, win meter, the SPIN button and the message line, plus the
 * BIG WIN plaque and the whole free games ceremony: the herald's plaque on
 * which the number of free games is drawn, the counter with its SKIP button,
 * a fresh draw for every retrigger, the closing tally. Meters say DEMO in the
 * demo and nothing but the truth behind the login.
 *
 * main.ts tells the HUD counts only. The heir who called comes from court.ts
 * (the board reads it off the base grid). The draw is the first count
 * main.ts sets after the opening plaque, and the free spins wait on
 * court.hold until the plaque has landed on it. A retrigger's draw is how far
 * the count jumps; main.ts counts it in before that spin's reels roll, so the
 * counter holds it back until the retrigger's own plaque has drawn it.
 */
import { FREE_GAMES_DRAW, SCAT_PAY, otherHeir, type Heir } from '../engine';
import { sound } from './audio';
import { countUp } from './tween';
import { GameInfo } from './gameinfo';
import { symbolArt } from './assets';
import { court } from './court';
import { REAL } from './wallet';

const DEMO = REAL ? '' : 'DEMO ';

const ALL_BETS = [
  0.1, 0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 35,
  40, 45, 50, 75, 100,
];
/** Real play caps the stake at €5 (the server refuses more); the demo keeps the full ladder. */
const BETS = REAL ? ALL_BETS.filter((b) => b <= 5) : ALL_BETS;

const FEWEST = FREE_GAMES_DRAW[0];
const MOST = FREE_GAMES_DRAW[FREE_GAMES_DRAW.length - 1];

const plural = (heir: Heir): string => (heir === 'HEIRESS' ? 'HEIRESSES' : 'HEIRS');

/** Numbers passing the drum's window per ms while it rolls. */
const DRUM_SPEED = 1 / 70;

/**
 * The draw: a little reel of the possible counts set into a plaque's title,
 * rolling until the count is known, then easing onto it. Only a show: the
 * count was drawn by the engine (or the server) with the rest of the round.
 */
class DrawDrum {
  private readonly strip: HTMLElement;
  private readonly onTick: () => void;
  /** in entries: entry i shows FREE_GAMES_DRAW[i mod 5], the window shows entry `pos` */
  private pos: number;
  private raf = 0;
  private last = 0;
  private landing: { from: number; to: number; start: number; ms: number; done: () => void } | null = null;

  constructor(host: HTMLElement, onTick: () => void) {
    const n = FREE_GAMES_DRAW.length;
    host.innerHTML = `<span class="drum-strip">${Array.from({ length: 3 * n }, (_, i) => `<span>${FREE_GAMES_DRAW[i % n]}</span>`).join('')}</span>`;
    this.strip = host.firstElementChild as HTMLElement;
    this.onTick = onTick;
    this.pos = Math.floor(Math.random() * n);
    this.render();
  }

  /** Roll at full speed until land() is called. */
  roll(): void {
    if (this.raf) return;
    this.last = performance.now();
    const step = (now: number): void => {
      const before = Math.floor(this.pos);
      const l = this.landing;
      if (l) {
        const t = Math.min(1, (now - l.start) / l.ms);
        // cubic ease-out from the rolling speed, so the drum never jolts
        this.pos = l.from + (l.to - l.from) * (1 - (1 - t) ** 3);
        if (t >= 1) {
          this.settle();
          return;
        }
      } else {
        this.pos += Math.min(64, now - this.last) * DRUM_SPEED;
      }
      this.last = now;
      if (Math.floor(this.pos) !== before) this.onTick();
      this.render();
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  /** Ease onto `count`, at least three numbers on; resolves once it sits there. */
  land(count: number): Promise<void> {
    const n = FREE_GAMES_DRAW.length;
    const idx = FREE_GAMES_DRAW.indexOf(count);
    let to = Math.ceil(this.pos + 3);
    while (((to % n) + n) % n !== idx) to++;
    return new Promise((done) => {
      this.landing = { from: this.pos, to, start: performance.now(), ms: (3 * (to - this.pos)) / DRUM_SPEED, done };
      this.roll();
    });
  }

  /** Clicked: a landing under way finishes at once. */
  finish(): void {
    if (this.landing) this.settle();
  }

  /** Stop wherever it is (the plaque is going). */
  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private settle(): void {
    const l = this.landing!;
    this.landing = null;
    this.stop();
    this.pos = l.to;
    this.render();
    l.done();
  }

  private render(): void {
    const n = FREE_GAMES_DRAW.length;
    const p = ((this.pos % n) + n) % n;
    this.strip.style.transform = `translateY(${-(n + p)}em)`;
  }
}

export interface HudCallbacks {
  /** manual spin, and the quick-stop while the reels roll */
  onSpin: () => void;
}

export class Hud {
  private betIndex = BETS.indexOf(1);
  private busy = false;
  private balanceValue = 0;
  private skipFree = false;
  /** the opening plaque is up and its draw is still to come */
  private opening = false;
  /** the opening plaque is up: the counter stays hidden until its draw has landed */
  private drawing = false;
  private drum: DrawDrum | null = null;
  /** free games left as main.ts counts them */
  private trueLeft = 0;
  /** a retrigger's games, already in trueLeft, not shown until its plaque draws them */
  private held = 0;

  private readonly balanceEl: HTMLElement;
  private readonly winEl: HTMLElement;
  private readonly betEl: HTMLElement;
  private readonly messageEl: HTMLElement;
  private readonly spinBtn: HTMLButtonElement;
  private readonly betUp: HTMLButtonElement;
  private readonly betDown: HTMLButtonElement;
  private readonly bigwinEl: HTMLElement;
  private readonly fsPanel: HTMLElement;
  private readonly fsLeft: HTMLElement;
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
          <span class="fs-badge"></span>
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
    this.fsLeft = root.querySelector('.fs-left')!;
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

  /** Animate the win meter counting up to `v`, the harpsichord running as it climbs. */
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

  /**
   * The free games left, or null when the session is over. The first count
   * after the opening plaque is the draw: the plaque lands on it and the
   * reels wait. After that a jump is a retrigger, held back until its plaque.
   */
  setFreeSpins(left: number | null): void {
    if (left === null) {
      this.fsPanel.hidden = true;
      this.trueLeft = 0;
      this.held = 0;
      court.session = false;
      document.body.classList.remove('in-court');
      return;
    }
    if (this.opening) {
      this.opening = false;
      this.trueLeft = left;
      this.held = 0;
      court.hold = this.landOpening(left);
      return;
    }
    const won = left - (this.trueLeft - 1);
    this.trueLeft = left;
    if (won > 0) this.held = won;
    if (this.fsPanel.hidden && !this.drawing) this.showPanel();
    this.renderCount();
  }

  private renderCount(): void {
    this.fsLeft.textContent = String(this.trueLeft - this.held);
  }

  /** The counter beside the meters: the caller's portrait, the count, who is crowned, SKIP. */
  private showPanel(): void {
    const caller = court.caller;
    this.fsPanel.querySelector('.fs-art')!.innerHTML = caller ? symbolArt(caller, 'fs-sym') : '';
    this.fsPanel.querySelector('.fs-badge')!.textContent = caller ? `${otherHeir(caller)} CROWNED` : 'CROWNED HEIR WILD';
    this.fsPanel.hidden = false;
    this.renderCount();
  }

  private openPlaque(html: string): void {
    this.overlayEl.innerHTML = `<div class="bo-inner">${html}</div>`;
    this.overlayEl.hidden = false;
    requestAnimationFrame(() => this.overlayEl.classList.add('show'));
  }

  private closePlaque(): Promise<void> {
    this.overlayEl.onclick = null;
    this.overlayEl.classList.remove('show');
    return new Promise((resolve) =>
      setTimeout(() => {
        this.overlayEl.hidden = true;
        resolve();
      }, 300),
    );
  }

  /** Resolves after `ms`, or as soon as the plaque is clicked. */
  private waitOrClick(ms: number): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.overlayEl.onclick = null;
        resolve();
      };
      const timer = setTimeout(finish, ms);
      this.overlayEl.onclick = finish;
    });
  }

  /** A full-screen plaque; resolves on click or after `ms`. */
  private async plaque(html: string, ms: number): Promise<void> {
    this.openPlaque(html);
    await this.waitOrClick(ms);
    await this.closePlaque();
  }

  /**
   * Land the plaque's drum on `count`, then close it; the reels wait for this
   * through court.hold. A click lands the drum at once.
   */
  private async landOpening(count: number): Promise<void> {
    const drum = this.drum;
    this.drum = null;
    if (drum && FREE_GAMES_DRAW.includes(count)) {
      this.overlayEl.onclick = () => drum.finish();
      await drum.land(count);
      this.overlayEl.onclick = null;
    } else {
      drum?.stop();
      const host = this.overlayEl.querySelector('.drum');
      if (host) host.textContent = String(count);
    }
    sound.drawLand(count);
    this.overlayEl.querySelector('.bo-title')?.classList.add('drawn');
    await this.waitOrClick(1300);
    await this.closePlaque();
    this.drawing = false;
    this.showPanel();
  }

  /**
   * The herald's plaque: the heir who called, the heir who is crowned, and
   * the drum rolling in the title. It resolves with the drum still rolling
   * and the plaque still up; the first setFreeSpins lands the draw.
   */
  async bonusIntro(): Promise<void> {
    court.session = true;
    this.opening = true;
    this.drawing = true;
    this.held = 0;
    document.body.classList.add('in-court');
    sound.bonusStart();
    const caller = court.caller;
    const crowned = caller ? otherHeir(caller) : null;
    this.openPlaque(
      caller && crowned
        ? `<div class="bo-kicker">THE ${caller} CALLS THE COURT</div>
           <div class="bo-art">${symbolArt(caller, 'bo-sym')}${symbolArt(crowned, 'bo-sym bo-crowned')}</div>
           <div class="bo-title bo-draw"><span class="drum"></span><span>FREE GAMES</span></div>
           <div class="bo-sub">THE ${crowned} IS CROWNED: WILD LIKE THE MONARCH, AND EVERY WIN IT COMPLETES PAYS DOUBLE</div>
           <div class="bo-hint">3 OR MORE ${plural(caller)} PAY UP TO ${SCAT_PAY[4]}x THE TOTAL BET AND CALL ${FEWEST} TO ${MOST} MORE, WITHOUT LIMIT</div>`
        : `<div class="bo-kicker">THE COURT IS CALLED</div>
           <div class="bo-title bo-draw"><span class="drum"></span><span>FREE GAMES</span></div>
           <div class="bo-sub">THE OTHER HEIR IS CROWNED: WILD LIKE THE MONARCH, AND EVERY WIN IT COMPLETES PAYS DOUBLE</div>`,
    );
    this.drum = new DrawDrum(this.overlayEl.querySelector('.drum')!, () => sound.drawTick());
    this.drum.roll();
    await this.waitOrClick(2400);
  }

  /** More free games: the caller calls again, and a fresh draw lands on the plaque. */
  async retriggerFlash(): Promise<void> {
    const won = this.held;
    const caller = court.caller;
    sound.retrigger();
    this.openPlaque(
      `<div class="bo-kicker">${caller ? `THE ${caller} CALLS AGAIN` : 'THE COURT IS CALLED AGAIN'}</div>
       <div class="bo-title bo-draw"><span class="bo-plus">+</span><span class="drum"></span><span>FREE GAMES</span></div>`,
    );
    const host = this.overlayEl.querySelector<HTMLElement>('.drum')!;
    if (FREE_GAMES_DRAW.includes(won)) {
      const drum = new DrawDrum(host, () => sound.drawTick());
      drum.roll();
      this.overlayEl.onclick = () => drum.finish();
      await new Promise((r) => setTimeout(r, 450));
      await drum.land(won);
      this.overlayEl.onclick = null;
    } else {
      host.textContent = String(won);
    }
    sound.drawLand(won);
    this.overlayEl.querySelector('.bo-title')?.classList.add('drawn');
    this.held = 0;
    this.renderCount();
    await this.waitOrClick(900);
    await this.closePlaque();
  }

  /** The closing tally; `win` in money. */
  async bonusEnd(win: number): Promise<void> {
    sound.bonusEnd();
    await this.plaque(
      `<div class="bo-kicker">THE COURT RISES</div>
       <div class="bo-title bo-amount">${win.toFixed(2)}</div>
       <div class="bo-sub">${win > 0 ? 'ADDED TO YOUR BALANCE' : 'NO TRIBUTE THIS TIME'}</div>`,
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
