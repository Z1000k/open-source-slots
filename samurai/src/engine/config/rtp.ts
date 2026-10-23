/**
 * The game's return to player in percent, 6 decimals: slotopol's ORIGINAL
 * 95.385457 base strips and its free-games strips, played on all 20 lines.
 *
 * It sits 0.003328pp above slotopol's label for the set because slotopol
 * printed katana_data.yaml from a one-line scan (Sel = 1, the middle row).
 * In the base game that changes nothing (every line earns the same), but in
 * the free games a SAMURAI one row off a line still turns the reel wild for
 * it, so the line shapes earn different amounts, and the 20-line average is
 * a little above the middle line's. Nothing was retuned: same reels, same
 * rules. Proven by src/sim/exact.ts (exact enumeration, slotopol's one-line
 * figures reproduced to 6 decimals and the 20-line game; brute force over
 * every stop combination) and src/sim/parsheet.ts (closed form), both of
 * which fail unless they reproduce this figure exactly.
 */
export const GAME_RTP = 95.388785;
