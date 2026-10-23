/**
 * The GAME INFO screen: paytable at the CURRENT bet, the 25 lines, and the
 * rules. A DOM overlay, rebuilt on every open so the pays always match the
 * stake. House copy style: no em or en dashes in anything a player reads.
 */
import { LINE_PAY, LINES, PAYLINES, SCAT_PAY, type PaySymbol } from '../engine';
import { symbolArt } from './assets';

/** Paytable display order: premium first. */
const PAY_ORDER: PaySymbol[] = [
  'SCARECROW',
  'COW',
  'RAM',
  'PIG',
  'RABBIT',
  'ROOSTER',
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
      return `<div class="gi-sym">${symbolArt(sym, 'gi-art')}<div class="gi-pays">${cells}</div></div>`;
    }).join('');

    const scatCells = [4, 3, 2]
      .map((i) => `<div class="gi-pay"><b>x${i + 1}</b><span>${(SCAT_PAY[i] * bet).toFixed(2)}</span></div>`)
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
        <h2>GAME INFO - BUMPER CROP</h2>

        <h3>PAYTABLE, AT THE CURRENT BET OF ${bet.toFixed(2)}</h3>
        <div class="gi-paytable">${payRows}
          <div class="gi-sym gi-star">${symbolArt('TRACTOR', 'gi-art')}<div class="gi-pays">${scatCells}</div>
            <p>THE TRACTOR IS SCATTER. IT PAYS ANYWHERE ON THE FIELD, AND 3 OR MORE ALSO OPEN THE BARN LADDER.</p>
          </div>
        </div>

        <h3>AVALANCHE</h3>
        <ul class="gi-rules">
          <li>EVERY WINNING SYMBOL IS HARVESTED AND LEAVES THE FIELD.</li>
          <li>WHATEVER SAT ABOVE FALLS INTO THE GAP AND FRESH PRODUCE DROPS IN FROM THE TOP.</li>
          <li>THE NEW FIELD IS PAID AGAIN, AND KEEPS GOING FOR AS LONG AS IT PAYS.</li>
          <li>EVERY FALL PAYS AT THE SAME BET, AND ALL FALLS ARE ADDED TOGETHER.</li>
          <li>THE TRACTORS CAN LAND ON ANY FALL, SO ONE SPIN CAN OPEN THE LADDER MORE THAN ONCE.</li>
        </ul>

        <h3>THE BARN LADDER</h3>
        <ul class="gi-rules">
          <li>3 OR MORE TRACTORS ANYWHERE OPEN THE LADDER, AND THE TRACTORS PAY AS WELL.</li>
          <li>THE LADDER HAS 5 FLOORS OF CRATES, TURNED OVER ONE AT A TIME FROM THE BOTTOM FLOOR.</li>
          <li>A PLAIN CRATE ADDS ITS PRIZE AND YOU KEEP TURNING ON THE SAME FLOOR.</li>
          <li>A GOLDEN CRATE ADDS ITS PRIZE AND LIFTS YOU A FLOOR, WHERE THE PRIZES ARE BIGGER.</li>
          <li>A GOLDEN MULTIPLIER CRATE ADDS 1 TO THE MULTIPLIER AND LIFTS YOU A FLOOR.</li>
          <li>THE SPILLED BUCKET ENDS THE LADDER. THE BOTTOM FLOOR HAS NO BUCKET, SO EVERY LADDER REACHES FLOOR 2.</li>
          <li>EVERYTHING COLLECTED IS PAID AT THE END, MULTIPLIED BY THE MULTIPLIER.</li>
          <li>LADDER PRIZES ARE SHOWN AT THE CURRENT TOTAL BET.</li>
        </ul>

        <h3>BET LINES</h3>
        <div class="gi-lines">${lineCards}</div>

        <h3>RULES</h3>
        <ul class="gi-rules">
          <li>ALL 25 LINES ARE ALWAYS ACTIVE.</li>
          <li>LINE WINS PAY LEFT TO RIGHT ON CONSECUTIVE REELS, STARTING FROM THE LEFTMOST REEL.</li>
          <li>THE SCARECROW IS WILD AND SUBSTITUTES FOR EVERY SYMBOL EXCEPT THE TRACTOR.</li>
          <li>THE SCARECROW ALSO PAYS ON ITS OWN, AND EACH LINE PAYS THE BETTER OF THE TWO, NEVER BOTH.</li>
          <li>ONLY THE LONGEST MATCH ON EACH LINE PAYS. WINS ON DIFFERENT LINES ARE ADDED.</li>
          <li>LINE PAYS ARE SHOWN AT THE CURRENT TOTAL BET, WHICH COVERS ALL 25 LINES.</li>
          <li>SCATTER PAYS ARE ADDED TO LINE WINS.</li>
          <li>THE THEORETICAL RETURN TO PLAYER (RTP) IS 95.55%.</li>
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
