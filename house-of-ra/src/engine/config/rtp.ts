/**
 * The game's return to player in percent, 6 decimals: the original base set
 * (slotopol's 95.189553 strips, base part 65.317603%) plus OUR free games
 * (541.467507% per free game awarded). Proven by src/sim/exact.ts (factored
 * enumeration and brute force over every stop combination) and
 * src/sim/parsheet.ts (closed form), both of which fail unless they
 * reproduce this figure exactly.
 */
export const GAME_RTP = 95.182099;
