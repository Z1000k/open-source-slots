/**
 * The GAME INFO screen: paytable at the CURRENT bet, the monarch, the heirs
 * and the free games rules, the twenty lines, and the rules. A DOM overlay,
 * rebuilt on every open so the pays always match the stake. House copy
 * style: no em or en dashes in anything a player reads.
 */
import { FREE_GAMES_DRAW, GAME_RTP, LINE_PAY, LINES, PAYLINES, SCAT_PAY, type PaySymbol } from '../engine';
import { symbolArt } from './assets';

/** Paytable display order: the monarch, the five pictures, then the cards. */
const PAY_ORDER: PaySymbol[] = [
  'MONARCH',
  'KNIGHT',
  'EAGLE',
  'WOLF',
  'CHALICE',
  'SCEPTER',
  'ACE',
  'KING',
  'QUEEN',
  'JACK',
  'TEN',
  'NINE',
];

export class GameInfo {
  private readonly el: HTMLDivElement;
  private readonly getBet: () => number;
  isOpen = false;

  constructor(getBet: () => number) {
    this.getBet = getBet;
    this.el = document.createElement('div');
    this.el.id = 'gameinfo';
    this.el.hidden = true;
    document.body.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el || (e.target as HTMLElement).id === 'gi-close') this.close();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.isOpen) this.close();
    });
  }

  open(): void {
    const bet = this.getBet();
    const money = (perLinePay: number): string => ((perLinePay / LINES) * bet).toFixed(2);
    const totalBets = (x: number): string => (x * bet).toFixed(2);
    const draws = FREE_GAMES_DRAW.join(', ').replace(/, (\d+)$/, ' OR $1');
    const fewest = FREE_GAMES_DRAW[0];
    const most = FREE_GAMES_DRAW[FREE_GAMES_DRAW.length - 1];

    const payRows = PAY_ORDER.map((sym) => {
      const pays = LINE_PAY[sym];
      const cells = [4, 3, 2, 1]
        .map((i) =>
          pays[i] > 0
            ? `<div class="gi-pay"><b>x${i + 1}</b><span>${money(pays[i])}</span></div>`
            : '',
        )
        .join('');
      const top = sym === 'MONARCH' ? ' gi-top' : '';
      return `<div class="gi-sym${top}">${symbolArt(sym, 'gi-art')}<div class="gi-pays">${cells}</div></div>`;
    }).join('');

    const lineCards = PAYLINES.map((rows, li) => {
      const dots = Array.from({ length: 15 }, (_, i) => {
        const x = i % 5;
        const y = Math.floor(i / 5);
        return `<i${rows[x] === y ? ' class="on"' : ''}></i>`;
      }).join('');
      return `<div class="gi-line"><div class="gi-grid">${dots}</div><span>LINE ${li + 1}</span></div>`;
    }).join('');

    this.el.innerHTML = `
      <div class="gi-inner">
        <button id="gi-close" type="button" aria-label="Close">×</button>
        <h2>GAME INFO - THE DYNASTY</h2>

        <h3>PAYTABLE, AT THE CURRENT BET OF ${bet.toFixed(2)}</h3>
        <div class="gi-paytable">${payRows}
          <div class="gi-sym gi-star">
            <span class="gi-heirs">${symbolArt('HEIRESS', 'gi-art')}${symbolArt('HEIR', 'gi-art')}</span>
            <div class="gi-pays">
              <div class="gi-pay"><b>x5</b><span>${totalBets(SCAT_PAY[4])}</span></div>
              <div class="gi-pay"><b>x4</b><span>${totalBets(SCAT_PAY[3])}</span></div>
              <div class="gi-pay"><b>x3</b><span>${totalBets(SCAT_PAY[2])}</span></div>
            </div>
            <p>THE HEIRESS AND THE HEIR ARE THE SCATTERS. 3 OR MORE OF EITHER ANYWHERE CALL ${fewest} TO ${most} FREE GAMES. IN THE FREE GAMES THE HEIR WHO CALLED THEM PAYS ${SCAT_PAY[2]}x, ${SCAT_PAY[3]}x OR ${SCAT_PAY[4]}x THE TOTAL BET FOR 3, 4 OR 5 ANYWHERE, ADDED TO ANY LINE WIN. IN THE MAIN GAME THE HEIRS PAY NOTHING THEMSELVES.</p>
          </div>
        </div>

        <h3>THE MONARCH</h3>
        <ul class="gi-rules">
          <li>THE MONARCH IS WILD AND SUBSTITUTES FOR EVERY SYMBOL ON THE LINES EXCEPT THE HEIRS.</li>
          <li>EVERY LINE WIN THE MONARCH HELPS COMPLETE PAYS DOUBLE.</li>
          <li>THE MONARCH ALSO PAYS ON ITS OWN, FROM 2 IN A ROW. A LINE PAYS WHICHEVER IS WORTH MORE: THE MONARCH'S OWN RUN, WHICH IS NEVER DOUBLED, OR THE DOUBLED RUN IT COMPLETES.</li>
          <li>5 MONARCHS ON A LINE PAY ${LINE_PAY.MONARCH[4] / LINES}x THE TOTAL BET.</li>
        </ul>

        <h3>FREE GAMES</h3>
        <ul class="gi-rules">
          <li>3 OR MORE HEIRESSES, OR 3 OR MORE HEIRS, ANYWHERE CALL THE FREE GAMES AT THE TRIGGERING BET.</li>
          <li>THE NUMBER OF FREE GAMES IS DRAWN AT RANDOM: ${draws}, EACH EQUALLY LIKELY.</li>
          <li>THE FREE GAMES SPIN ON THEIR OWN SET OF REELS.</li>
          <li>THE HEIR WHO CALLED THEM IS THE SCATTER: 3, 4 OR 5 ANYWHERE PAY ${SCAT_PAY[2]}x, ${SCAT_PAY[3]}x OR ${SCAT_PAY[4]}x THE TOTAL BET AND CALL A NEW DRAW OF ${fewest} TO ${most} MORE FREE GAMES, WITHOUT LIMIT.</li>
          <li>THE OTHER HEIR IS CROWNED AND PLAYS EXACTLY AS THE MONARCH: WILD, DOUBLING EVERY LINE WIN IT HELPS COMPLETE, AND A RUN OF CROWNED HEIRS AND MONARCHS PAYS AS THE MONARCH'S OWN RUN.</li>
          <li>SKIP ENDS THE WATCHING, NOT THE FREE GAMES. EVERY ONE OF THEM IS STILL PLAYED AND PAID.</li>
        </ul>

        <h3>BET LINES</h3>
        <div class="gi-lines">${lineCards}</div>

        <h3>RULES</h3>
        <ul class="gi-rules">
          <li>ALL ${LINES} LINES ARE ALWAYS ACTIVE.</li>
          <li>LINE WINS PAY LEFT TO RIGHT ON CONSECUTIVE REELS, STARTING FROM THE LEFTMOST REEL, FROM 3 IN A ROW, THE MONARCH FROM 2.</li>
          <li>ONLY THE HIGHEST WIN ON EACH LINE PAYS. WINS ON DIFFERENT LINES ARE ADDED.</li>
          <li>LINE PAYS ARE SHOWN AT THE CURRENT TOTAL BET, WHICH COVERS ALL ${LINES} LINES.</li>
          <li>THE THEORETICAL RETURN TO PLAYER (RTP) IS ${GAME_RTP.toFixed(2)}%.</li>
          <li>MALFUNCTION VOIDS ALL PAYS AND PLAYS.</li>
        </ul>
        <div class="gi-keys">SPACE - SPIN &nbsp;&nbsp; S - SOUND ON/OFF</div>
      </div>
    `;
    this.el.hidden = false;
    this.isOpen = true;
  }

  close(): void {
    this.el.hidden = true;
    this.isOpen = false;
  }
}
