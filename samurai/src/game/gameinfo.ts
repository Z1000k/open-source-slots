/**
 * The GAME INFO screen: paytable at the CURRENT bet, the samurai and the
 * free games rules, the twenty lines, and the rules. A DOM overlay, rebuilt
 * on every open so the pays always match the stake. House copy style: no em
 * or en dashes in anything a player reads.
 */
import { FREE_SPINS_AWARD, GAME_RTP, LINE_PAY, LINES, PAYLINES, SCAT_PAY, type PaySymbol } from '../engine';
import { symbolArt } from './assets';

/** Paytable display order: the samurai, the five pictures, then the cards. */
const PAY_ORDER: PaySymbol[] = ['SAMURAI', 'DRAGON', 'TIGER', 'ONI', 'HELMET', 'FAN', 'ACE', 'KING', 'QUEEN', 'JACK', 'TEN'];

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

    const payRows = PAY_ORDER.map((sym) => {
      const pays = LINE_PAY[sym];
      const cells = [4, 3, 2, 1]
        .map((i) =>
          pays[i] > 0
            ? `<div class="gi-pay"><b>x${i + 1}</b><span>${money(pays[i])}</span></div>`
            : '',
        )
        .join('');
      const top = sym === 'SAMURAI' ? ' gi-top' : '';
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
        <h2>GAME INFO - SAMURAI</h2>

        <h3>PAYTABLE, AT THE CURRENT BET OF ${bet.toFixed(2)}</h3>
        <div class="gi-paytable">${payRows}
          <div class="gi-sym gi-star">${symbolArt('GONG', 'gi-art')}
            <div class="gi-pays">
              <div class="gi-pay"><b>x5</b><span>${totalBets(SCAT_PAY[4])}</span></div>
              <div class="gi-pay"><b>x4</b><span>${totalBets(SCAT_PAY[3])}</span></div>
              <div class="gi-pay"><b>x3</b><span>${totalBets(SCAT_PAY[2])}</span></div>
            </div>
            <p>THE GONG IS THE SCATTER. 3, 4 OR 5 ANYWHERE ON THE REELS PAY ${SCAT_PAY[2]}x, ${SCAT_PAY[3]}x OR ${SCAT_PAY[4]}x THE TOTAL BET, ADDED TO ANY LINE WIN, AND START ${FREE_SPINS_AWARD} FREE GAMES.</p>
          </div>
        </div>

        <h3>THE SAMURAI</h3>
        <ul class="gi-rules">
          <li>THE SAMURAI IS WILD. HE SUBSTITUTES FOR EVERY SYMBOL ON THE LINES EXCEPT THE GONG.</li>
          <li>HE PAYS ON HIS OWN FROM 3 IN A ROW. A LINE PAYS WHICHEVER IS WORTH MORE, HIS OWN RUN OR THE RUN HE COMPLETES.</li>
          <li>5 SAMURAI ON A LINE PAY ${LINE_PAY.SAMURAI[4] / LINES}x THE TOTAL BET.</li>
        </ul>

        <h3>FREE GAMES</h3>
        <ul class="gi-rules">
          <li>3 OR MORE GONGS ANYWHERE AWARD ${FREE_SPINS_AWARD} FREE GAMES AT THE TRIGGERING BET.</li>
          <li>THE FREE GAMES SPIN ON THEIR OWN SET OF REELS.</li>
          <li>IN THE FREE GAMES A SAMURAI ANYWHERE ON A REEL TAKES THAT WHOLE REEL: EVERY POSITION ON IT IS WILD FOR EVERY LINE.</li>
          <li>GONGS PAY IN THE FREE GAMES TOO, AND 3 OR MORE ADD ${FREE_SPINS_AWARD} MORE FREE GAMES, WITHOUT LIMIT.</li>
          <li>SKIP ENDS THE WATCHING, NOT THE FREE GAMES. EVERY ONE OF THEM IS STILL PLAYED AND PAID.</li>
        </ul>

        <h3>BET LINES</h3>
        <div class="gi-lines">${lineCards}</div>

        <h3>RULES</h3>
        <ul class="gi-rules">
          <li>ALL ${LINES} LINES ARE ALWAYS ACTIVE.</li>
          <li>LINE WINS PAY LEFT TO RIGHT ON CONSECUTIVE REELS, STARTING FROM THE LEFTMOST REEL, FROM 3 IN A ROW.</li>
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
