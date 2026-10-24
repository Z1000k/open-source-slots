/**
 * The GAME INFO screen: paytable at the CURRENT bet, the nine lines, and the
 * rules. A DOM overlay, rebuilt on every open so the pays always match the
 * stake. House copy style: no em or en dashes in anything a player reads.
 */
import { FREE_SPINS_AWARD, LINE_PAY, LINES, PAYLINES, SCAT_PAY, type PaySymbol } from '../engine';
import { symbolArt } from './assets';

/** Paytable display order: premium first, the wild banana at the front. */
const PAY_ORDER: PaySymbol[] = [
  'BANANA',
  'STRAWBERRY',
  'MELON',
  'PINEAPPLE',
  'MANGO',
  'COCONUT',
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

    const payRows = PAY_ORDER.map((sym) => {
      const pays = LINE_PAY[sym];
      const cells = [4, 3, 2, 1]
        .map((i) =>
          pays[i] > 0
            ? `<div class="gi-pay"><b>x${i + 1}</b><span>${money(pays[i])}</span></div>`
            : '',
        )
        .join('');
      const wild = sym === 'BANANA' ? ' gi-wild' : '';
      return `<div class="gi-sym${wild}">${symbolArt(sym, 'gi-art')}<div class="gi-pays">${cells}</div></div>`;
    }).join('');

    const scatCells = [4, 3, 2, 1]
      .map((i) =>
        SCAT_PAY[i] > 0
          ? `<div class="gi-pay"><b>x${i + 1}</b><span>${(SCAT_PAY[i] * bet).toFixed(2)}</span></div>`
          : '',
      )
      .join('');

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
        <h2>GAME INFO - TROPIC ESCAPE</h2>

        <h3>PAYTABLE, AT THE CURRENT BET OF ${bet.toFixed(2)}</h3>
        <div class="gi-paytable">${payRows}
          <div class="gi-sym gi-star">${symbolArt('SUITCASE', 'gi-art')}<div class="gi-pays">${scatCells}</div>
            <p>THE SUITCASE IS THE SCATTER. IT PAYS ANYWHERE ON THE REELS FROM 2, ITS PRIZE IS MULTIPLIED BY THE TOTAL BET, AND 3 OR MORE START THE FREE GAMES.</p>
          </div>
        </div>

        <h3>THE BANANA IS WILD</h3>
        <ul class="gi-rules">
          <li>THE BANANA SUBSTITUTES FOR EVERY SYMBOL EXCEPT THE SUITCASE.</li>
          <li>A WIN THE BANANA HELPED COMPLETE PAYS DOUBLE.</li>
          <li>BANANAS ALSO PAY ON THEIR OWN AS THE TOP SYMBOL, AND THAT PRIZE IS NOT DOUBLED.</li>
          <li>EACH LINE PAYS WHICHEVER OF THE TWO IS WORTH MORE, NEVER BOTH.</li>
        </ul>

        <h3>FREE GAMES</h3>
        <ul class="gi-rules">
          <li>3 OR MORE SUITCASES ANYWHERE AWARD ${FREE_SPINS_AWARD} FREE GAMES AT THE TRIGGERING BET.</li>
          <li>FREE GAMES ARE PLAYED ON THEIR OWN REELS, WHICH CARRY MORE BANANAS AND MORE SUITCASES.</li>
          <li>3 OR MORE SUITCASES DURING FREE GAMES AWARD ${FREE_SPINS_AWARD} MORE, WITHOUT LIMIT.</li>
          <li>SKIP ENDS THE WATCHING, NOT THE FREE GAMES. EVERY ONE OF THEM IS STILL PLAYED AND PAID.</li>
        </ul>

        <h3>BET LINES</h3>
        <div class="gi-lines">${lineCards}</div>

        <h3>RULES</h3>
        <ul class="gi-rules">
          <li>ALL 9 LINES ARE ALWAYS ACTIVE.</li>
          <li>LINE WINS PAY LEFT TO RIGHT ON CONSECUTIVE REELS, STARTING FROM THE LEFTMOST REEL.</li>
          <li>ONLY THE LONGEST MATCH ON EACH LINE PAYS. WINS ON DIFFERENT LINES ARE ADDED.</li>
          <li>LINE PAYS ARE SHOWN AT THE CURRENT TOTAL BET, WHICH COVERS ALL 9 LINES.</li>
          <li>SCATTER PAYS ARE ADDED TO LINE WINS.</li>
          <li>THE THEORETICAL RETURN TO PLAYER (RTP) IS 95.36%.</li>
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
