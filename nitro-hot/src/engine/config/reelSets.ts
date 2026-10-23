import type { SymbolId } from '../types';
import { SYMBOL_ORDER } from '../types';

/**
 * Reel strips copied verbatim from slotopol/server ultrahot_data.yaml
 * (numeric symbol ids, 1-based; see SYMBOL_ORDER). In the yaml all three
 * reels of every set are the SAME strip, so each set is stored once here and
 * expanded to three. Each set's RTP is the figure slotopol publishes for it —
 * verified by our own sims, see src/sim/.
 */
const RAW: { rtp: number; strip: number[] }[] = [
  {
    // strip length 37, reshuffles 37^3 = 50653
    rtp: 88.227746,
    strip: [8, 8, 8, 1, 6, 6, 6, 4, 4, 4, 7, 7, 7, 2, 8, 8, 8, 2, 3, 3, 3, 6, 6, 6, 2, 5, 5, 5, 4, 4, 4, 7, 7, 7, 5, 5, 5],
  },
  {
    // strip length 44, reshuffles 44^3 = 85184
    rtp: 90.275169,
    strip: [8, 8, 8, 6, 6, 6, 1, 3, 2, 4, 4, 4, 7, 7, 7, 2, 8, 8, 8, 3, 3, 3, 6, 6, 6, 2, 5, 5, 5, 4, 4, 4, 7, 7, 7, 1, 2, 8, 3, 8, 5, 5, 5, 2],
  },
  {
    // strip length 43, reshuffles 43^3 = 79507
    rtp: 92.117675,
    strip: [8, 8, 8, 6, 6, 6, 1, 3, 2, 4, 4, 4, 7, 7, 7, 2, 8, 8, 8, 3, 3, 3, 6, 6, 6, 2, 5, 5, 5, 4, 4, 4, 7, 7, 7, 1, 2, 8, 8, 5, 5, 5, 2],
  },
  {
    // strip length 40, reshuffles 40^3 = 64000
    rtp: 93.0625,
    strip: [8, 8, 8, 6, 6, 6, 1, 3, 2, 4, 4, 4, 7, 7, 7, 2, 8, 8, 8, 3, 3, 3, 6, 6, 6, 2, 5, 5, 5, 4, 4, 4, 7, 7, 7, 1, 2, 5, 5, 5],
  },
  {
    // Original reels (same 95.65x% figure slotopol gives the original
    // Sizzling Hot strips). strip length 43, reshuffles 43^3 = 79507
    rtp: 95.658244,
    strip: [8, 8, 8, 6, 6, 6, 1, 3, 2, 4, 4, 4, 7, 7, 7, 2, 8, 8, 8, 3, 3, 3, 6, 6, 6, 2, 5, 5, 5, 4, 4, 4, 7, 7, 7, 1, 2, 8, 3, 5, 5, 5, 2],
  },
  {
    // strip length 45, reshuffles 45^3 = 91125
    rtp: 97.816187,
    strip: [8, 8, 8, 6, 6, 6, 1, 3, 2, 4, 4, 4, 7, 7, 7, 2, 8, 8, 8, 3, 3, 3, 6, 6, 6, 2, 5, 5, 5, 4, 4, 4, 7, 7, 7, 1, 2, 8, 3, 3, 3, 5, 5, 5, 2],
  },
  {
    // strip length 44, reshuffles 44^3 = 85184
    rtp: 110.648713,
    strip: [8, 8, 8, 6, 6, 6, 1, 3, 2, 4, 4, 4, 7, 7, 7, 2, 8, 8, 8, 3, 3, 3, 6, 6, 6, 2, 5, 5, 5, 4, 4, 4, 7, 7, 7, 1, 2, 8, 3, 2, 5, 5, 5, 2],
  },
];

export interface ReelSet {
  /** the RTP slotopol publishes for this set, in percent */
  rtp: number;
  /** reels[reel] = full strip of symbols; all three reels are identical */
  reels: SymbolId[][];
}

export const REEL_SETS: ReelSet[] = RAW.map((s) => {
  const strip = s.strip.map((n) => SYMBOL_ORDER[n - 1]);
  return { rtp: s.rtp, reels: [strip, strip, strip] };
});

/** The original Ultra Hot reels (95.658244%) — the default the game deals. */
export const ACTIVE_REELS: ReelSet = REEL_SETS[4];
