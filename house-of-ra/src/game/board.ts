/**
 * The reel machine: five columns of tiles, a classic roll with staggered
 * stops, and the win shows. In the main game: payline ribbons, pulsing
 * symbols, and the SUN DISCs ringed as they pay. In the free games the best
 * way on the screen takes over its reels one at a time, and all ten lines
 * light together over it. Every SUN DISC that lands answers from its reel,
 * and once two are showing, each reel still to land rolls on a little
 * longer, lit, in case a third comes. Pure presentation: every grid it lands
 * comes from the engine (demo) or the server (real), never from here.
 */
import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Grid, LineWin, ScatterHit, SpinResult, SymbolId, WayWin } from '../engine';
import { PAYLINES, REELS, ROWS, SCATTER, SYMBOL_ORDER } from '../engine';
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
/**
 * A free games session runs 10 spins, 10.7 on average once retriggers
 * count, so those spins roll a little quicker than the paid ones, without
 * rushing the expanding wins that are the point of them.
 */
const FAST_ROLL = 260;
const FAST_STOP_GAP = 100;
/**
 * Two SUN DISCs showing: each reel still to land rolls on this much longer
 * (ms), lit, while the drone swells. The grid was decided before the reels
 * moved; this only stretches the wait for it.
 */
const TEASE = 620;
const FAST_TEASE = 340;

/** The sun's gold, for the rings, the expanded block and the tease light. */
const SUN = 0xf4c542;

/** One colour per bet line: sun gold, lapis, turquoise, carnelian, linen and their kin. */
const LINE_COLORS = [
  0xf4c542, 0x4a7cf0, 0x36d6c3, 0xe0563a, 0xf2e2bc, 0xa57cff, 0x7fe08a, 0xff9f45, 0x5fc8ff, 0xff6fa8,
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
  /** two SUN DISCs land to its left this spin: it rolls on longer, lit */
  teased: boolean;
  onSettled?: () => void;
}

export class Board {
  readonly root = new Container();
  private readonly reels: Reel[] = [];
  /** the light around a teased reel, under the win overlay */
  private readonly glow = new Graphics();
  private readonly overlay = new Graphics();
  private readonly textures: Record<SymbolId, Texture>;
  /** SUN DISCs landed so far in the current spin, for the rising calls */
  private discsLanded = 0;
  /** the reel the tease light sits on, -1 when none */
  private teaseReel = -1;
  /** the roll under way since the press, null between spins */
  private primed: { at: number; fast: boolean; shown: Grid; hurried: boolean } | null = null;

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
        teased: false,
      };
      this.layout(reel);
      this.reels.push(reel);
    }

    this.root.addChild(this.glow);
    this.root.addChild(this.overlay);
    app.ticker.add(() => this.tick(app.ticker.deltaMS));
  }

  /** Put a grid on the frame with no animation (boot, replay restore, skip). */
  land(grid: Grid): void {
    this.teaseReel = -1;
    this.glow.clear();
    this.overlay.clear();
    for (let x = 0; x < REELS; x++) {
      const reel = this.reels[x];
      for (let y = 0; y < ROWS; y++) reel.syms[y + 1] = grid[x][y];
      reel.offset = 0;
      for (const sprite of reel.sprites) {
        sprite.alpha = 1;
        sprite.setSize(CELL * 0.94);
      }
      this.layout(reel);
    }
  }

  /**
   * The press. Every reel starts rolling now with nowhere to stop yet: spin()
   * lands them on the answer when it comes, abort() brings the old grid back
   * if the answer is a refusal. Only a live spin calls this from main.ts; the
   * demo and the free games are primed by spin() itself and land in the same
   * breath.
   */
  prime(fast = false): void {
    if (this.primed) return;
    const now = performance.now();
    this.primed = { at: now, fast, shown: this.shown(), hurried: false };
    this.discsLanded = 0;
    this.teaseReel = -1;
    this.glow.clear();
    this.clearShow();
    if (fast) sound.freeSpin();
    else sound.spin();
    for (let x = 0; x < REELS; x++) {
      const reel = this.reels[x];
      reel.teased = false;
      reel.state = 'accel';
      reel.speed = 0;
      reel.startAt = now + x * (fast ? 30 : 90);
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
    return this.spin(primed.shown, primed.fast);
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
  spin(grid: Grid, fast = false): Promise<void> {
    if (!this.primed) this.prime(fast);
    const { at, fast: pace, hurried } = this.primed!;
    this.primed = null;
    const now = performance.now();
    const roll = pace ? FAST_ROLL : BASE_ROLL;
    const gap = pace ? FAST_STOP_GAP : STOP_GAP;
    const tease = pace ? FAST_TEASE : TEASE;
    let settled = 0;
    let discs = 0;
    let extra = 0;
    return new Promise((resolve) => {
      for (let x = 0; x < REELS; x++) {
        const reel = this.reels[x];
        // two SUN DISCs already up on the reels to its left: this one makes the player wait
        reel.teased = discs >= 2;
        if (reel.teased) extra += tease;
        // a reel never stops before it has rolled; a hurried spin stops at once
        reel.stopAt = hurried ? now : Math.max(at + roll + x * gap + extra, now);
        reel.stopFeed = [grid[x][2], grid[x][1], grid[x][0]];
        reel.onSettled = () => {
          settled++;
          if (settled === REELS) resolve();
        };
        if (grid[x].includes(SCATTER)) discs++;
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
    const index = this.reels.indexOf(reel);
    sound.reelStop(index);
    // every SUN DISC that lands answers from its reel, each one higher than the last
    if (reel.syms.slice(1, ROWS + 1).includes(SCATTER)) sound.discLand(this.discsLanded++, index);
    this.retarget();
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

  /**
   * Move the tease light to the leftmost reel still rolling when that reel
   * is a teased one, or put it out. Works from the reels' states rather than
   * the stop order, so a hurried stop cannot strand it.
   */
  private retarget(): void {
    const x = this.reels.findIndex((r) => r.state !== 'idle' && r.state !== 'settling');
    const target = x >= 0 && this.reels[x].teased ? x : -1;
    if (target === this.teaseReel) return;
    this.teaseReel = target;
    if (target < 0) this.glow.clear();
    else sound.tease(target);
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

    if (this.teaseReel >= 0) {
      const beat = Math.sin(now / 85);
      const x = this.teaseReel * STEP;
      this.glow.clear();
      this.glow.rect(x, 0, CELL, BOARD_H).fill({ color: SUN, alpha: 0.08 + 0.05 * beat });
      this.glow.roundRect(x + 3, 3, CELL - 6, BOARD_H - 6, 12).stroke({ width: 6, color: SUN, alpha: 0.6 + 0.3 * beat });
    }
  }

  // ------------------------------------------------------------- win show

  /** Back to the plain grid: no ribbons, nothing dimmed, every tile its own symbol. */
  private clearShow(): void {
    this.overlay.clear();
    for (const reel of this.reels) {
      for (const sprite of reel.sprites) {
        sprite.alpha = 1;
        sprite.setSize(CELL * 0.94);
      }
      this.layout(reel);
    }
  }

  /** End a show but leave the tiles as they look, an expanded block included, until the next spin. */
  private relax(): void {
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

  /** Full strength for the cells in `lit`, the rest of the frame dimmed. */
  private dim(lit: [number, number][]): void {
    const on = new Set(lit.map(([x, y]) => `${x},${y}`));
    for (let x = 0; x < REELS; x++) {
      for (let y = 0; y < ROWS; y++) this.sprite(x, y).alpha = on.has(`${x},${y}`) ? 1 : 0.45;
    }
  }

  private drawLine(win: LineWin, width = 7, alpha = 0.9): void {
    const color = LINE_COLORS[win.line];
    const pts = PAYLINES[win.line].map((row, x) => ({
      x: x * STEP + CELL / 2,
      y: row * STEP + CELL / 2,
    }));
    this.overlay.moveTo(-4, pts[0].y);
    this.overlay.lineTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) this.overlay.lineTo(pts[i].x, pts[i].y);
    this.overlay.lineTo(BOARD_W + 4, pts[pts.length - 1].y);
    this.overlay.stroke({ width, color, alpha, cap: 'round', join: 'round' });
  }

  /** A sun ring round one tile, for the SUN DISCs as they pay. */
  private drawRing(x: number, y: number): void {
    const cx = x * STEP + CELL / 2;
    const cy = y * STEP + CELL / 2;
    const r = CELL * 0.47;
    this.overlay.circle(cx, cy, r).stroke({ width: 5, color: SUN, alpha: 0.95 });
    this.overlay.circle(cx, cy, r + 7).stroke({ width: 2, color: SUN, alpha: 0.45 });
  }

  /** The frame round an expanded block of `count` reels. */
  private drawBlock(count: number): void {
    const w = count * STEP - GAP;
    this.overlay.roundRect(3, 3, w - 6, BOARD_H - 6, 12).stroke({ width: 6, color: SUN, alpha: 0.95 });
  }

  /** Pulse one win's tiles (with its ribbon for a line, rings for SUN DISCs) for `ms`. */
  private async pulse(cells: [number, number][], ms: number, line?: LineWin, rings = false): Promise<void> {
    this.overlay.clear();
    if (line) this.drawLine(line);
    if (rings) for (const [x, y] of cells) this.drawRing(x, y);
    this.dim(cells);
    await tween(ms, (t) => {
      const k = 0.94 + Math.sin(t * Math.PI * 2) * 0.06;
      for (const [x, y] of cells) this.sprite(x, y).setSize(CELL * k);
    });
    for (const [x, y] of cells) this.sprite(x, y).setSize(CELL * 0.94);
  }

  /** 3 or more SUN DISCs: ringed and pulsing, with the sun's own call. */
  private async showDiscs(hit: ScatterHit, fast: boolean): Promise<void> {
    sound.scatter(hit.count);
    await this.pulse(hit.positions, fast ? 800 : 1300, undefined, true);
    await sleep(fast ? 60 : 140);
  }

  /**
   * The free games win. First the tiles where the symbol was found light
   * up; then it takes over its reels one at a time from the left, each
   * reel stamped with it; then all ten lines light together over the block,
   * since the way pays on every one of them. The block stays on screen
   * until the next spin rolls.
   */
  private async expand(way: WayWin, lines: LineWin[], fast: boolean): Promise<void> {
    const tex = this.textures[way.symbol];
    await this.pulse(way.positions, fast ? 420 : 650);

    this.overlay.clear();
    const block: [number, number][] = [];
    for (let x = 0; x < way.count; x++) {
      sound.expand(x);
      const grow: Sprite[] = [];
      for (let y = 0; y < ROWS; y++) {
        block.push([x, y]);
        const s = this.sprite(x, y);
        s.alpha = 1;
        if (s.texture !== tex) {
          s.texture = tex;
          grow.push(s);
        }
      }
      // swell past full size, then settle back, as if stamped on the reel
      await frames(fast ? 150 : 210, (t) => {
        const k = t < 0.65 ? 0.35 + (t / 0.65) * 0.75 : 1.1 - ((t - 0.65) / 0.35) * 0.16;
        for (const s of grow) s.setSize(CELL * k);
      });
      for (const s of grow) s.setSize(CELL * 0.94);
    }

    this.dim(block);
    this.drawBlock(way.count);
    for (const w of lines) this.drawLine(w, 4, 0.75);
    sound.expanded(way.count);
    await tween(fast ? 950 : 1500, (t) => {
      const k = 0.94 + Math.sin(t * Math.PI * 4) * 0.045;
      for (const [x, y] of block) this.sprite(x, y).setSize(CELL * k);
    });
    this.relax();
  }

  /**
   * The win show. Main game: every winning line's ribbon and tiles in turn,
   * then the SUN DISCs when 3 or more pay. Free games: the SUN DISCs first,
   * then the expanding way, so the expanded block is what stays on screen.
   * `fast` shortens everything for the free games. Resolves when the show
   * has played through.
   */
  async presentWins(spin: SpinResult, fast = false): Promise<void> {
    if (spin.wayWin) {
      if (spin.scatterHit) await this.showDiscs(spin.scatterHit, fast);
      await this.expand(spin.wayWin, spin.lineWins, fast);
      return;
    }
    for (const win of spin.lineWins) {
      sound.line(win.line);
      await this.pulse(win.positions, fast ? 420 : 850, win);
      await sleep(fast ? 50 : 120);
    }
    if (spin.scatterHit) await this.showDiscs(spin.scatterHit, fast);
    this.clearShow();
  }
}
