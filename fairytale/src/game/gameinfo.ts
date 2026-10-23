/**
 * The GAME INFO screen: paytable at the CURRENT bet, the free games cast
 * table, the ten lines, and the rules. A DOM overlay, rebuilt on every open
 * so the pays always match the stake. House copy style: no em or en dashes
 * in anything a player reads.
 */
import {
  EXPAND_POOL,
  EXPAND_REELS,
  FREE_SPINS_AWARD,
  GAME_RTP,
  LINE_PAY,
  LINES,
  PAYLINES,
  SCAT_PAY,
  SYMBOL_ORDER,
  type PaySymbol,
} from '../engine';
import { symbolArt } from './assets';

/** Paytable display order: the enchantress, the five pictures, then the cards. */
const PAY_ORDER: PaySymbol[] = [
  'ENCHANTRESS',
  'UNICORN',
  'GRIFFIN',
  'CASTLE',
  'SLIPPER',
  'MIRROR',
  'ACE',
  'KING',
  'QUEEN',
  'JACK',
  'TEN',
  'NINE',
];

/** The symbols the free games can cast, in paytable order, with how often each is drawn. */
const CASTS = SYMBOL_ORDER.filter((s) => EXPAND_POOL.includes(s)).map((s) => ({
  sym: s,
  reels: EXPAND_REELS[s],
  chances: EXPAND_POOL.filter((p) => p === s).length,
}));

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
      const top = sym === 'ENCHANTRESS' ? ' gi-top' : '';
      return `<div class="gi-sym${top}">${symbolArt(sym, 'gi-art')}<div class="gi-pays">${cells}</div></div>`;
    }).join('');

    const castRows = CASTS.map(
      ({ sym, reels, chances }) =>
        `<div class="gi-cast">${symbolArt(sym, 'gi-art')}<span>${reels} REELS</span><b>${chances} IN ${EXPAND_POOL.length}</b></div>`,
    ).join('');

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
        <h2>GAME INFO - FAIRYTALE</h2>

        <h3>PAYTABLE, AT THE CURRENT BET OF ${bet.toFixed(2)}</h3>
        <div class="gi-paytable">${payRows}
          <div class="gi-sym gi-star">${symbolArt('LANTERN', 'gi-art')}
            <div class="gi-pays">
              <div class="gi-pay"><b>x5</b><span>${totalBets(SCAT_PAY[4])}</span></div>
              <div class="gi-pay"><b>x4</b><span>${totalBets(SCAT_PAY[3])}</span></div>
              <div class="gi-pay"><b>x3</b><span>${totalBets(SCAT_PAY[2])}</span></div>
              <div class="gi-pay"><b>x2</b><span>${totalBets(SCAT_PAY[1])}</span></div>
            </div>
            <p>THE LANTERN IS THE SCATTER. 2, 3, 4 OR 5 ANYWHERE ON THE REELS PAY ${SCAT_PAY[1]}x, ${SCAT_PAY[2]}x, ${SCAT_PAY[3]}x OR ${SCAT_PAY[4]}x THE TOTAL BET, ADDED TO ANY LINE WIN, AND 3 OR MORE START ${FREE_SPINS_AWARD} FREE GAMES.</p>
          </div>
        </div>

        <h3>THE ENCHANTRESS</h3>
        <ul class="gi-rules">
          <li>THE ENCHANTRESS IS WILD. SHE SUBSTITUTES FOR EVERY SYMBOL ON THE LINES EXCEPT THE LANTERN.</li>
          <li>SHE PAYS ON HER OWN FROM 2 IN A ROW. A LINE PAYS WHICHEVER IS WORTH MORE, HER OWN RUN OR THE RUN SHE COMPLETES.</li>
          <li>5 ENCHANTRESSES ON A LINE PAY ${LINE_PAY.ENCHANTRESS[4] / LINES}x THE TOTAL BET.</li>
        </ul>

        <h3>FREE GAMES</h3>
        <ul class="gi-rules">
          <li>3 OR MORE LANTERNS ANYWHERE AWARD ${FREE_SPINS_AWARD} FREE GAMES AT THE TRIGGERING BET.</li>
          <li>BEFORE EVERY FREE GAME ONE SYMBOL IS DRAWN AND CAST OVER THE FIRST REELS, FILLING THEM FROM TOP TO BOTTOM. THE TABLE BELOW SHOWS HOW MANY REELS EACH SYMBOL COVERS AND HOW OFTEN IT IS DRAWN.</li>
          <li>ONLY THE REELS AFTER THE CAST SPIN, ON THEIR OWN SET OF FREE GAMES REELS.</li>
          <li>THE CAST SYMBOL PAYS ON ALL ${LINES} LINES, AND AN ENCHANTRESS ON THE SPINNING REELS CARRIES ITS RUN FURTHER. EVERY FREE GAME PAYS.</li>
          <li>A CAST LANTERN LIGHTS THE MIDDLE ROW OF THE FIRST 2 REELS. THE CELLS ABOVE AND BELOW IT STAY EMPTY, PAY NOTHING AND STOP ANY LINE THAT STARTS ON THEM. THE 2 LANTERNS PAY ${SCAT_PAY[1]}x THE TOTAL BET AS SCATTERS, AND ONE MORE ANYWHERE ADDS ${FREE_SPINS_AWARD} FREE GAMES.</li>
          <li>3 OR MORE LANTERNS DURING THE FREE GAMES ADD ${FREE_SPINS_AWARD} MORE FREE GAMES, WITHOUT LIMIT.</li>
          <li>SKIP ENDS THE WATCHING, NOT THE FREE GAMES. EVERY ONE OF THEM IS STILL PLAYED AND PAID.</li>
        </ul>
        <div class="gi-spell">${castRows}</div>

        <h3>BET LINES</h3>
        <div class="gi-lines">${lineCards}</div>

        <h3>RULES</h3>
        <ul class="gi-rules">
          <li>ALL ${LINES} LINES ARE ALWAYS ACTIVE.</li>
          <li>LINE WINS PAY LEFT TO RIGHT ON CONSECUTIVE REELS, STARTING FROM THE LEFTMOST REEL.</li>
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
