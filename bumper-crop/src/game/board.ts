/**
 * The field: five columns of crates, a classic roll for the opening drop, and
 * then the avalanche show. Winning crops burst, whatever sat above them falls
 * into the gaps, and fresh produce drops in from the top. Pure presentation:
 * every grid it lands comes from the engine (demo) or the server (real money),
 * never from here.
 */
import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Fall, Grid, LineWin, SymbolId } from '../engine';
import { PAYLINES, REELS, ROWS, SYMBOL_ORDER } from '../engine';
import { asset } from './assets';
import { sound } from './audio';
import { ease, frames, sleep, tween } from './tween';

export const CELL = 170;
export const GAP = 10;
const STEP = CELL + GAP;
export const BOARD_W = REELS * CELL + (REELS - 1) * GAP;
export const BOARD_H = ROWS * CELL + (ROWS - 1) * GAP;

/** hidden feeder slots above the frame, enough to refill a whole column */
const ABOVE = ROWS;
/** hidden slot below the frame, so a rolling column never shows a gap */
const BELOW = 1;
const SLOTS = ABOVE + ROWS + BELOW;

/** px per ms at full roll: one cell every ~64ms */
const ROLL_SPEED = 2.8;
/** ms of roll before the first reel may stop */
const BASE_ROLL = 420;
/** extra roll per reel index, the classic left-to-right stagger */
const STOP_GAP = 200;

/** ms for one avalanche drop, whatever the distance fallen */
const FALL_MS = 260;

/** one colour per payline, reused across the 25 */
const LINE_COLORS = [
  0xffd23f, 0x5ec2ff, 0x8ad64b, 0xff6fb5, 0xff5a3c, 0x3fe0c0, 0xffa23c, 0xb894ff, 0x6ad8ff,
  0xffe98a, 0xc9f04b, 0xff8ae0, 0x4fd0ff, 0xffc46a, 0x9be86b, 0xff7a7a, 0x7ad4ff, 0xffdf5c,
  0xa0ff9c, 0xff9ecb, 0x66e2ff, 0xffb347, 0xd4ff6a, 0xff6ea0, 0x86f0ff,
];

export async function loadSymbolTextures(): Promise<Record<SymbolId, Texture>> {
  const out = {} as Record<SymbolId, Texture>;
  await Promise.all(
    SYMBOL_ORDER.map(async (id) => {
      const img = new Image();
      img.src = asset(`assets/art/symbols/${id}.webp`);
      await img.decode();
      out[id] = Texture.from(img);
    }),
  );
  return out;
}

interface Reel {
  container: Container;
  sprites: Sprite[];
  /** syms[slot]; slots 0..ABOVE-1 are hidden feeders above the frame */
  syms: SymbolId[];
  offset: number;
  speed: number;
  state: 'idle' | 'accel' | 'roll' | 'stopping' | 'settling';
  /** symbols still to feed in from the top while stopping (bottom first) */
  stopFeed: SymbolId[];
  /** shifts left until the fed column sits aligned in the frame */
  shiftsLeft: number;
  /** performance.now() timestamps for the stagger */
  startAt: number;
  stopAt: number;
  onSettled?: () => void;
}

function randomSym(): SymbolId {
  return SYMBOL_ORDER[Math.floor(Math.random() * SYMBOL_ORDER.length)];
}

export class Board {
  readonly root = new Container();
  private readonly reels: Reel[] = [];
  private readonly overlay = new Graphics();
  private readonly textures: Record<SymbolId, Texture>;
  /** the roll under way since the press, null between spins */
  private primed: { at: number; shown: Grid; hurried: boolean } | null = null;

  constructor(app: Application, textures: Record<SymbolId, Texture>) {
    this.textures = textures;
    app.stage.addChild(this.root);

    const mask = new Graphics().rect(-4, -4, BOARD_W + 8, BOARD_H + 8).fill(0xffffff);
    this.root.addChild(mask);
    this.root.mask = mask;

    for (let x = 0; x < REELS; x++) {
      const container = new Container();
      container.x = x * STEP;
      this.root.addChild(container);

      const sprites: Sprite[] = [];
      const syms: SymbolId[] = [];
      for (let slot = 0; slot < SLOTS; slot++) {
        const sym = randomSym();
        const sprite = new Sprite(textures[sym]);
        sprite.anchor.set(0.5);
        sprite.setSize(CELL * 0.94);
        sprite.x = CELL / 2;
        container.addChild(sprite);
        sprites.push(sprite);
        syms.push(sym);
      }

      const reel: Reel = {
        container,
        sprites,
        syms,
        offset: 0,
        speed: 0,
        state: 'idle',
        stopFeed: [],
        shiftsLeft: 0,
        startAt: 0,
        stopAt: 0,
      };
      this.layout(reel);
      this.reels.push(reel);
    }

    this.root.addChild(this.overlay);
    app.ticker.add(() => this.tick(app.ticker.deltaMS));
  }

  /** Put a grid on the frame with no animation (boot, replay restore). */
  land(grid: Grid): void {
    this.clearShow();
    for (let x = 0; x < REELS; x++) {
      const reel = this.reels[x];
      for (let y = 0; y < ROWS; y++) reel.syms[y + ABOVE] = grid[x][y];
      reel.offset = 0;
      this.layout(reel);
    }
  }

  /**
   * The press. Every reel starts rolling now with nowhere to stop yet: spin()
   * lands them on the answer when it comes, abort() brings the old grid back
   * if the answer is a refusal. Only a live spin calls this from main.ts; the
   * demo is primed by spin() itself and lands in the same breath.
   */
  prime(): void {
    if (this.primed) return;
    const now = performance.now();
    this.primed = { at: now, shown: this.shown(), hurried: false };
    this.clearShow();
    sound.spin();
    for (let x = 0; x < REELS; x++) {
      const reel = this.reels[x];
      reel.state = 'accel';
      reel.speed = 0;
      reel.startAt = now + x * 90;
      reel.stopAt = Infinity;
      reel.stopFeed = [];
      reel.shiftsLeft = ROWS + ABOVE;
      reel.onSettled = undefined;
    }
  }

  /** The server said no: the reels come down on the grid they were showing. */
  abort(): Promise<void> {
    const primed = this.primed;
    if (!primed) return Promise.resolve();
    return this.spin(primed.shown);
  }

  /** the grid on the frame, or the one the roll under way started from */
  private shown(): Grid {
    return this.reels.map((reel) => reel.syms.slice(ABOVE, ABOVE + ROWS));
  }

  /**
   * Land the reels on `grid`, left to right. A live spin has been rolling
   * since the press; the stop plan counts from there, so an answer inside the
   * normal roll changes nothing on screen and a late one only stretches it.
   */
  spin(grid: Grid): Promise<void> {
    if (!this.primed) this.prime();
    const { at, hurried } = this.primed!;
    this.primed = null;
    const now = performance.now();
    let settled = 0;
    return new Promise((resolve) => {
      for (let x = 0; x < REELS; x++) {
        const reel = this.reels[x];
        // a reel never stops before it has rolled; a hurried spin stops at once
        reel.stopAt = hurried ? now : Math.max(at + BASE_ROLL + x * STOP_GAP, now);
        // fed bottom row first, so the column arrives the right way up
        reel.stopFeed = [];
        for (let y = ROWS - 1; y >= 0; y--) reel.stopFeed.push(grid[x][y]);
        reel.onSettled = () => {
          settled++;
          if (settled === REELS) resolve();
        };
      }
    });
  }

  /** Player hit SPIN mid-roll: every reel stops on its next alignment. */
  hurry(): void {
    // pressed while the answer is still on its way: everything stops as it lands
    if (this.primed) {
      this.primed.hurried = true;
      return;
    }
    const now = performance.now();
    for (const reel of this.reels) {
      if (reel.state === 'accel' || reel.state === 'roll') reel.stopAt = now;
    }
  }

  get rolling(): boolean {
    return this.reels.some((r) => r.state !== 'idle');
  }

  private layout(reel: Reel): void {
    for (let slot = 0; slot < reel.sprites.length; slot++) {
      const sprite = reel.sprites[slot];
      sprite.texture = this.textures[reel.syms[slot]];
      sprite.y = (slot - ABOVE) * STEP + reel.offset + CELL / 2;
      sprite.alpha = 1;
      sprite.setSize(CELL * 0.94);
    }
  }

  private shift(reel: Reel): void {
    for (let slot = reel.syms.length - 1; slot > 0; slot--) reel.syms[slot] = reel.syms[slot - 1];
    if (reel.state === 'stopping' && reel.stopFeed.length > 0) {
      reel.syms[0] = reel.stopFeed.shift()!;
    } else {
      reel.syms[0] = randomSym();
    }
    if (reel.state === 'stopping') {
      reel.shiftsLeft--;
      if (reel.shiftsLeft <= 0) this.settle(reel);
    }
  }

  private settle(reel: Reel): void {
    reel.state = 'settling';
    reel.offset = 0;
    this.layout(reel);
    sound.reelStop(this.reels.indexOf(reel));
    // a short overshoot-and-return bounce sells the mechanical stop
    void frames(150, (t) => {
      const bounce = Math.sin(t * Math.PI) * 16;
      for (let slot = 0; slot < reel.sprites.length; slot++) {
        reel.sprites[slot].y = (slot - ABOVE) * STEP + bounce + CELL / 2;
      }
    }).then(() => {
      reel.offset = 0;
      this.layout(reel);
      reel.state = 'idle';
      reel.onSettled?.();
      reel.onSettled = undefined;
    });
  }

  private tick(dt: number): void {
    const now = performance.now();
    for (const reel of this.reels) {
      if (reel.state === 'idle' || reel.state === 'settling') continue;
      if (now < reel.startAt) continue;

      if (reel.state === 'accel') {
        reel.speed = Math.min(ROLL_SPEED, reel.speed + dt * 0.02);
        if (reel.speed >= ROLL_SPEED) reel.state = 'roll';
      }
      if (reel.state === 'roll' && now >= reel.stopAt) reel.state = 'stopping';

      reel.offset += reel.speed * dt;
      while (reel.offset >= STEP) {
        reel.offset -= STEP;
        this.shift(reel);
        if ((reel.state as string) === 'settling') break;
      }
      if ((reel.state as string) !== 'settling') this.layout(reel);
    }
  }

  // ------------------------------------------------------------- win show

  private clearShow(): void {
    this.overlay.clear();
    for (const reel of this.reels) this.layout(reel);
  }

  private sprite(x: number, y: number): Sprite {
    return this.reels[x].sprites[y + ABOVE];
  }

  private drawLine(win: LineWin): void {
    const color = LINE_COLORS[win.line % LINE_COLORS.length];
    const pts = PAYLINES[win.line].map((row, x) => ({
      x: x * STEP + CELL / 2,
      y: row * STEP + CELL / 2,
    }));
    this.overlay.moveTo(-4, pts[0].y);
    this.overlay.lineTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) this.overlay.lineTo(pts[i].x, pts[i].y);
    this.overlay.lineTo(BOARD_W + 4, pts[pts.length - 1].y);
    this.overlay.stroke({ width: 6, color, alpha: 0.85, cap: 'round', join: 'round' });
  }

  /**
   * Show one fall's wins: every winning line's ribbon at once and the winning
   * crops pulsing, with everything else dimmed. All 25 lines can pay at the
   * same time here, so they are shown together rather than one at a time.
   */
  private async showWins(fall: Fall, ms: number): Promise<void> {
    this.overlay.clear();
    for (const win of fall.lineWins) this.drawLine(win);

    const lit = new Set(fall.cleared.map(([x, y]) => `${x},${y}`));
    for (let x = 0; x < REELS; x++) {
      for (let y = 0; y < ROWS; y++) {
        this.sprite(x, y).alpha = lit.has(`${x},${y}`) ? 1 : 0.4;
      }
    }
    await tween(ms, (t) => {
      const k = 0.94 + Math.sin(t * Math.PI * 2) * 0.07;
      for (const [x, y] of fall.cleared) this.sprite(x, y).setSize(CELL * k);
    });
    for (const [x, y] of fall.cleared) this.sprite(x, y).setSize(CELL * 0.94);
  }

  /** The winning crops burst and vanish. */
  private async burst(cleared: [number, number][]): Promise<void> {
    sound.pop();
    await tween(170, (t) => {
      const k = 0.94 + t * 0.5;
      for (const [x, y] of cleared) {
        const s = this.sprite(x, y);
        s.setSize(CELL * k);
        s.alpha = 1 - t;
      }
    });
    for (const [x, y] of cleared) this.sprite(x, y).alpha = 0;
  }

  /**
   * Everything above a burst cell falls into the gap and fresh produce drops
   * in from the top, landing on `next`. Each survivor falls by its own
   * distance, so nothing that was already resting appears to jump.
   */
  private async drop(cleared: [number, number][], next: Grid): Promise<void> {
    const clearedBy: boolean[][] = [];
    for (let x = 0; x < REELS; x++) clearedBy.push(new Array(ROWS).fill(false));
    for (const [x, y] of cleared) clearedBy[x][y] = true;

    interface Move {
      sprite: Sprite;
      from: number;
      to: number;
    }
    const moves: Move[] = [];

    for (let x = 0; x < REELS; x++) {
      const reel = this.reels[x];
      const gone = clearedBy[x].filter(Boolean).length;
      if (gone === 0) continue;

      // survivors keep their order and settle on the bottom rows
      const survivors: number[] = [];
      for (let y = 0; y < ROWS; y++) if (!clearedBy[x][y]) survivors.push(y);
      survivors.forEach((oldRow, i) => {
        const target = gone + i;
        if (target === oldRow) return;
        moves.push({
          sprite: this.sprite(x, oldRow),
          from: oldRow * STEP + CELL / 2,
          to: target * STEP + CELL / 2,
        });
      });

      // the new produce falls in from just above the frame, in grid order
      for (let j = 0; j < gone; j++) {
        const sprite = reel.sprites[j];
        sprite.texture = this.textures[next[x][j]];
        sprite.alpha = 1;
        sprite.setSize(CELL * 0.94);
        moves.push({
          sprite,
          from: (j - gone) * STEP + CELL / 2,
          to: j * STEP + CELL / 2,
        });
      }
    }

    sound.drop();
    await frames(FALL_MS, (t) => {
      const k = ease.outBack(t);
      for (const m of moves) m.sprite.y = m.from + (m.to - m.from) * k;
    });

    // commit: the frame now genuinely holds `next`
    for (let x = 0; x < REELS; x++) {
      const reel = this.reels[x];
      for (let y = 0; y < ROWS; y++) reel.syms[y + ABOVE] = next[x][y];
      for (let s = 0; s < ABOVE; s++) reel.syms[s] = randomSym();
      reel.offset = 0;
      this.layout(reel);
    }
  }

  /**
   * Play one fall's whole show: the wins, the bonus if the tractors opened
   * one, then the burst and the drop onto the next grid. `next` is undefined
   * on the fall that ends the round, where nothing bursts and the grid simply
   * stays put.
   */
  async presentFall(
    fall: Fall,
    next: Grid | undefined,
    chain: number,
    onBonus?: () => Promise<void>,
  ): Promise<void> {
    if (fall.lineWins.length === 0 && !fall.scatterWin) return;

    sound.win(chain);
    await this.showWins(fall, chain === 0 ? 750 : 620);
    if (fall.scatterWin) {
      sound.scatter();
      await sleep(180);
      if (onBonus) await onBonus();
    }
    if (next) {
      await this.burst(fall.cleared);
      await this.drop(fall.cleared, next);
    } else {
      this.clearShow();
    }
  }
}
