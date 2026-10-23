/**
 * The game's return to player in percent, 6 decimals: slotopol's ORIGINAL
 * 94.138004 base strips and its free-games strips, played on all 20 lines.
 *
 * Proven three ways (src/sim/exact.ts phase 1 through evaluate(), phase 2 by
 * brute force over every stop combination, src/sim/parsheet.ts in closed form
 * from the Go rules); each fails unless it reproduces this figure exactly.
 * Here it equals slotopol's own label: every line earns the same in the main
 * game and in the free games, and both heirs' free games are worth the same.
 */
export const GAME_RTP = 94.138004;
