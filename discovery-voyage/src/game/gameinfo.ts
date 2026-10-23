/**
 * The GAME INFO screen: paytable at the CURRENT bet, the ten lines, and the
 * rules. A DOM overlay, rebuilt on every open so the pays always match the
 * stake. House copy style: no em or en dashes in anything a player reads.
 */
import {
  ACTIVE_REELS,
  FREE_SPINS_AWARD,
  LINE_PAY,
  LINES,
  PAYLINES,
  type PaySymbol,
} from '../engine';
import { symbolArt } from './assets';

/** Paytable display order: premium first, the wild captain at the front. */
const PAY_ORDER: PaySymbol[] = ['CAPTAIN', 'CROWN', 'CHEST', 'COMPASS', 'ACE', 'KING', 'QUEEN', 'JACK', 'TEN'];

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

    const payRows = PAY_ORDER.map((sym) => {
      const pays = LINE_PAY[sym];
      const cells = [4, 3, 2, 1]
        .map((i) =>
          pays[i] > 0
            ? `<div class="gi-pay"><b>x${i + 1}</b><span>${money(pays[i])}</span></div>`
            : '',
        )
        .join('');
      const wild = sym === 'CAPTAIN' ? ' gi-wild' : '';
      return `<div class="gi-sym${wild}">${symbolArt(sym, 'gi-art')}<div class="gi-pays">${cells}</div></div>`;
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
        <h2>GAME INFO - DISCOVERY VOYAGE</h2>

        <h3>PAYTABLE, AT THE CURRENT BET OF ${bet.toFixed(2)}</h3>
        <div class="gi-paytable">${payRows}
          <div class="gi-sym gi-star">${symbolArt('GALLEON', 'gi-art')}
            <p>THE GALLEON IS THE SCATTER. IT HAS NO PAY OF ITS OWN: 3 OF THEM ANYWHERE ON THE REELS START THE FREE GAMES. GALLEONS LAND ON REELS 1, 3 AND 5.</p>
          </div>
        </div>

        <h3>THE CAPTAIN IS WILD</h3>
        <ul class="gi-rules">
          <li>THE CAPTAIN SUBSTITUTES FOR EVERY SYMBOL EXCEPT THE GALLEON.</li>
          <li>CAPTAINS ALSO PAY ON THEIR OWN AS THE TOP SYMBOL, FROM 2 IN A ROW.</li>
          <li>EACH LINE PAYS WHICHEVER IS WORTH MORE, THE CAPTAINS ON THEIR OWN OR THE RUN THEY COMPLETE, NEVER BOTH.</li>
        </ul>

        <h3>FREE GAMES</h3>
        <ul class="gi-rules">
          <li>3 GALLEONS ANYWHERE AWARD ${FREE_SPINS_AWARD} FREE GAMES AT THE TRIGGERING BET.</li>
          <li>DURING THE FREE GAMES THE GALLEON IS WILD AS WELL. IT SUBSTITUTES FOR EVERY SYMBOL, AND A RUN OF GALLEONS AND CAPTAINS PAYS AS CAPTAINS.</li>
          <li>FREE GAMES ARE PLAYED ON THEIR OWN SET OF REELS.</li>
          <li>3 GALLEONS DURING THE FREE GAMES AWARD ${FREE_SPINS_AWARD} MORE, WITHOUT LIMIT.</li>
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
          <li>THE THEORETICAL RETURN TO PLAYER (RTP) IS ${ACTIVE_REELS.rtp.toFixed(2)}%.</li>
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
