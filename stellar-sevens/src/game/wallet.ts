/**
 * Where the money lives.
 *
 * In the public demo the game deals for itself with play money. Served from
 * /play/ behind the casino login, every spin is dealt by the SERVER instead:
 * the stake is checked and taken there, the engine runs there, the win is
 * recorded there, and this module is only the messenger. REAL is the single
 * switch the rest of the game reads to know which world it is in.
 *
 * STELLAR SEVENS is stateless with no bonus, so there is never a held win,
 * never a pending round and never saved feature state.
 */
import type { RoundResult } from '../engine';

/** True when this copy of the game is being served behind the casino login. */
export const REAL: boolean = window.location.pathname.startsWith('/play/');

/**
 * Spin pressed with too little balance. On the casino floor the game sits in
 * a frame on the casino's own page, and that page shows its card for this,
 * the same card over every slot. This tells the page. Returns false when the
 * game is alone in its tab (the demo, or the bare page) and nobody is
 * listening, so the caller shows its own note instead.
 */
export function tellLowBalance(): boolean {
  if (window.parent === window) return false;
  window.parent.postMessage({ type: 'apex:low-balance' }, window.location.origin);
  return true;
}

const GAME = 'stellar-sevens';

export type PlaySpec = { type: 'base' };

export class WalletError extends Error {
  /** The server's authoritative balance, when its answer carried one. */
  readonly balanceCents?: number;
  constructor(message: string, balanceCents?: number) {
    super(message);
    this.balanceCents = balanceCents;
  }
}

export interface ServerRound {
  roundId: string;
  round: RoundResult;
  winCents: number;
  costCents: number;
  balanceCents: number;
  /** true when this answer is the recorded result of an earlier attempt */
  replay?: boolean;
}

interface SpinAnswer extends ServerRound {
  ok: boolean;
  error?: string;
}

function signedOut(): never {
  window.location.href = '/login/';
  throw new WalletError('Signed out.');
}

/** The player's balance from the casino's books. */
export async function fetchSession(): Promise<{ balanceCents: number }> {
  const res = await fetch(`/api/game/session?game=${GAME}`, { credentials: 'same-origin' });
  if (res.status === 401) signedOut();
  if (!res.ok) throw new WalletError('The casino did not answer. Try again in a moment.');
  return (await res.json()) as { balanceCents: number };
}

/**
 * One complete round, dealt by the server.
 *
 * The request carries a one-time ticket. If the connection drops mid-answer,
 * the SAME ticket is retried, and the server recognises it and returns the
 * round it already recorded rather than charging again. A double charge is
 * impossible from this side, and the server's unique index makes it
 * impossible from that side too.
 */
export async function serverSpin(spec: PlaySpec, betCents: number): Promise<ServerRound> {
  const body = JSON.stringify({ game: GAME, key: crypto.randomUUID(), betCents, play: spec });

  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await fetch('/api/game/spin', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    } catch {
      // No answer at all. Wait a beat and retry the same ticket.
      await new Promise((resolve) => setTimeout(resolve, 700));
      continue;
    }

    if (res.status === 401) signedOut();

    const data = (await res.json().catch(() => null)) as SpinAnswer | null;
    if (!data) throw new WalletError('The casino sent a broken answer. Your balance is safe.');
    if (!data.ok) throw new WalletError(data.error ?? 'The spin was refused.', data.balanceCents);
    return data;
  }

  // Honest wording: if an earlier attempt did reach the server, that round is
  // recorded and paid correctly there. What can never happen is a double
  // charge. The balance shown after the next successful sync is the truth.
  throw new WalletError('Connection lost. Your balance is safe and correct, reconnect to continue.');
}
