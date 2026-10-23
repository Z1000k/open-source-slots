/**
 * The reel machine: five columns of tiles, a classic roll with staggered
 * stops, and the win shows. Every heir that lands is announced from its reel,
 * and once two of one heir are showing, each reel still to land rolls on a
 * little longer, lit, in case a third comes. When three or more of one heir
 * call the free games the board rings them itself as the last reel lands:
 * the heirs pay nothing in the main game, and main.ts only ever shows wins.
 *
 * In the free games the heir who did not call them is crowned. As its reel
 * lands a shaft of light comes down on it and the tile turns on its axis and
 * comes back round as the MONARCH, set on velvet in a gold frame with a slow
 * glory of rays turning behind it until the next spin, and every line the
 * spin pays lights at once. A wild that doubled a line wears a gold ring
 * while the line shows. Pure presentation: every grid it lands comes from
 * the engine (demo) or the server (real), never from here.
 *
 * main.ts hands the board grids only. It reads the caller off each base grid
 * (callerOf) and shares it with the HUD through court.ts; main.ts plays every
 * free game, and only the free games, at the fast pace (board.spin(grid,
 * true)), and a free spin waits for court.hold while the HUD draws the
 * number of free games. The grids themselves stay exactly as they landed.
 */
import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Grid, Heir, LineWin, ScatterHit, SpinResult, SymbolId } from '../engine';
import { HEIRS, PAYLINES, REELS, ROWS, SYMBOL_ORDER, WILD, callerOf, otherHeir } from '../engine';
import { asset } from './assets';
import { sound } from './audio';
import { court } from './court';
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
 * A free games session runs 45 spins on average once retriggers count, so
 * those spins roll quicker than the paid ones.
 */
const FAST_ROLL = 240;
const FAST_STOP_GAP = 90;
/**
 * Two of one heir showing: each reel still to land rolls on this much longer
 * (ms), lit, while the kettledrums roll. The grid was decided before the
 * reels moved; this only stretches the wait for it.
 */
const TEASE = 620;
const FAST_TEASE = 340;
/** The coronation: the light comes down in CROWN_BEAM ms, then the tile turns in CROWN_TURN ms. */
const CROWN_BEAM = 170;
const CROWN_TURN = 240;

/** Crown gold for frames, rings and the tease, ivory for the light, crimson and velvet for the court. */
const GOLD = 0xf0c75e;
const IVORY = 0xfff4d2;
const CRIMSON = 0xd42a4c;
const VELVET = 0x6a2c91;

/** One colour per bet line, all 20 readable on the dark velvet frame. */
const LINE_COLORS = [
  0xf0c75e, 0xff4d6d, 0xfff4d2, 0x3ddc97, 0x5b8cff, 0xc77dff, 0xffa94d, 0x4fd8e0, 0xff8fab, 0xb5e655,
  0xff7a5c, 0xa9a1ff, 0xffe066, 0x2ec4b6, 0xf783ac, 0x74c0fc, 0x94d82d, 0xffc9a0, 0xe599f7, 0x8ce99a,
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
  /** two of one heir land to its left this spin: it rolls on longer, lit */
  teased: boolean;
  /** a free game and the crowned heir on this reel: it is crowned once the reel lands */
  crowns: boolean;
  onSettled?: () => void;
}

export class Board {
  readonly root = new Container();
  private readonly reels: Reel[] = [];
  /** under the tiles: the velvet and the turning glory behind a crowned heir */
  private readonly under = new Graphics();
  /** the light around a teased reel */
  private readonly glow = new Graphics();
  /** the gold frames round the crowned heirs */
  private readonly aura = new Graphics();
  /** the shaft of light coming down on an heir as it is crowned */
  private readonly beam = new Graphics();
  private readonly overlay = new Graphics();
  private readonly textures: Record<SymbolId, Texture>;
  /** the grid exactly as it last landed (a crowned heir still shows as itself here) */
  private current: Grid;
  /** the spin on the frame is a free game: the heir who did not call them is crowned */
  private free = false;
  /** crowned[x][y]: that cell shows its heir crowned, kept until the next spin rolls */
  private readonly crowned: boolean[][] = Array.from({ length: REELS }, () => new Array(ROWS).fill(false));
  private crownedCount = 0;
  /** the heirs that count as scatters this spin: both in the main game, the caller in a free game */
  private scatters: readonly Heir[] = HEIRS;
  /** heirs landed so far in the current spin, by heir, for the rising calls */
  private heirsLanded: Record<Heir, number> = { HEIRESS: 0, HEIR: 0 };
  /** the reel the tease light sits on, -1 when none */
  private teaseReel = -1;
  /** the player asked to hurry this spin: every coronation lands at once */
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
        crowns: false,
      };
      this.layout(reel);
      this.reels.push(reel);
    }
    this.current = this.reels.map((reel) => reel.syms.slice(1, ROWS + 1));

    this.root.addChild(this.glow);
    this.root.addChild(this.aura);
    this.root.addChild(this.beam);
    this.root.addChild(this.overlay);
    app.ticker.add(() => this.tick(app.ticker.deltaMS));
  }

  /** The heir crowned in the free games under way, null outside them. */
  private crownOf(): Heir | null {
    return court.caller === null ? null : otherHeir(court.caller);
  }

  /**
   * Put a grid on the frame with no animation (boot, replay restore, the last
   * grid of a skipped session). Outside a session it is a base grid and says
   * who calls; inside one its crowned heir shows crowned at once.
   */
  land(grid: Grid): void {
    this.teaseReel = -1;
    this.glow.clear();
    this.overlay.clear();
    this.beam.clear();
    this.current = grid.map((col) => col.slice());
    this.free = court.session;
    if (!court.session) court.caller = callerOf(grid);
    const crown = court.session ? this.crownOf() : null;
    this.crownedCount = 0;
    for (let x = 0; x < REELS; x++) {
      const reel = this.reels[x];
      for (let y = 0; y < ROWS; y++) {
        const crowned = crown !== null && grid[x][y] === crown;
        reel.syms[y + 1] = crowned ? WILD : grid[x][y];
        this.crowned[x][y] = crowned;
        if (crowned) this.crownedCount++;
      }
      reel.offset = 0;
      reel.crowns = false;
      for (const sprite of reel.sprites) {
        sprite.alpha = 1;
        sprite.setSize(CELL * 0.94);
      }
      this.layout(reel);
    }
    this.drawCrowned();
  }

  /**
   * Roll the reels and settle them on `grid`, left to right. In a free game
   * the crowned heir is crowned as its reel lands, and a free spin first
   * waits for the HUD to finish drawing the number of free games. A spin
   * where 3+ of one heir call (or call again) counts as done once they have
   * been rung.
   */
  spin(grid: Grid, fast = false): Promise<void> {
    if (fast && !this.primed) return court.hold.then(() => this.roll(grid, fast));
    return this.roll(grid, fast);
  }

  private roll(grid: Grid, fast: boolean): Promise<void> {
    if (!this.primed) this.prime(fast);
    const { at, fast: pace, hurried } = this.primed!;
    this.primed = null;
    if (hurried) this.hurried = true;
    this.current = grid.map((col) => col.slice());
    // a base grid says which heir, if any, calls the free games
    if (!this.free) court.caller = callerOf(grid);
    const caller = court.caller;
    const crown = this.free ? this.crownOf() : null;
    this.scatters = this.free ? (caller ? [caller] : []) : HEIRS;
    this.heirsLanded = { HEIRESS: 0, HEIR: 0 };
    const now = performance.now();
    const roll = pace ? FAST_ROLL : BASE_ROLL;
    const gap = pace ? FAST_STOP_GAP : STOP_GAP;
    const tease = pace ? FAST_TEASE : TEASE;
    const seen: Record<Heir, number> = { HEIRESS: 0, HEIR: 0 };
    let extra = 0;
    // who the last reel will ring: the base call, or the caller calling again
    const ring = this.free ? (caller && this.countOf(grid, caller) >= 3 ? caller : null) : caller;

    return new Promise<void>((resolve) => {
      let settled = 0;
      for (let x = 0; x < REELS; x++) {
        const reel = this.reels[x];
        // two of one heir already up to its left: this one makes the player wait.
        // In the main game a fourth heir adds nothing, so only the third is teased;
        // in the free games the caller pays more for every one.
        reel.teased = this.free
          ? this.scatters.some((h) => seen[h] >= 2)
          : HEIRS.some((h) => seen[h] === 2) && !HEIRS.some((h) => seen[h] >= 3);
        if (reel.teased) extra += tease;
        // a reel never stops before it has rolled; a hurried spin stops at once
        reel.stopAt = hurried ? now : Math.max(at + roll + x * gap + extra, now);
        reel.stopFeed = [grid[x][2], grid[x][1], grid[x][0]];
        reel.crowns = crown !== null && grid[x].includes(crown);
        reel.onSettled = () => {
          settled++;
          if (settled < REELS) return;
          if (ring) void this.showCall(ring, grid, pace).then(resolve);
          else resolve();
        };
        for (const h of this.scatters) if (grid[x].includes(h)) seen[h]++;
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
    this.beam.clear();
    this.clearShow();
    this.clearCrowned();
    if (fast) sound.freeSpin();
    else sound.spin();
    for (let x = 0; x < REELS; x++) {
      const reel = this.reels[x];
      reel.teased = false;
      reel.crowns = false;
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

  /** Player hit SPIN mid-roll: every reel stops on its next alignment, every coronation lands at once. */
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

  private countOf(grid: Grid, sym: SymbolId): number {
    let n = 0;
    for (const col of grid) for (const s of col) if (s === sym) n++;
    return n;
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
    // every heir that counts is announced from its reel, each one higher than the last of its kind
    const shown = reel.syms.slice(1, ROWS + 1);
    for (const h of this.scatters) if (shown.includes(h)) sound.heirLand(h, this.heirsLanded[h]++, index);
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
      if (reel.crowns) {
        reel.crowns = false;
        await this.crown(index);
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

    if (this.crownedCount > 0) this.drawGlory(now);
  }

  // ------------------------------------------------------- the coronation

  private sprite(x: number, y: number): Sprite {
    return this.reels[x].sprites[y + 1];
  }

  /**
   * The light coming down on cell (x, y): a soft gold shaft with an ivory
   * core, its head `reach` (0-1) of the way down to the tile, at `alpha`.
   */
  private drawBeam(x: number, y: number, reach: number, alpha: number): void {
    const cx = x * STEP + CELL / 2;
    const head = -12 + (y * STEP + CELL * 0.55 + 12) * reach;
    this.beam.clear();
    if (alpha <= 0) return;
    this.beam.rect(cx - CELL * 0.32, -12, CELL * 0.64, head + 12).fill({ color: GOLD, alpha: 0.13 * alpha });
    this.beam.rect(cx - CELL * 0.11, -12, CELL * 0.22, head + 12).fill({ color: IVORY, alpha: 0.32 * alpha });
    this.beam.circle(cx, head, CELL * 0.24).fill({ color: IVORY, alpha: 0.26 * alpha });
  }

  /**
   * The crowned heir on reel `x` takes the throne: the light comes down on
   * it, the tile turns on its axis and comes back round as the MONARCH, and a
   * ring of gold bursts out as it lands. A hurried spin crowns it at once.
   */
  private async crown(x: number): Promise<void> {
    const reel = this.reels[x];
    const heir = this.crownOf();
    if (heir === null) return;
    for (let y = 0; y < ROWS; y++) {
      if (reel.syms[y + 1] !== heir) continue;
      sound.crown(x);
      const s = this.sprite(x, y);
      if (!this.hurried) {
        await frames(CROWN_BEAM, (t) => this.drawBeam(x, y, 1 - (1 - t) ** 2, 1));
        let turned = false;
        const cx = x * STEP + CELL / 2;
        const cy = y * STEP + CELL / 2;
        await frames(CROWN_TURN, (t) => {
          if (!turned && t >= 0.5) {
            turned = true;
            reel.syms[y + 1] = WILD;
            s.texture = this.textures[WILD];
          }
          const face = Math.max(0.03, Math.abs(Math.cos(t * Math.PI)));
          const swell = this.hurried ? 1 : 1 + 0.14 * Math.sin(t * Math.PI);
          s.setSize(CELL * 0.94 * swell * (this.hurried ? 1 : face), CELL * 0.94 * swell);
          this.drawBeam(x, y, 1, 1 - t);
          this.beam.circle(cx, cy, CELL * (0.28 + 0.34 * t)).stroke({ width: 5 * (1 - t) + 1, color: GOLD, alpha: 0.9 * (1 - t) });
        });
      }
      reel.syms[y + 1] = WILD;
      s.texture = this.textures[WILD];
      s.setSize(CELL * 0.94);
      this.beam.clear();
      if (!this.crowned[x][y]) {
        this.crowned[x][y] = true;
        this.crownedCount++;
      }
      this.drawCrowned();
    }
  }

  /** Frame every crowned heir (or none) in gold, a crimson line inside. */
  private drawCrowned(): void {
    this.aura.clear();
    for (let x = 0; x < REELS; x++) {
      for (let y = 0; y < ROWS; y++) {
        if (!this.crowned[x][y]) continue;
        const left = x * STEP;
        const top = y * STEP;
        this.aura.roundRect(left + 3, top + 3, CELL - 6, CELL - 6, 14).stroke({ width: 5, color: GOLD, alpha: 0.95 });
        this.aura.roundRect(left + 9, top + 9, CELL - 18, CELL - 18, 10).stroke({ width: 1.5, color: CRIMSON, alpha: 0.9 });
      }
    }
    if (this.crownedCount === 0) this.under.clear();
  }

  /** The velvet under each crowned heir and the glory behind it, its rays slowly turning. */
  private drawGlory(now: number): void {
    this.under.clear();
    const turn = now / 2600;
    const shine = 0.2 + 0.06 * Math.sin(now / 320);
    const r = CELL * 0.48;
    for (let x = 0; x < REELS; x++) {
      for (let y = 0; y < ROWS; y++) {
        if (!this.crowned[x][y]) continue;
        const cx = x * STEP + CELL / 2;
        const cy = y * STEP + CELL / 2;
        this.under.roundRect(x * STEP, y * STEP, CELL, CELL, 14).fill({ color: VELVET, alpha: 0.36 });
        for (let i = 0; i < 12; i++) {
          const a = turn + (i * Math.PI) / 6;
          this.under
            .poly([cx, cy, cx + Math.cos(a - 0.1) * r, cy + Math.sin(a - 0.1) * r, cx + Math.cos(a + 0.1) * r, cy + Math.sin(a + 0.1) * r])
            .fill({ color: GOLD, alpha: shine });
        }
        this.under.circle(cx, cy, CELL * 0.2).fill({ color: IVORY, alpha: 0.12 });
      }
    }
  }

  /** No heir crowned any more: the frames, the velvet and the glory go. */
  private clearCrowned(): void {
    for (const col of this.crowned) col.fill(false);
    this.crownedCount = 0;
    this.aura.clear();
    this.under.clear();
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

  /** End a show but leave the crowned heirs as they look until the next spin. */
  private relax(): void {
    this.overlay.clear();
    for (const reel of this.reels) {
      for (const sprite of reel.sprites) {
        sprite.alpha = 1;
        sprite.setSize(CELL * 0.94);
      }
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

  /** A ring round one tile: gold for a wild that doubled, crimson for the heirs. */
  private drawRing(x: number, y: number, color: number): void {
    const cx = x * STEP + CELL / 2;
    const cy = y * STEP + CELL / 2;
    const r = CELL * 0.47;
    this.overlay.circle(cx, cy, r).stroke({ width: 5, color, alpha: 0.95 });
    this.overlay.circle(cx, cy, r + 7).stroke({ width: 2, color: color === GOLD ? IVORY : GOLD, alpha: 0.6 });
  }

  /**
   * Pulse cells for `ms`, with ribbons for `lines` and a ring of `ringColor`
   * round every cell when given. On a doubled line the wild that doubled it
   * (a MONARCH or a crowned heir) wears a gold ring.
   */
  private async pulse(
    cells: [number, number][],
    ms: number,
    lines: LineWin[] = [],
    width = 7,
    ringColor: number | null = null,
  ): Promise<void> {
    this.overlay.clear();
    for (const line of lines) this.drawLine(line, width, lines.length > 1 ? 0.75 : 0.9);
    const ringed = new Set<string>();
    for (const line of lines) {
      if (line.mult !== 2) continue;
      for (const [x, y] of line.positions) {
        const key = `${x},${y}`;
        if (ringed.has(key) || this.reels[x].syms[y + 1] !== WILD) continue;
        ringed.add(key);
        this.drawRing(x, y, GOLD);
      }
    }
    if (ringColor !== null) for (const [x, y] of cells) this.drawRing(x, y, ringColor);
    this.dim(cells);
    await tween(ms, (t) => {
      const k = 0.94 + Math.sin(t * Math.PI * 2) * 0.06;
      for (const [x, y] of cells) this.sprite(x, y).setSize(CELL * k);
    });
    for (const [x, y] of cells) this.sprite(x, y).setSize(CELL * 0.94);
  }

  /**
   * 3+ of one heir call the free games (or, in them, call again): the board
   * rings them with the herald's call before the spin counts as done, since
   * a call in the main game pays nothing and is never shown as a win.
   */
  private async showCall(heir: Heir, grid: Grid, fast: boolean): Promise<void> {
    const cells: [number, number][] = [];
    for (let x = 0; x < REELS; x++) for (let y = 0; y < ROWS; y++) if (grid[x][y] === heir) cells.push([x, y]);
    sound.call(heir, cells.length);
    await this.pulse(cells, fast || this.hurried ? 760 : 1400, [], 7, CRIMSON);
    if (this.free) this.relax();
    else this.clearShow();
  }

  /** The calling heir pays in the free games: ringed and pulsing, with the fanfare. */
  private async showHeirs(hit: ScatterHit, fast: boolean): Promise<void> {
    sound.scatter(hit.count);
    await this.pulse(hit.positions, fast ? 800 : 1300, [], 7, CRIMSON);
    await sleep(fast ? 60 : 140);
  }

  /**
   * The win show. Main game: up to three winning lines each in turn, ribbon
   * and tiles, more than that all at once. Free games: every line the spin
   * pays lights at once, then the calling heir's pay; the crowned heirs stay
   * as they are until the next spin. `fast` shortens everything for the free
   * games. Resolves when the show has played through.
   */
  async presentWins(spin: SpinResult, fast = false): Promise<void> {
    const wins = spin.lineWins;
    const doubled = wins.some((w) => w.mult === 2);
    if (wins.length > 0 && (spin.freeGame || wins.length > 3)) {
      const cells = new Map<string, [number, number]>();
      let longest = 0;
      for (const w of wins) {
        longest = Math.max(longest, w.count);
        for (const [x, y] of w.positions) cells.set(`${x},${y}`, [x, y]);
      }
      sound.lines(longest, wins.length, doubled);
      await this.pulse([...cells.values()], fast ? 1000 : 1500, wins, wins.length > 6 ? 4 : 6);
    } else {
      for (const win of wins) {
        sound.line(win.line, win.mult === 2);
        await this.pulse(win.positions, fast ? 420 : 850, [win]);
        await sleep(fast ? 50 : 120);
      }
    }
    // the heirs pay only in the free games; a call in the main game was rung as it landed
    if (spin.scatterHit && spin.scatterHit.amount > 0) await this.showHeirs(spin.scatterHit, fast);
    if (spin.freeGame) this.relax();
    else this.clearShow();
  }
}
