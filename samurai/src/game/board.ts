/**
 * The reel machine: five columns of tiles, a classic roll with staggered
 * stops, and the win shows. In the main game: payline ribbons, pulsing
 * symbols, and the GONGs ringed as they pay. In the free games a SAMURAI
 * that lands takes his reel: a blade flashes down it and the whole reel
 * turns to samurai, framed in vermilion with petals drifting down it until
 * the next spin, and every line the spin pays lights at once. Every GONG
 * that lands answers from its reel, and once two are showing, each reel
 * still to land rolls on a little longer, lit, in case a third comes. Pure
 * presentation: every grid it lands comes from the engine (demo) or the
 * server (real), never from here.
 *
 * main.ts plays every free game, and only the free games, at the fast pace
 * (board.spin(grid, true)), so the fast flag is how the board knows a reel
 * showing a SAMURAI is taken; land() keeps the taken reels for the last grid
 * of a skipped session. The grids themselves stay exactly as they landed.
 */
import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Grid, LineWin, ScatterHit, SpinResult, SymbolId } from '../engine';
import { PAYLINES, REELS, ROWS, SCATTER, SYMBOL_ORDER, WILD, wildReelsOf } from '../engine';
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
 * A free games session runs 18 spins on average once retriggers count, so
 * those spins roll quicker than the paid ones.
 */
const FAST_ROLL = 260;
const FAST_STOP_GAP = 100;
/**
 * Two GONGs showing: each reel still to land rolls on this much longer (ms),
 * lit, while the drums beat. The grid was decided before the reels moved;
 * this only stretches the wait for it.
 */
const TEASE = 620;
const FAST_TEASE = 340;
/** The strike: the blade crosses the reel in STRIKE_SLASH ms, then the reel fills in STRIKE_FILL ms. */
const STRIKE_SLASH = 150;
const STRIKE_FILL = 170;

/** Vermilion lacquer for the taken reels and the rings, gold leaf for the blade and the tease. */
const VERMILION = 0xe0402c;
const GOLD = 0xe2b456;
const PAPER = 0xf3e9d2;
const SAKURA = 0xf6a9bf;

/** One colour per bet line, all 20 readable on the dark frame. */
const LINE_COLORS = [
  0xe0402c, 0xe2b456, 0xf3e9d2, 0x5fc9a8, 0x6f9be8, 0xf6a9bf, 0xff8c42, 0xb98cf0, 0x9ad25a, 0x4fd2e0,
  0xff6f91, 0xd8c070, 0x8fb8ff, 0xf28f6b, 0x76e0b8, 0xe58cd8, 0xc7d94a, 0xffb3a1, 0x7fa6c9, 0xffd27f,
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
  /** two GONGs land to its left this spin: it rolls on longer, lit */
  teased: boolean;
  /** a free game and a SAMURAI on this reel: he takes it once it lands */
  strikes: boolean;
  onSettled?: () => void;
}

/** One cherry petal drifting down a taken reel. */
interface Petal {
  x: number;
  y: number;
  vy: number;
  sway: number;
  flip: number;
  r: number;
  age: number;
}

export class Board {
  readonly root = new Container();
  private readonly reels: Reel[] = [];
  /** under the tiles: the lacquer wash behind the taken reels */
  private readonly under = new Graphics();
  /** the light around a teased reel */
  private readonly glow = new Graphics();
  /** the frames round the taken reels */
  private readonly aura = new Graphics();
  /** petals drifting down the taken reels */
  private readonly petalLayer = new Graphics();
  /** the blade crossing a reel as the samurai takes it */
  private readonly slash = new Graphics();
  private readonly overlay = new Graphics();
  private readonly textures: Record<SymbolId, Texture>;
  /** the grid exactly as it last landed (a taken reel still shows its own symbols here) */
  private current: Grid;
  /** the spin on the frame is a free game: a reel showing a SAMURAI is his */
  private free = false;
  /** the reels the samurai holds right now, kept until the next spin rolls */
  private readonly taken: boolean[] = new Array(REELS).fill(false);
  private petals: Petal[] = [];
  private petalClock = 0;
  /** GONGs landed so far in the current spin, for the rising calls */
  private gongsLanded = 0;
  /** the reel the tease light sits on, -1 when none */
  private teaseReel = -1;
  /** the player asked to hurry this spin: every strike lands at once */
  private hurried = false;
  /** the roll under way since the press, null between spins */
  private primed: { at: number; fast: boolean; shown: Grid; hurried: boolean } | null = null;

  constructor(app: Application, textures: Record<SymbolId, Texture>) {
    this.textures = textures;
    app.stage.addChild(this.root);

    const mask = new Graphics().rect(-4, -4, BOARD_W + 8, BOARD_H + 8).fill(0xffffff);
    this.root.addChild(mask);
    this.root.mask = mask;
    this.root.addChild(this.under);

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
        strikes: false,
      };
      this.layout(reel);
      this.reels.push(reel);
    }
    this.current = this.reels.map((reel) => reel.syms.slice(1, ROWS + 1));

    this.root.addChild(this.glow);
    this.root.addChild(this.aura);
    this.root.addChild(this.petalLayer);
    this.root.addChild(this.slash);
    this.root.addChild(this.overlay);
    app.ticker.add(() => this.tick(app.ticker.deltaMS));
  }

  /** Put a grid on the frame with no animation (boot, replay restore, skip). */
  land(grid: Grid): void {
    this.teaseReel = -1;
    this.glow.clear();
    this.overlay.clear();
    this.slash.clear();
    this.current = grid.map((col) => col.slice());
    const wild = this.free ? wildReelsOf(grid) : [];
    for (let x = 0; x < REELS; x++) {
      const reel = this.reels[x];
      const take = wild.includes(x);
      for (let y = 0; y < ROWS; y++) reel.syms[y + 1] = take ? WILD : grid[x][y];
      reel.offset = 0;
      reel.strikes = false;
      for (const sprite of reel.sprites) {
        sprite.alpha = 1;
        sprite.setSize(CELL * 0.94);
      }
      this.layout(reel);
      this.taken[x] = take;
    }
    this.drawTaken();
  }

  /**
   * Roll the reels and settle them on `grid`, left to right. In a free game
   * every reel that lands with a SAMURAI on it is taken before the spin
   * counts as done.
   */
  spin(grid: Grid, fast = false): Promise<void> {
    if (!this.primed) this.prime(fast);
    const { at, fast: pace, hurried } = this.primed!;
    this.primed = null;
    if (hurried) this.hurried = true;
    this.current = grid.map((col) => col.slice());
    const now = performance.now();
    const roll = pace ? FAST_ROLL : BASE_ROLL;
    const gap = pace ? FAST_STOP_GAP : STOP_GAP;
    const tease = pace ? FAST_TEASE : TEASE;
    const wild = this.free ? wildReelsOf(grid) : [];
    let gongs = 0;
    let extra = 0;
    this.gongsLanded = 0;

    return new Promise<void>((resolve) => {
      let settled = 0;
      for (let x = 0; x < REELS; x++) {
        const reel = this.reels[x];
        // two GONGs already up to its left: this one makes the player wait
        reel.teased = gongs >= 2;
        if (reel.teased) extra += tease;
        // a reel never stops before it has rolled; a hurried spin stops at once
        reel.stopAt = hurried ? now : Math.max(at + roll + x * gap + extra, now);
        reel.stopFeed = [grid[x][2], grid[x][1], grid[x][0]];
        reel.strikes = wild.includes(x);
        reel.onSettled = () => {
          settled++;
          if (settled === REELS) resolve();
        };
        if (grid[x].includes(SCATTER)) gongs++;
      }
    });
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
    this.primed = { at: now, fast, shown: this.current.map((col) => col.slice()), hurried: false };
    this.free = fast;
    this.teaseReel = -1;
    this.hurried = false;
    this.glow.clear();
    this.slash.clear();
    this.clearShow();
    this.taken.fill(false);
    this.drawTaken();
    if (fast) sound.freeSpin();
    else sound.spin();
    for (let x = 0; x < REELS; x++) {
      const reel = this.reels[x];
      reel.teased = false;
      reel.strikes = false;
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

  /** Player hit SPIN mid-roll: every reel stops on its next alignment, every strike lands at once. */
  hurry(): void {
    // pressed while the answer is still on its way: everything stops as it lands
    if (this.primed) {
      this.primed.hurried = true;
      return;
    }
    const now = performance.now();
    this.hurried = true;
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
    // every GONG that lands answers from its reel, each one deeper in the call than the last
    if (reel.syms.slice(1, ROWS + 1).includes(SCATTER)) sound.gongLand(this.gongsLanded++, index);
    this.retarget();
    // a short overshoot-and-return bounce sells the mechanical stop
    void frames(150, (t) => {
      const bounce = Math.sin(t * Math.PI) * 16;
      for (let slot = 0; slot < reel.sprites.length; slot++) {
        reel.sprites[slot].y = (slot - 1) * STEP + bounce + CELL / 2;
      }
    }).then(async () => {
      reel.offset = 0;
      this.layout(reel);
      reel.state = 'idle';
      if (reel.strikes) {
        reel.strikes = false;
        await this.strike(index);
      }
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
      this.glow.rect(x, 0, CELL, BOARD_H).fill({ color: GOLD, alpha: 0.07 + 0.05 * beat });
      this.glow.roundRect(x + 3, 3, CELL - 6, BOARD_H - 6, 12).stroke({ width: 6, color: GOLD, alpha: 0.6 + 0.3 * beat });
    }

    this.tickPetals(dt, now);
  }

  // ------------------------------------------------------------ the strike

  private sprite(x: number, y: number): Sprite {
    return this.reels[x].sprites[y + 1];
  }

  /** The blade at `t` (0-1) of its stroke down reel `x`: a gold-cored cut, top right to bottom left. */
  private drawSlash(x: number, t: number): void {
    const x0 = x * STEP + CELL * 0.95;
    const y0 = -12;
    const x1 = x * STEP + CELL * 0.05;
    const y1 = BOARD_H + 12;
    const head = Math.min(1, t * 1.6);
    const tail = Math.max(0, t * 1.6 - 0.6);
    const fade = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    const ax = x0 + (x1 - x0) * tail;
    const ay = y0 + (y1 - y0) * tail;
    const bx = x0 + (x1 - x0) * head;
    const by = y0 + (y1 - y0) * head;
    this.slash.clear();
    this.slash.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 18, color: GOLD, alpha: 0.32 * fade, cap: 'round' });
    this.slash.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 5, color: PAPER, alpha: 0.95 * fade, cap: 'round' });
  }

  /**
   * The samurai takes reel `x`: the blade cuts down it, every tile turns to
   * the samurai, swelling into place beside the one that landed, and the
   * lacquer frame closes round it. A hurried spin lands it at once.
   */
  private async strike(x: number): Promise<void> {
    const reel = this.reels[x];
    const landed = reel.syms.slice(1, ROWS + 1).indexOf(WILD);
    sound.strike(x);
    if (!this.hurried) await frames(STRIKE_SLASH, (t) => this.drawSlash(x, t));
    this.slash.clear();
    for (let y = 0; y < ROWS; y++) reel.syms[y + 1] = WILD;
    this.layout(reel);
    const grow = [0, 1, 2].filter((y) => y !== landed).map((y) => this.sprite(x, y));
    if (!this.hurried) {
      // swell past full size, then settle back, as if the blade set it there
      await frames(STRIKE_FILL, (t) => {
        const k = t < 0.6 ? 0.3 + (t / 0.6) * 0.82 : 1.12 - ((t - 0.6) / 0.4) * 0.18;
        for (const s of grow) s.setSize(CELL * (this.hurried ? 0.94 : k));
      });
    }
    for (const s of grow) s.setSize(CELL * 0.94);
    this.taken[x] = true;
    this.drawTaken();
  }

  /** Frame every taken reel (or none), with the lacquer wash beneath. */
  private drawTaken(): void {
    this.under.clear();
    this.aura.clear();
    let any = false;
    for (let x = 0; x < REELS; x++) {
      if (!this.taken[x]) continue;
      any = true;
      const left = x * STEP;
      this.under.roundRect(left, 0, CELL, BOARD_H, 12).fill({ color: VERMILION, alpha: 0.17 });
      this.aura.roundRect(left + 3, 3, CELL - 6, BOARD_H - 6, 12).stroke({ width: 5, color: VERMILION, alpha: 0.95 });
      this.aura.roundRect(left - 1, -1, CELL + 2, BOARD_H + 2, 15).stroke({ width: 2, color: GOLD, alpha: 0.6 });
    }
    if (!any) {
      this.petals = [];
      this.petalLayer.clear();
    }
  }

  /** Cherry petals drift down the taken reels, turning as they fall. */
  private tickPetals(dt: number, now: number): void {
    const reels: number[] = [];
    for (let x = 0; x < REELS; x++) if (this.taken[x]) reels.push(x);
    if (reels.length === 0) return;
    this.petalClock += dt;
    while (this.petalClock > 110) {
      this.petalClock -= 110;
      if (this.petals.length < 12 * reels.length) {
        const x = reels[Math.floor(Math.random() * reels.length)];
        this.petals.push({
          x: x * STEP + 12 + Math.random() * (CELL - 24),
          y: -10,
          vy: 0.035 + Math.random() * 0.035,
          sway: Math.random() * Math.PI * 2,
          flip: Math.random() * Math.PI * 2,
          r: 3.2 + Math.random() * 3,
          age: 0,
        });
      }
    }
    this.petalLayer.clear();
    const keep: Petal[] = [];
    for (const p of this.petals) {
      p.age += dt;
      p.y += p.vy * dt;
      p.x += Math.sin(now / 540 + p.sway) * 0.2;
      if (p.y > BOARD_H + 12) continue;
      keep.push(p);
      const fade = Math.min(1, p.age / 300) * Math.min(1, (BOARD_H + 12 - p.y) / 70);
      // the petal turning over reads as its width breathing
      const w = p.r * (0.3 + 0.7 * Math.abs(Math.cos(now / 280 + p.flip)));
      this.petalLayer.ellipse(p.x, p.y, w, p.r * 0.6).fill({ color: SAKURA, alpha: 0.85 * fade });
    }
    this.petals = keep;
  }

  // ------------------------------------------------------------- win show

  /** Back to the plain grid: no ribbons, nothing dimmed, every tile its own size. */
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

  /** Full strength for the cells in `lit`, the rest of the frame dimmed. */
  private dim(lit: [number, number][]): void {
    const on = new Set(lit.map(([x, y]) => `${x},${y}`));
    for (let x = 0; x < REELS; x++) {
      for (let y = 0; y < ROWS; y++) this.sprite(x, y).alpha = on.has(`${x},${y}`) ? 1 : 0.45;
    }
  }

  private drawLine(win: LineWin, width = 7, alpha = 0.9): void {
    const color = LINE_COLORS[win.line % LINE_COLORS.length];
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

  /** A ring of lacquer and gold round one tile, for the GONGs as they pay. */
  private drawRing(x: number, y: number): void {
    const cx = x * STEP + CELL / 2;
    const cy = y * STEP + CELL / 2;
    const r = CELL * 0.47;
    this.overlay.circle(cx, cy, r).stroke({ width: 5, color: VERMILION, alpha: 0.95 });
    this.overlay.circle(cx, cy, r + 7).stroke({ width: 2, color: GOLD, alpha: 0.6 });
  }

  /** Pulse cells (with ribbons for lines, rings for GONGs) for `ms`. */
  private async pulse(cells: [number, number][], ms: number, lines: LineWin[] = [], rings = false, width = 7): Promise<void> {
    this.overlay.clear();
    for (const line of lines) this.drawLine(line, width, lines.length > 1 ? 0.75 : 0.9);
    if (rings) for (const [x, y] of cells) this.drawRing(x, y);
    this.dim(cells);
    await tween(ms, (t) => {
      const k = 0.94 + Math.sin(t * Math.PI * 2) * 0.06;
      for (const [x, y] of cells) this.sprite(x, y).setSize(CELL * k);
    });
    for (const [x, y] of cells) this.sprite(x, y).setSize(CELL * 0.94);
  }

  /** The GONGs pay: ringed and pulsing, with the gong's own roar. */
  private async showGongs(hit: ScatterHit, fast: boolean): Promise<void> {
    sound.scatter(hit.count);
    await this.pulse(hit.positions, fast ? 800 : 1300, [], true);
    await sleep(fast ? 60 : 140);
  }

  /**
   * The win show. Main game: up to three winning lines each in turn, ribbon
   * and tiles, more than that all at once; then the GONGs when they pay.
   * Free games: every line the spin pays lights at once, then the GONGs; the
   * taken reels stay as they are until the next spin. `fast` shortens
   * everything for the free games. Resolves when the show has played
   * through.
   */
  async presentWins(spin: SpinResult, fast = false): Promise<void> {
    const wins = spin.lineWins;
    if (wins.length > 0 && (spin.freeGame || wins.length > 3)) {
      const cells = new Map<string, [number, number]>();
      let longest = 0;
      for (const w of wins) {
        longest = Math.max(longest, w.count);
        for (const [x, y] of w.positions) cells.set(`${x},${y}`, [x, y]);
      }
      sound.lines(longest, wins.length, spin.wildReels.length > 0);
      await this.pulse([...cells.values()], fast ? 1000 : 1500, wins, false, wins.length > 6 ? 4 : 6);
    } else {
      for (const win of wins) {
        sound.line(win.line);
        await this.pulse(win.positions, fast ? 420 : 850, [win]);
        await sleep(fast ? 50 : 120);
      }
    }
    if (spin.scatterHit) await this.showGongs(spin.scatterHit, fast);
    if (spin.freeGame) this.relax();
    else this.clearShow();
  }

  /** End a show but leave the taken reels as they look until the next spin. */
  private relax(): void {
    this.overlay.clear();
    for (const reel of this.reels) {
      for (const sprite of reel.sprites) {
        sprite.alpha = 1;
        sprite.setSize(CELL * 0.94);
      }
    }
  }
}
