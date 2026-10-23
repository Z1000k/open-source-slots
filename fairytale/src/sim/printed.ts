/**
 * The figures slotopol printed into fairyqueen_data.yaml as comments, so the
 * sims can hold every number they compute against slotopol's own, not just
 * the RTP labels:
 *
 *   - one block per expanding symbol (RTP[es], 6 decimals; where it can
 *     retrigger also the lined/scatter split, the integer free spins count
 *     and q),
 *   - the free-games summary (pool-averaged q, sq and RTPfs, 6 decimals),
 *   - one block per base set (reshuffles, symbols 6 decimals, integer free
 *     spins, q, and the label).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface PrintedEs {
  /** RTP[es] in percent, 6 decimals: the expected win of one free game with this symbol drawn */
  rtp: number;
  /** printed only when the symbol can retrigger: free spins summed over every reshuffle */
  fs?: number;
  /** lined and scatter parts, 5 significant digits, printed with fs */
  lined?: number;
  scat?: number;
}

export interface PrintedSet {
  total: number;
  /** symbol RTP in percent, 6 decimals */
  sym: number;
  /** lined and scatter parts, 5 significant digits */
  lined: number;
  scat: number;
  /** free spins summed over every reshuffle, an exact integer */
  fs: number;
  /** q as printed (5 significant digits) */
  q: number;
  /** the set's RTP in percent (also its label) */
  rtp: number;
}

export interface Printed {
  es: Map<number, PrintedEs>;
  /** pool-averaged free spins per free game (5 significant digits) */
  qfs: number;
  /** RTP per free game awarded, retriggers included, percent, 6 decimals */
  rtpfs: number;
  /** pool-averaged RTP of one free game, percent, 5 significant digits */
  rtpsym: number;
  sets: Map<string, PrintedSet>;
}

export const YAML = resolve(import.meta.dirname, '../../slotopol/fairyqueen_data.yaml');

export function readPrinted(): Printed {
  const es = new Map<number, PrintedEs>();
  const sets = new Map<string, PrintedSet>();
  let qfs = NaN;
  let rtpfs = NaN;
  let rtpsym = NaN;
  let curEs = 0;
  let pendEs: Partial<PrintedEs> = {};
  let pend: Partial<PrintedSet> = {};
  for (const raw of readFileSync(YAML, 'utf8').split(/\r?\n/)) {
    const line = raw.trimEnd();
    let m: RegExpExecArray | null;
    if ((m = /^# \*calculations for expanding symbol \[(\d+)\]\*$/.exec(line))) {
      curEs = Number(m[1]);
      pendEs = {};
    } else if ((m = /^# RTP\[(\d+)\] = ([\d.]+)%$/.exec(line))) {
      if (Number(m[1]) !== curEs) throw new Error(`RTP[${m[1]}] inside the block of symbol ${curEs}`);
      es.set(curEs, { ...pendEs, rtp: Number(m[2]) } as PrintedEs);
      curEs = 0;
    } else if ((m = /^# free spins: q = ([\d.]+), sq = /.exec(line))) {
      qfs = Number(m[1]);
    } else if ((m = /^# RTPfs = sq\*rtp\(sym\) = [\d.]+\*([\d.]+) = ([\d.]+)%$/.exec(line))) {
      rtpsym = Number(m[1]);
      rtpfs = Number(m[2]);
    } else if ((m = /^# reels lengths \[[^\]]*\], total reshuffles (\d+)$/.exec(line))) {
      pend.total = Number(m[1]);
    } else if ((m = /^# symbols: ([\d.e+-]+)\(lined\) \+ ([\d.e+-]+)\(scatter\) = ([\d.]+)%$/.exec(line))) {
      if (curEs) {
        pendEs.lined = Number(m[1]);
        pendEs.scat = Number(m[2]);
      } else {
        pend.lined = Number(m[1]);
        pend.scat = Number(m[2]);
        pend.sym = Number(m[3]);
      }
    } else if ((m = /^# free spins (\d+), q = ([\d.]+),/.exec(line))) {
      if (curEs) pendEs.fs = Number(m[1]);
      else {
        pend.fs = Number(m[1]);
        pend.q = Number(m[2]);
      }
    } else if ((m = /^# RTP = .* = ([\d.]+)%$/.exec(line))) {
      pend.rtp = Number(m[1]);
    } else if ((m = /^(\d+\.\d+):\s*$/.exec(line))) {
      const label = Number(m[1]).toFixed(6);
      if (pend.total === undefined || pend.sym === undefined || pend.fs === undefined || pend.rtp === undefined) {
        throw new Error(`set ${label}: printed block incomplete`);
      }
      sets.set(label, pend as PrintedSet);
      pend = {};
    }
  }
  if (es.size === 0 || Number.isNaN(rtpfs) || Number.isNaN(qfs)) {
    throw new Error(`could not read slotopol's printed free-games figures from ${YAML}`);
  }
  return { es, qfs, rtpfs, rtpsym, sets };
}
