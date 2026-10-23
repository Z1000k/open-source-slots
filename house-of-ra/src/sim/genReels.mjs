/**
 * Generate src/engine/config/reelSets.ts from the slotopol data file.
 *
 * The strips are read straight out of slotopol/dynastyofra_data.yaml rather
 * than typed by hand, so there is no transcription to get wrong.
 * src/sim/checkReels.ts re-reads the same yaml afterwards and asserts the
 * generated TS still matches, and re-derives the free-games strips on its own.
 *
 *   node src/sim/genReels.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const YAML = resolve(here, '../../slotopol/dynastyofra_data.yaml');
const OUT = resolve(here, '../engine/config/reelSets.ts');

/**
 * The original Dynasty of Ra base strips. slotopol ships no _calc.lua for
 * dynastyofra, so the original is identified by the provider's published
 * RTP, 95.01% (the review slotopol's own source cites); this is the only set
 * within 0.5pp of it.
 */
const ORIGINAL_RTP = 95.189553;

const SUNDISC = 11;
const COBRA = 5;

/**
 * OUR free-games strips, derived from slotopol's free strips by one stated
 * rule (the reasoning is in the generated file's comment):
 *   - reels 1 and 2: slotopol's free strips unchanged;
 *   - reels 3, 4 and 5: every symbol stacked two high, except the SUN DISC
 *     and, on reel 3 only, the COBRA, which stay single;
 *   - reels 3, 4 and 5 then get a second SUN DISC at the stack boundary
 *     nearest the opposite side of the strip from the first (on a tie, the
 *     earlier boundary), never closer than 3 cells to it, so no window ever
 *     shows two.
 */
export function deriveFreeStrips(slotopolFree) {
  return slotopolFree.map((strip, k) => {
    if (k < 2) return strip.slice();
    const stacked = strip.flatMap((x) => (x === SUNDISC || (k === 2 && x === COBRA) ? [x] : [x, x]));
    return withSecondDisc(stacked);
  });
}

function withSecondDisc(strip) {
  const L = strip.length;
  const first = strip.indexOf(SUNDISC);
  const opposite = (first + L / 2) % L;
  let best = -1;
  let bestD = Infinity;
  for (let at = 1; at < L; at++) {
    if (strip[at - 1] === strip[at]) continue; // never split a stack
    const next = [...strip.slice(0, at), SUNDISC, ...strip.slice(at)];
    const discs = [];
    for (let i = 0; i < next.length; i++) if (next[i] === SUNDISC) discs.push(i);
    const gap = Math.min(discs[1] - discs[0], next.length - (discs[1] - discs[0]));
    if (gap < 3) continue;
    const d = Math.min(Math.abs(at - opposite), L - Math.abs(at - opposite));
    if (d < bestD) {
      bestD = d;
      best = at;
    }
  }
  if (best < 0) throw new Error('no room for a second SUN DISC');
  secondDiscSlots.push(best);
  return [...strip.slice(0, best), SUNDISC, ...strip.slice(best)];
}
/** where each second SUN DISC went (index into the stacked strip), for the log */
const secondDiscSlots = [];

/**
 * The yaml holds the free-games strips first (unlabelled, under the .../bon
 * key), then one labelled block per regular reel set under .../rmap.
 */
export function parseYaml(text) {
  const bonus = [];
  const sets = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const head = /^(\d+\.\d+):\s*$/.exec(line);
    if (head) {
      current = { rtp: Number(head[1]), reels: [] };
      sets.push(current);
      continue;
    }
    // dynastyofra_data.yaml ends every strip with a "# <length>" comment
    const strip = /^\s*-\s*\[([\d,\s]+)\]\s*(?:#\s*(\d+))?$/.exec(line);
    if (strip && strip[2] !== undefined) {
      const n = strip[1].split(',').length;
      if (n !== Number(strip[2])) throw new Error(`strip says ${strip[2]} symbols, holds ${n}: ${line}`);
    }
    if (strip) {
      const nums = strip[1].split(',').map((n) => Number(n.trim()));
      (current ? current.reels : bonus).push(nums);
    }
  }
  return { bonus, sets };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { bonus, sets } = parseYaml(readFileSync(YAML, 'utf8'));
  if (sets.length === 0) throw new Error('no reel sets parsed');

  const check = (reels, what) => {
    if (reels.length !== 5) throw new Error(`${what} has ${reels.length} reels, want 5`);
    for (const r of reels) {
      for (const n of r) {
        if (!Number.isInteger(n) || n < 1 || n > 11) throw new Error(`${what} has bad symbol ${n}`);
      }
    }
  };
  check(bonus, 'free set');
  for (const s of sets) check(s.reels, `set ${s.rtp}`);
  if (!sets.some((s) => s.rtp === ORIGINAL_RTP)) {
    throw new Error(`original set ${ORIGINAL_RTP} missing from the yaml`);
  }
  const free = deriveFreeStrips(bonus);
  check(free, 'our free set');

  const fmtReels = (reels, indent) => reels.map((r) => `${indent}[${r.join(', ')}],`).join('\n');

  const body = sets
    .map((s) => {
      const lens = s.reels.map((r) => r.length);
      const total = lens.reduce((a, b) => a * b, 1);
      const note =
        s.rtp === ORIGINAL_RTP
          ? `    // ORIGINAL Dynasty of Ra strips (the provider publishes 95.01%).\n` +
            `    // reels lengths [${lens.join(', ')}], reshuffles ${total}\n`
          : `    // reels lengths [${lens.join(', ')}], reshuffles ${total}\n`;
      return `  {\n${note}    rtp: ${s.rtp.toFixed(6)},\n    reels: [\n${fmtReels(s.reels, '      ')}\n    ],\n  },`;
    })
    .join('\n');

  const activeIndex = sets.findIndex((s) => s.rtp === ORIGINAL_RTP);
  const lens = (reels) => reels.map((r) => r.length);
  const total = (reels) => reels.reduce((a, r) => a * r.length, 1);

  const out = `import type { SymbolId } from '../types';
import { SYMBOL_ORDER } from '../types';

/**
 * GENERATED by src/sim/genReels.mjs from slotopol/dynastyofra_data.yaml.
 * Do not edit by hand; re-run \`npm run gen:reels\` instead, then
 * \`npm run sim:reels\` to prove the file still matches the yaml.
 *
 * Numeric symbol ids are slotopol's, 1-based, see SYMBOL_ORDER. Each rtp is
 * the label slotopol gives the set: its base game plus slotopol's OWN free
 * games, which are defective (see types.ts). This game pays the base sets
 * exactly as slotopol does (src/sim/exact.ts and src/sim/parsheet.ts
 * reproduce every base figure slotopol prints) but runs its own free games,
 * so these labels are identifiers only. The game's real RTP is GAME_RTP.
 */
const RAW: { rtp: number; reels: number[][] }[] = [
${body}
];

/**
 * slotopol's own free-games strips (.../bon), lengths [${lens(bonus).join(', ')}],
 * reshuffles ${total(bonus)}. NOT dealt by the game. The sims keep them to
 * show that slotopol's printed 509.147554% per free spin only comes out of
 * its defective scan, and that the best-way rule would make them worth
 * 918.495775%, far too much for these base strips.
 */
const SLOTOPOL_FREE_RAW: number[][] = [
${fmtReels(bonus, '  ')}
];

/**
 * OUR free-games strips, derived from slotopol's by one stated rule:
 * reels 1 and 2 unchanged; on reels 3, 4 and 5 every symbol is stacked two
 * high, except the SUN DISC and, on reel 3 only, the COBRA; and reels 3-5
 * each get a second SUN DISC at the stack boundary nearest the opposite
 * side of the strip, so the free games retrigger at close to slotopol's
 * rate. Stacking narrows how many different symbols a window shows, which
 * prices the best-way rule back to the original set's figure; the COBRA
 * exception is the one fine step that lands it there.
 * Reels lengths [${lens(free).join(', ')}], reshuffles ${total(free)}.
 */
const FREE_RAW: number[][] = [
${fmtReels(free, '  ')}
];

export interface ReelSet {
  /** slotopol's label for this set, in percent (an identifier, see above) */
  rtp: number;
  /** reels[reel] = full strip of symbols */
  reels: SymbolId[][];
}

const toSymbols = (reels: number[][]): SymbolId[][] =>
  reels.map((r) => r.map((n) => SYMBOL_ORDER[n - 1]));

export const REEL_SETS: ReelSet[] = RAW.map((s) => ({ rtp: s.rtp, reels: toSymbols(s.reels) }));

/** The free-games strips the game deals, every free game. */
export const FREE_REELS: SymbolId[][] = toSymbols(FREE_RAW);

/** slotopol's original free strips: sims only, never dealt. */
export const SLOTOPOL_FREE_REELS: SymbolId[][] = toSymbols(SLOTOPOL_FREE_RAW);

/** The original Dynasty of Ra base reels (${ORIGINAL_RTP.toFixed(6)}) - the set the game deals. */
export const ACTIVE_REELS: ReelSet = REEL_SETS[${activeIndex}];
`;

  writeFileSync(OUT, out);
  console.log(
    `wrote ${OUT}\n${sets.length} base sets, labels ${sets[0].rtp}% to ${sets[sets.length - 1].rtp}%, ` +
      `active index ${activeIndex} (${ORIGINAL_RTP}), slotopol free strips [${lens(bonus).join(', ')}], ` +
      `our free strips [${lens(free).join(', ')}], second SUN DISC slots [${secondDiscSlots.join(', ')}]`,
  );
}
