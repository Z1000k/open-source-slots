/**
 * The reel machine: five columns of tiles, a classic roll with staggered
 * stops, and the win shows. In the main game: payline ribbons, pulsing
 * symbols, and the LANTERNs ringed as they pay. In the free games, before
 * the reels roll, a symbol is drawn and cast over the first reels one reel
 * at a time; those reels stay enchanted, framed and dusted with light, while
 * only the others spin, and every line it pays lights at once. Every LANTERN
 * that lands answers from its reel, and once two are showing, each reel
 * still to land rolls on a little longer, lit, in case a third comes. Pure
 * presentation: every grid it lands comes from the engine (demo) or the
 * server (real), never from here.
 */
import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Expansion, Grid, LineWin, ScatterHit, SpinResult, SymbolId } from '../engine';
import { BLANK, EXPAND_POOL, PAYLINES, REELS, ROWS, SCATTER, SYMBOL_ORDER, expansionOf } from '../engine';
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
 * A free games session runs 12 spins on average once retriggers count, and
 * every one of them opens with the cast, so those spins roll quicker than
 * the paid ones.
 */
const FAST_ROLL = 260;
const FAST_STOP_GAP = 100;
/**
 * Two LANTERNs showing: each reel still to land rolls on this much longer
 * (ms), lit, while the forest hums. The grid was decided before the reels
 * moved; this only stretches the wait for it.
 */
const TEASE = 620;
const FAST_TEASE = 340;
/** The cast: the draw flickers this long (ms), then each covered reel takes this long to fill. */
const DRAW = 420;
const FAST_DRAW = 300;
const FILL = 210;
const FAST_FILL = 150;

/** Lilac magic for the cast frame and the rings, fairy-light mint for the dust and the tease. */
const LILAC = 0xc39bff;
const MINT = 0x7ff5cf;
const MOON = 0xfff4d6;

/** One colour per bet line, the fairy lights of the forest. */
const LINE_COLORS = [
  0xc39bff, 0x7ff5cf, 0xff8fc7, 0xf6cf6a, 0x8fd3ff, 0xffb38a, 0xc8f57f, 0xe07bff, 0x5ff0f0, 0xff7a9a,
];

/** The drawn symbols, each once, for the flicker of the draw. */
const DRAWABLE = [...new Set(EXPAND_POOL)];

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
  // the empty cells above and below a cast LANTERN show nothing at all
  out[BLANK] = Texture.EMPTY;
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
  /** two LANTERNs land to its left this spin: it rolls on longer, lit */
  teased: boolean;
  onSettled?: () => void;
}

/** One mote of fairy dust rising through the cast reels. */
interface Mote {
  x: number;
  y: number;
  vy: number;
  drift: number;
  r: number;
  life: number;
  age: number;
}

export class Board {
  readonly root = new Container();
  private readonly reels: Reel[] = [];
  /** under the tiles: the wash behind the cast reels and the lantern light */
  private readonly under = new Graphics();
  /** the light around a teased reel */
  private readonly glow = new Graphics();
  /** the frame round the cast reels */
  private readonly aura = new Graphics();
  /** fairy dust rising through the cast reels */
  private readonly dust = new Graphics();
  private readonly overlay = new Graphics();
  private readonly textures: Record<SymbolId, Texture>;
  /** LANTERNs landed so far in the current spin, for the rising calls */
  private lanternsLanded = 0;
  /** the reel the tease light sits on, -1 when none */
  private teaseReel = -1;
  /** the cast on the frame right now, kept until the next spin rolls */
  private cover: Expansion | null = null;
  private motes: Mote[] = [];
  private moteClock = 0;
  /** the player asked to hurry this spin: the cast finishes at once */
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
      };
      this.layout(reel);
      this.reels.push(reel);
    }

    this.root.addChild(this.glow);
    this.root.addChild(this.aura);
    this.root.addChild(this.dust);
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
    this.setCover(expansionOf(grid) ?? null);
  }

  /**
   * Roll the reels and settle them on `grid`, left to right. A free game's
   * grid opens with the cast: the drawn symbol flickers up on the first
   * reel and fills the covered reels one at a time while the others roll.
   */
  spin(grid: Grid, fast = false): Promise<void> {
    if (!this.primed) this.prime(fast);
    const { at, fast: pace, hurried, shown } = this.primed!;
    this.primed = null;
    if (hurried) this.hurried = true;
    const now = performance.now();
    const cover = expansionOf(grid) ?? null;
    const roll = pace ? FAST_ROLL : BASE_ROLL;
    const gap = pace ? FAST_STOP_GAP : STOP_GAP;
    const tease = pace ? FAST_TEASE : TEASE;
    // the uncovered reels may not stop before the cast is done
    const castMs = cover ? (pace ? FAST_DRAW : DRAW) + cover.reels * (pace ? FAST_FILL : FILL) : 0;
    const first = cover ? cover.reels : 0;
    let lanterns = cover && cover.symbol === SCATTER ? cover.reels : 0;
    let extra = 0;
    this.lanternsLanded = lanterns;

    // the covered reels are painted by the cast, not rolled: one the press
    // set rolling stops where it was before the cast runs, one that has not
    // moved yet stays put
    const coveredDown: Promise<void>[] = [];
    for (let x = 0; x < first; x++) {
      const reel = this.reels[x];
      reel.teased = false;
      if (reel.state === 'idle') continue;
      if (reel.speed === 0) {
        reel.state = 'idle';
        reel.offset = 0;
        this.layout(reel);
        continue;
      }
      reel.stopAt = now;
      reel.stopFeed = [shown[x][2], shown[x][1], shown[x][0]];
      coveredDown.push(
        new Promise<void>((resolve) => {
          reel.onSettled = resolve;
        }),
      );
    }

    const rolled = new Promise<void>((resolve) => {
      let settled = 0;
      for (let x = first; x < REELS; x++) {
        const reel = this.reels[x];
        // two LANTERNs already up to its left: this one makes the player wait
        reel.teased = lanterns >= 2;
        if (reel.teased) extra += tease;
        // a reel never stops before it has rolled; a hurried spin stops at once
        reel.stopAt = hurried ? now : Math.max(at + castMs + roll + (x - first) * gap + extra, now);
        reel.stopFeed = [grid[x][2], grid[x][1], grid[x][0]];
        reel.onSettled = () => {
          settled++;
          if (settled === REELS - first) resolve();
        };
        if (grid[x].includes(SCATTER)) lanterns++;
      }
    });
    if (!cover) return rolled;
    const cast = Promise.all(coveredDown).then(() => this.cast(grid, cover, pace));
    return Promise.all([rolled, cast]).then(() => undefined);
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
    this.teaseReel = -1;
    this.hurried = false;
    this.glow.clear();
    this.clearShow();
    this.setCover(null);
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

  /** Player hit SPIN mid-roll: every reel stops on its next alignment, the cast completes at once. */
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
    // every LANTERN that lands answers from its reel, each one higher than the last
    if (reel.syms.slice(1, ROWS + 1).includes(SCATTER)) sound.lanternLand(this.lanternsLanded++, index);
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
      this.glow.rect(x, 0, CELL, BOARD_H).fill({ color: MINT, alpha: 0.07 + 0.05 * beat });
      this.glow.roundRect(x + 3, 3, CELL - 6, BOARD_H - 6, 12).stroke({ width: 6, color: MINT, alpha: 0.6 + 0.3 * beat });
    }

    this.tickDust(dt, now);
  }

  // ------------------------------------------------------------- the cast

  /** Wait `ms`, cut short the moment the player hurries the spin. */
  private wait(ms: number): Promise<void> {
    if (this.hurried) return Promise.resolve();
    return new Promise((resolve) => {
      const end = performance.now() + ms;
      const check = (): void => {
        if (this.hurried || performance.now() >= end) resolve();
        else requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  }

  /** Show `syms` on reel `x` (top to bottom), still and full size. */
  private paint(x: number, syms: SymbolId[]): void {
    const reel = this.reels[x];
    for (let y = 0; y < ROWS; y++) reel.syms[y + 1] = syms[y];
    reel.offset = 0;
    for (const sprite of reel.sprites) {
      sprite.alpha = 1;
      sprite.setSize(CELL * 0.94);
    }
    this.layout(reel);
  }

  /**
   * The draw and the cast. The middle of reel 1 flickers through the
   * symbols that can be drawn, slowing, until it lands on the one the round
   * drew; then the symbol fills reel 1 and each covered reel after it,
   * swelling into place, and the frame closes round them. A LANTERN lights
   * only the middle row, the cells above and below it stay empty.
   */
  private async cast(grid: Grid, cover: Expansion, fast: boolean): Promise<void> {
    const drawMs = fast ? FAST_DRAW : DRAW;
    const fillMs = fast ? FAST_FILL : FILL;
    // the covered reels go dark while the draw runs
    for (let x = 0; x < cover.reels; x++) {
      for (let y = 0; y < ROWS; y++) this.sprite(x, y).alpha = 0.3;
    }
    const middle = this.sprite(0, 1);
    sound.draw();
    const flickers = fast ? 5 : 7;
    let shown: SymbolId = this.reels[0].syms[2];
    for (let i = 0; i < flickers && !this.hurried; i++) {
      // never the same face twice running, and never the drawn one before it lands
      const choices = DRAWABLE.filter((s) => s !== shown && s !== cover.symbol);
      shown = choices[Math.floor(Math.random() * choices.length)];
      middle.texture = this.textures[shown];
      middle.alpha = 0.75;
      sound.flicker(i);
      // the flicker slows as it goes, like a wheel of fortune coming to rest
      await this.wait((drawMs / flickers) * (0.6 + (0.8 * i) / flickers));
    }

    for (let x = 0; x < cover.reels; x++) {
      this.paint(x, grid[x]);
      sound.cast(x, cover.reels);
      const grow = [0, 1, 2].map((y) => this.sprite(x, y)).filter((s) => s.texture !== Texture.EMPTY);
      if (!this.hurried) {
        // swell past full size, then settle back, as if the spell set it there
        await frames(fillMs, (t) => {
          const k = t < 0.6 ? 0.3 + (t / 0.6) * 0.82 : 1.12 - ((t - 0.6) / 0.4) * 0.18;
          for (const s of grow) s.setSize(CELL * (this.hurried ? 0.94 : k));
        });
      }
      for (const s of grow) s.setSize(CELL * 0.94);
      this.setCover({ symbol: cover.symbol, reels: x + 1 });
    }
    this.setCover(cover);
    // a cast LANTERN puts two up at once: the first reel still rolling takes the light now
    this.retarget();
  }

  /** Frame the cast reels (or clear the frame), with the wash and the lantern light beneath. */
  private setCover(cover: Expansion | null): void {
    const was = this.cover;
    this.cover = cover;
    this.under.clear();
    this.aura.clear();
    if (!cover) {
      this.motes = [];
      this.dust.clear();
      return;
    }
    if (!was) this.motes = [];
    const w = cover.reels * STEP - GAP;
    this.under.roundRect(0, 0, w, BOARD_H, 14).fill({ color: LILAC, alpha: 0.13 });
    if (cover.symbol === SCATTER) {
      // the lantern's own light pooling round it, warm against the empty cells
      for (let x = 0; x < cover.reels; x++) {
        const cx = x * STEP + CELL / 2;
        const cy = STEP + CELL / 2;
        for (let i = 6; i >= 1; i--) this.under.circle(cx, cy, CELL * (0.28 + i * 0.12)).fill({ color: MOON, alpha: 0.035 });
      }
    }
    this.aura.roundRect(3, 3, w - 6, BOARD_H - 6, 14).stroke({ width: 5, color: LILAC, alpha: 0.95 });
    this.aura.roundRect(-1, -1, w + 2, BOARD_H + 2, 17).stroke({ width: 3, color: LILAC, alpha: 0.35 });
  }

  /** Motes of fairy light rise through the cast reels, twinkling as they go. */
  private tickDust(dt: number, now: number): void {
    if (!this.cover) return;
    const w = this.cover.reels * STEP - GAP;
    this.moteClock += dt;
    while (this.moteClock > 55) {
      this.moteClock -= 55;
      if (this.motes.length < 46) {
        this.motes.push({
          x: 8 + Math.random() * (w - 16),
          y: BOARD_H - 6 - Math.random() * 30,
          vy: 0.025 + Math.random() * 0.045,
          drift: Math.random() * Math.PI * 2,
          r: 1.2 + Math.random() * 2.2,
          life: 1600 + Math.random() * 1800,
          age: 0,
        });
      }
    }
    this.dust.clear();
    const keep: Mote[] = [];
    for (const m of this.motes) {
      m.age += dt;
      m.y -= m.vy * dt;
      m.x += Math.sin(now / 420 + m.drift) * 0.12;
      if (m.age >= m.life || m.y < 4) continue;
      keep.push(m);
      const fade = Math.sin((m.age / m.life) * Math.PI);
      const twinkle = 0.55 + 0.45 * Math.sin(now / 90 + m.drift * 3);
      this.dust.circle(m.x, m.y, m.r * 2.6).fill({ color: MINT, alpha: 0.12 * fade });
      this.dust.circle(m.x, m.y, m.r).fill({ color: MOON, alpha: 0.85 * fade * twinkle });
    }
    this.motes = keep;
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

  /** A ring of lilac light round one tile, for the LANTERNs as they pay. */
  private drawRing(x: number, y: number): void {
    const cx = x * STEP + CELL / 2;
    const cy = y * STEP + CELL / 2;
    const r = CELL * 0.47;
    this.overlay.circle(cx, cy, r).stroke({ width: 5, color: LILAC, alpha: 0.95 });
    this.overlay.circle(cx, cy, r + 7).stroke({ width: 2, color: MINT, alpha: 0.5 });
  }

  /** Pulse cells (with ribbons for lines, rings for LANTERNs) for `ms`. */
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

  /** The LANTERNs pay: ringed and pulsing, with their own chime. */
  private async showLanterns(hit: ScatterHit, fast: boolean): Promise<void> {
    sound.scatter(hit.count);
    await this.pulse(hit.positions, fast ? 800 : 1300, [], true);
    await sleep(fast ? 60 : 140);
  }

  /**
   * The win show. Main game: every winning line's ribbon and tiles in turn,
   * then the LANTERNs when they pay. Free games: every line the cast pays
   * lights at once over the frame, then the LANTERNs; the cast reels stay
   * framed until the next spin. `fast` shortens everything for the free
   * games. Resolves when the show has played through.
   */
  async presentWins(spin: SpinResult, fast = false): Promise<void> {
    if (spin.freeGame) {
      if (spin.lineWins.length > 0) {
        const cells = new Map<string, [number, number]>();
        let longest = 0;
        for (const w of spin.lineWins) {
          longest = Math.max(longest, w.count);
          for (const [x, y] of w.positions) cells.set(`${x},${y}`, [x, y]);
        }
        sound.spellPays(longest, spin.lineWins.length);
        await this.pulse([...cells.values()], fast ? 1000 : 1500, spin.lineWins, false, 4);
      }
      if (spin.scatterHit) await this.showLanterns(spin.scatterHit, fast);
      this.relax();
      return;
    }
    for (const win of spin.lineWins) {
      sound.line(win.line);
      await this.pulse(win.positions, fast ? 420 : 850, [win]);
      await sleep(fast ? 50 : 120);
    }
    if (spin.scatterHit) await this.showLanterns(spin.scatterHit, fast);
    this.clearShow();
  }

  /** End a show but leave the cast reels as they look until the next spin. */
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
