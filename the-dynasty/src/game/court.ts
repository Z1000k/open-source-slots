/**
 * What the board and the HUD share about the free games. main.ts is the same
 * in every slot and hands each of them only its own part, grids to the board
 * and counts to the HUD, so THE DYNASTY passes the rest here:
 *
 *   - which heir called the free games: only the base grid shows it, and the
 *     HUD's plaques and counter name that heir and the one who is crowned;
 *   - that a session is under way, so a grid landed without a roll (the last
 *     one of a skipped session) still shows its heir crowned;
 *   - the hold: the number of free games is drawn on the HUD's plaque, and a
 *     free spin only rolls once the draw has landed and the plaque has gone.
 */
import type { Heir } from '../engine';

export const court = {
  /** The heir whose free games are under way or about to start, read off the base grid that called them. */
  caller: null as Heir | null,
  /** True from the opening plaque to the closing tally. */
  session: false,
  /** Settles when the reels may roll the next free spin. */
  hold: Promise.resolve() as Promise<void>,
};
