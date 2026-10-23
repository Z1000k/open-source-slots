/**
 * The reel machine: three columns of neon fruit, a classic roll with
 * staggered stops, and the win show (payline ribbons, pulsing symbols,
 * the full-screen doubler flash). Pure presentation: every grid it lands
 * comes from the engine (demo) or the server (real), never from here.
 */
import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Grid, LineWin, SpinResult, SymbolId } from '../engine';
import { LINES, PAYLINES, REELS, ROWS, SYMBOL_ORDER } from '../engine';
import { asset } from './assets';
import { sound } from './audio';
import { frames, sleep, tween } from './tween';

export const CELL = 170;
export const GAP = 10;
const STEP = CELL + GAP;
export const BOARD_W = REELS * CELL + (REELS - 1) * GAP;
export const BOARD_H = ROWS * CELL + (ROWS - 1) * GAP;

/** px per ms at full roll: one cell every ~64ms */
const ROLL_SPEED = 2.8;
/** ms of roll before the first reel may stop */
const BASE_ROLL = 420;
/** extra roll per reel index, the classic left-to-right stagger */
const STOP_GAP = 200;

const LINE_COLORS = [0xffb300, 0x3fa9f5, 0x7ac943, 0xff5abc, 0xff4b3c];

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
  /** syms[slot], slot 0 is the hidden feeder above the frame */
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
      for (let slot = 0; slot < ROWS + 2; slot++) {
        const sym = SYMBOL_ORDER[Math.floor(Math.random() * SYMBOL_ORDER.length)];
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
    for (let x = 0; x < REELS; x++) {
      const reel = this.reels[x];
      for (let y = 0; y < ROWS; y++) reel.syms[y + 1] = grid[x][y];
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
      reel.shiftsLeft = ROWS + 1;
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
    return this.reels.map((reel) => reel.syms.slice(1, ROWS + 1));
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
        reel.stopFeed = [grid[x][2], grid[x][1], grid[x][0]];
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
      sprite.y = (slot - 1) * STEP + reel.offset + CELL / 2;
    }
  }

  private shift(reel: Reel): void {
    for (let slot = reel.syms.length - 1; slot > 0; slot--) reel.syms[slot] = reel.syms[slot - 1];
    if (reel.state === 'stopping' && reel.stopFeed.length > 0) {
      reel.syms[0] = reel.stopFeed.shift()!;
    } else {
      reel.syms[0] = SYMBOL_ORDER[Math.floor(Math.random() * SYMBOL_ORDER.length)];
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
        reel.sprites[slot].y = (slot - 1) * STEP + bounce + CELL / 2;
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
    for (const reel of this.reels) {
      for (const sprite of reel.sprites) {
        sprite.alpha = 1;
        sprite.setSize(CELL * 0.94);
      }
    }
  }

  private sprite(x: number, y: number): Sprite {
    return this.reels[x].sprites[y + 1];
  }

  private drawLine(win: LineWin): void {
    const color = LINE_COLORS[win.line];
    const pts = PAYLINES[win.line].map((row, x) => ({
      x: x * STEP + CELL / 2,
      y: row * STEP + CELL / 2,
    }));
    this.overlay.moveTo(-4, pts[0].y);
    this.overlay.lineTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) this.overlay.lineTo(pts[i].x, pts[i].y);
    this.overlay.lineTo(BOARD_W + 4, pts[pts.length - 1].y);
    this.overlay.stroke({ width: 7, color, alpha: 0.9, cap: 'round', join: 'round' });
  }

  /** Pulse one win's symbols (and ribbon, for line wins) for `ms`. */
  private async pulse(cells: [number, number][], ms: number, line?: LineWin): Promise<void> {
    this.overlay.clear();
    if (line) this.drawLine(line);
    const involved = new Set(cells.map(([x, y]) => `${x},${y}`));
    for (let x = 0; x < REELS; x++) {
      for (let y = 0; y < ROWS; y++) {
        this.sprite(x, y).alpha = involved.has(`${x},${y}`) ? 1 : 0.45;
      }
    }
    await tween(ms, (t) => {
      const k = 0.94 + Math.sin(t * Math.PI * 2) * 0.06;
      for (const [x, y] of cells) this.sprite(x, y).setSize(CELL * k);
    });
    for (const [x, y] of cells) this.sprite(x, y).setSize(CELL * 0.94);
  }

  /**
   * The win show: a full-screen fanfare first when all five lines hit, then
   * every winning line's ribbon and symbols in turn. Resolves when the show
   * has played through.
   */
  async presentWins(spin: SpinResult): Promise<void> {
    if (spin.lineWins.length === 0) return;

    if (spin.lineWins.length === LINES) {
      const all: [number, number][] = [];
      for (let x = 0; x < REELS; x++) for (let y = 0; y < ROWS; y++) all.push([x, y]);
      sound.fullScreen();
      await this.pulse(all, 950);
    }
    for (const win of spin.lineWins) {
      sound.line(win.line);
      await this.pulse(win.positions, 850, win);
      await sleep(120);
    }
    this.clearShow();
  }
}
