/**
 * The GAME INFO screen: paytable at the CURRENT bet, the ten lines, and the
 * rules. A DOM overlay, rebuilt on every open so the pays always match the
 * stake. House copy style: no em or en dashes in anything a player reads.
 */
import {
  FREE_SPINS_AWARD,
  GAME_RTP,
  LINE_PAY,
  LINES,
  PAYLINES,
  SCAT_PAY,
  type PaySymbol,
} from '../engine';
import { symbolArt } from './assets';

/** Paytable display order: the five picture symbols, then the cards. */
const PAY_ORDER: PaySymbol[] = ['PHARAOH', 'FALCON', 'ANKH', 'LOTUS', 'COBRA', 'ACE', 'KING', 'QUEEN', 'JACK', 'TEN'];

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
      const top = sym === 'PHARAOH' ? ' gi-top' : '';
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
        <h2>GAME INFO - HOUSE OF RA</h2>

        <h3>PAYTABLE, AT THE CURRENT BET OF ${bet.toFixed(2)}</h3>
        <div class="gi-paytable">${payRows}
          <div class="gi-sym gi-star">${symbolArt('SUNDISC', 'gi-art')}
            <div class="gi-pays">
              <div class="gi-pay"><b>x5</b><span>${totalBets(SCAT_PAY[4])}</span></div>
              <div class="gi-pay"><b>x4</b><span>${totalBets(SCAT_PAY[3])}</span></div>
              <div class="gi-pay"><b>x3</b><span>${totalBets(SCAT_PAY[2])}</span></div>
            </div>
            <p>THE SUN DISC IS WILD AND THE SCATTER. 3, 4 OR 5 ANYWHERE ON THE REELS PAY ${SCAT_PAY[2]}x, ${SCAT_PAY[3]}x OR ${SCAT_PAY[4]}x THE TOTAL BET AND START ${FREE_SPINS_AWARD} FREE GAMES.</p>
          </div>
        </div>

        <h3>THE SUN DISC</h3>
        <ul class="gi-rules">
          <li>IN THE MAIN GAME THE SUN DISC SUBSTITUTES FOR EVERY SYMBOL ON THE LINES.</li>
          <li>IT HAS NO LINE PAY OF ITS OWN, SO A LINE OF SUN DISCS ALONE PAYS NOTHING.</li>
          <li>3, 4 OR 5 SUN DISCS ANYWHERE PAY AS A SCATTER, IN THE MAIN GAME AND IN THE FREE GAMES, ADDED TO ANY OTHER WIN.</li>
        </ul>

        <h3>FREE GAMES</h3>
        <ul class="gi-rules">
          <li>3 OR MORE SUN DISCS ANYWHERE AWARD ${FREE_SPINS_AWARD} FREE GAMES AT THE TRIGGERING BET.</li>
          <li>FREE GAMES ARE PLAYED ON THEIR OWN SET OF REELS.</li>
          <li>IN THE FREE GAMES A SYMBOL WINS WHEN IT SHOWS ON CONSECUTIVE REELS FROM THE LEFTMOST REEL, IN ANY ROW OF EACH REEL.</li>
          <li>ONLY THE BEST WIN ON THE SCREEN PAYS. ITS SYMBOL EXPANDS TO COVER THOSE REELS AND PAYS ON ALL ${LINES} LINES, SO EVERY FREE GAMES WIN IS ${LINES} TIMES ITS LINE PAY IN THE PAYTABLE ABOVE. 5 PHARAOHS PAY ${LINE_PAY.PHARAOH[4]}x THE TOTAL BET.</li>
          <li>THE SUN DISC IS NOT WILD IN THE FREE GAMES. IT STILL PAYS AS THE SCATTER, AND 3 OR MORE AWARD ${FREE_SPINS_AWARD} MORE FREE GAMES, WITHOUT LIMIT.</li>
          <li>SKIP ENDS THE WATCHING, NOT THE FREE GAMES. EVERY ONE OF THEM IS STILL PLAYED AND PAID.</li>
        </ul>

        <h3>BET LINES</h3>
        <div class="gi-lines">${lineCards}</div>

        <h3>RULES</h3>
        <ul class="gi-rules">
          <li>ALL ${LINES} LINES ARE ALWAYS ACTIVE.</li>
          <li>LINE WINS PAY LEFT TO RIGHT ON CONSECUTIVE REELS, STARTING FROM THE LEFTMOST REEL.</li>
          <li>ONLY THE LONGEST MATCH ON EACH LINE PAYS. WINS ON DIFFERENT LINES ARE ADDED.</li>
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
