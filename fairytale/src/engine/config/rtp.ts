/**
 * The game's return to player in percent, 6 decimals: the ACTIVE base set
 * (slotopol's 95.566989 strips, base part 54.040105%) plus the free games
 * (1027.224599% per free game awarded), which is exactly slotopol's label
 * for the set. Proven by src/sim/exact.ts (exact enumeration and brute force
 * over every stop combination) and src/sim/parsheet.ts (closed form), both
 * of which fail unless they reproduce this figure exactly.
 */
export const GAME_RTP = 95.566989;
