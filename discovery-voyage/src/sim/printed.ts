/**
 * The figures slotopol printed into columbus_data.yaml as comments above
 * each block, so the sims can hold every number they compute against
 * slotopol's own, not just the RTP labels.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Printed {
  /** total reshuffles */
  total: number;
  /** symbol RTP in percent, 6 decimals */
  sym: number;
  /** free spins summed over every reshuffle, an exact integer */
  fs: number;
  /** q as printed (6 significant digits) */
  q: number;
  /** the block's RTP in percent: per free game awarded for the bonus block */
  rtp: number;
}

export const YAML = resolve(import.meta.dirname, '../../slotopol/columbus_data.yaml');

/** bonus: the unlabelled .../bon block; sets: keyed by the label, toFixed(6). */
export function readPrinted(): { bonus: Printed; sets: Map<string, Printed> } {
  let bonus: Printed | null = null;
  const sets = new Map<string, Printed>();
  let pend: Partial<Printed> = {};
  for (const line of readFileSync(YAML, 'utf8').split(/\r?\n/)) {
    let m: RegExpExecArray | null;
    if ((m = /^# reels lengths \[[^\]]*\], total reshuffles (\d+)/.exec(line))) pend.total = Number(m[1]);
    else if ((m = /^# symbols: .* = ([\d.]+)%/.exec(line))) pend.sym = Number(m[1]);
    else if ((m = /^# free spins (\d+), q = ([\d.]+),/.exec(line))) {
      pend.fs = Number(m[1]);
      pend.q = Number(m[2]);
    } else if ((m = /^# RTP = .* = ([\d.]+)%/.exec(line))) pend.rtp = Number(m[1]);
    else if ((m = /^(\d+\.\d+):\s*$/.exec(line.trimEnd()))) {
      sets.set(Number(m[1]).toFixed(6), pend as Printed);
      pend = {};
    } else if (/^- \[/.test(line) && pend.sym !== undefined && bonus === null) {
      bonus = pend as Printed;
      pend = {};
    }
  }
  if (!bonus) throw new Error(`could not read slotopol's printed bonus figures from ${YAML}`);
  return { bonus, sets };
}
