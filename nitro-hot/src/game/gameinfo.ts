/**
 * The GAME INFO screen: paytable at the CURRENT bet, the five lines, and the
 * rules. A DOM overlay, rebuilt on every open so the pays always match the
 * stake. House copy style: no em or en dashes in anything a player reads.
 */
import { DOUBLING_FRUITS, LINE_PAY, LINES, PAYLINES, type SymbolId } from '../engine';
import { symbolArt } from './assets';

/** Paytable display order: premium first. */
const PAY_ORDER: SymbolId[] = ['SEVEN', 'STAR', 'BAR', 'PLUM', 'ORANGE', 'LEMON', 'CHERRY', 'X'];

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
      const doubles = DOUBLING_FRUITS.includes(sym);
      const cells =
        `<div class="gi-pay"><b>x3</b><span>${money(LINE_PAY[sym])}</span></div>` +
        (doubles
          ? `<div class="gi-pay"><b>FULL</b><span>${money(LINE_PAY[sym] * 2)}</span></div>`
          : '');
      return `<div class="gi-sym">${symbolArt(sym, 'gi-art')}<div class="gi-pays">${cells}</div></div>`;
    }).join('');

    const lineCards = PAYLINES.map((rows, li) => {
      const dots = Array.from({ length: 9 }, (_, i) => {
        const x = i % 3;
        const y = Math.floor(i / 3);
        return `<i${rows[x] === y ? ' class="on"' : ''}></i>`;
      }).join('');
      return `<div class="gi-line"><div class="gi-grid">${dots}</div><span>LINE ${li + 1}</span></div>`;
    }).join('');

    this.el.innerHTML = `
      <div class="gi-inner">
        <button id="gi-close" type="button" aria-label="Close">×</button>
        <h2>GAME INFO - NITRO HOT</h2>

        <h3>PAYTABLE, AT THE CURRENT BET OF ${bet.toFixed(2)}</h3>
        <div class="gi-paytable">${payRows}
          <div class="gi-sym gi-note">
            <p>PLUMS, ORANGES, LEMONS AND CHERRIES: FILL THE WHOLE SCREEN WITH ONE OF THEM AND EVERY LINE WIN IS DOUBLED. THE FULL PAY ABOVE SHOWS ONE DOUBLED LINE.</p>
          </div>
        </div>

        <h3>BET LINES</h3>
        <div class="gi-lines">${lineCards}</div>

        <h3>RULES</h3>
        <ul class="gi-rules">
          <li>ALL 5 LINES ARE ALWAYS ACTIVE.</li>
          <li>ONLY 3 OF THE SAME SYMBOL ON A BET LINE PAYS. THERE ARE NO WILDS AND NO SCATTER.</li>
          <li>LINE PAYS ARE SHOWN AT THE CURRENT TOTAL BET, WHICH COVERS ALL 5 LINES.</li>
          <li>A FULL SCREEN OF PLUMS, ORANGES, LEMONS OR CHERRIES DOUBLES ALL LINE WINS.</li>
          <li>MAX WIN 202X THE TOTAL BET.</li>
          <li>THE THEORETICAL RETURN TO PLAYER (RTP) IS 95.66%.</li>
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
