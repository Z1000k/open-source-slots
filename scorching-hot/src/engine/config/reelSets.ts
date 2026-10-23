import type { SymbolId } from '../types';
import { SYMBOL_ORDER } from '../types';

/**
 * Reel strips copied verbatim from slotopol/server sizzlinghot_data.yaml
 * (numeric symbol ids, 1-based; see SYMBOL_ORDER). Each set's RTP is the
 * figure slotopol publishes for it — verified by our own sims, see src/sim/.
 */
const RAW: { rtp: number; reels: number[][] }[] = [
  {
    // reels lengths [25 x5], RTP = 87.79(lined) + 6.0024(scatter) = 93.791949%
    rtp: 93.791949,
    reels: [
      [1, 4, 4, 4, 3, 3, 3, 8, 6, 6, 6, 7, 7, 7, 6, 6, 6, 2, 2, 5, 2, 5, 5, 5, 4],
      [1, 6, 6, 6, 2, 2, 1, 2, 7, 7, 7, 7, 8, 4, 4, 4, 4, 5, 5, 5, 3, 5, 3, 3, 6],
      [1, 6, 7, 7, 7, 8, 5, 5, 5, 1, 5, 2, 2, 4, 2, 4, 4, 4, 3, 3, 7, 3, 6, 6, 6],
      [1, 5, 5, 5, 5, 1, 5, 4, 4, 4, 8, 3, 3, 6, 6, 6, 7, 6, 7, 7, 7, 4, 4, 2, 2],
      [1, 4, 4, 6, 6, 6, 2, 2, 5, 8, 5, 5, 5, 8, 5, 4, 4, 4, 6, 6, 7, 7, 7, 3, 3],
    ],
  },
  {
    // Original reels. lengths [25 x5], RTP = 89.653(lined) + 6.0024(scatter) = 95.655629%
    rtp: 95.655629,
    reels: [
      [1, 4, 4, 4, 3, 1, 3, 3, 8, 6, 6, 6, 7, 7, 7, 6, 6, 2, 2, 5, 2, 5, 5, 5, 4],
      [1, 6, 6, 6, 2, 2, 1, 2, 7, 7, 7, 7, 8, 4, 4, 4, 4, 5, 5, 5, 3, 5, 3, 3, 6],
      [1, 6, 7, 7, 7, 8, 5, 5, 5, 1, 5, 2, 2, 4, 2, 4, 4, 4, 3, 3, 7, 3, 6, 6, 6],
      [1, 5, 5, 5, 5, 1, 5, 4, 4, 4, 8, 3, 3, 6, 6, 6, 7, 6, 7, 7, 7, 4, 4, 2, 2],
      [1, 4, 4, 6, 6, 6, 2, 2, 5, 8, 5, 5, 5, 8, 5, 4, 4, 4, 6, 1, 7, 7, 7, 3, 3],
    ],
  },
  {
    // reels lengths [39 x5], RTP = 91.073(lined) + 8.0152(scatter) = 99.088693%
    rtp: 99.088693,
    reels: [
      [5, 5, 5, 2, 7, 1, 6, 3, 3, 3, 6, 6, 6, 5, 3, 4, 5, 4, 4, 4, 1, 6, 7, 3, 7, 1, 4, 7, 7, 7, 2, 8, 2, 2, 2, 5, 6, 4, 8],
      [6, 7, 5, 4, 1, 7, 7, 7, 6, 8, 2, 3, 3, 3, 8, 1, 4, 4, 4, 3, 5, 6, 5, 2, 2, 2, 7, 1, 5, 5, 5, 4, 7, 4, 2, 6, 6, 6, 3],
      [3, 3, 3, 2, 7, 4, 4, 7, 5, 5, 5, 6, 6, 6, 8, 3, 1, 5, 7, 8, 5, 1, 2, 4, 1, 3, 7, 7, 7, 5, 6, 6, 6, 4, 4, 4, 2, 2, 2],
      [5, 2, 2, 2, 6, 6, 6, 7, 4, 4, 4, 8, 2, 1, 7, 8, 5, 5, 5, 1, 3, 6, 3, 4, 7, 7, 7, 4, 5, 7, 3, 3, 3, 2, 6, 1, 4, 5, 6],
      [7, 7, 7, 4, 2, 5, 3, 6, 6, 6, 5, 7, 5, 7, 1, 3, 4, 4, 2, 2, 2, 1, 4, 4, 4, 8, 2, 6, 7, 3, 3, 3, 6, 1, 6, 8, 5, 5, 5],
    ],
  },
];

export interface ReelSet {
  /** the RTP slotopol publishes for this set, in percent */
  rtp: number;
  /** reels[reel] = full strip of symbols */
  reels: SymbolId[][];
}

export const REEL_SETS: ReelSet[] = RAW.map((s) => ({
  rtp: s.rtp,
  reels: s.reels.map((reel) => reel.map((n) => SYMBOL_ORDER[n - 1])),
}));

/** The original Sizzling Hot reels (95.655629%) — the default the game deals. */
export const ACTIVE_REELS: ReelSet = REEL_SETS[1];
