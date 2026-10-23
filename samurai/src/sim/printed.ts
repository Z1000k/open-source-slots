/**
 * The figures slotopol printed into katana_data.yaml as comments, so the sims
 * can hold every number they compute against slotopol's own, not just the
 * RTP labels:
 *
 *   - the free-games block (.../bon): reshuffles, lined and scatter parts,
 *     symbols to 6 decimals, the integer free spins, q, sq and the RTP per
 *     free game awarded;
 *   - one block per base set (.../rmap): the same, ending in the set's RTP,
 *     which is also its label;
 *   - the "RTP list of available reels" at the top of .../rmap.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface PrintedBlock {
  lens: number[];
  total: number;
  /** lined and scatter parts in percent, 5 significant digits */
  lined: number;
  scat: number;
  /** symbol RTP in percent, 6 decimals */
  sym: number;
  /** free spins summed over every reshuffle, an exact integer */
  fs: number;
  /** q as printed (5 significant digits) */
  q: number;
  /** sq = 1/(1-q) as printed (6 decimals) */
  sq: number;
  /** RTP in percent, 6 decimals: per free game awarded for .../bon, the set's RTP (its label) for .../rmap */
  rtp: number;
}

export interface Printed {
  bon: PrintedBlock;
  sets: Map<string, PrintedBlock>;
  /** the RTP list printed at the top of .../rmap, 6 decimals */
  list: string[];
}

export const YAML = resolve(import.meta.dirname, '../../slotopol/katana_data.yaml');

export function readPrinted(): Printed {
  const sets = new Map<string, PrintedBlock>();
  const list: string[] = [];
  let bon: PrintedBlock | null = null;
  let section = '';
  let inList = false;
  let pend: Partial<PrintedBlock> = {};
  const complete = (b: Partial<PrintedBlock>, what: string): PrintedBlock => {
    for (const k of ['lens', 'total', 'lined', 'scat', 'sym', 'fs', 'q', 'sq', 'rtp'] as const) {
      if (b[k] === undefined) throw new Error(`${what}: printed block has no ${k}`);
    }
    return b as PrintedBlock;
  };
  for (const raw of readFileSync(YAML, 'utf8').split(/\r?\n/)) {
    const line = raw.trimEnd();
    let m: RegExpExecArray | null;
    if ((m = /^novomatic\/katana\/(\w+)$/.exec(line))) {
      section = m[1];
      pend = {};
    } else if (line === '# RTP list of available reels:') {
      inList = true;
    } else if (inList && (m = /^# (\d+\.\d+)$/.exec(line))) {
      list.push(Number(m[1]).toFixed(6));
    } else if ((m = /^# reels lengths \[([\d,\s]+)\], total reshuffles (\d+)$/.exec(line))) {
      inList = false;
      pend.lens = m[1].split(',').map((n) => Number(n.trim()));
      pend.total = Number(m[2]);
    } else if ((m = /^# symbols: ([\d.e+-]+)\(lined\) \+ ([\d.e+-]+)\(scatter\) = ([\d.]+)%$/.exec(line))) {
      pend.lined = Number(m[1]);
      pend.scat = Number(m[2]);
      pend.sym = Number(m[3]);
    } else if ((m = /^# free spins (\d+), q = ([\d.]+), sq = 1\/\(1-q\) = ([\d.]+)$/.exec(line))) {
      pend.fs = Number(m[1]);
      pend.q = Number(m[2]);
      pend.sq = Number(m[3]);
    } else if ((m = /^# RTP = .* = ([\d.]+)%$/.exec(line))) {
      pend.rtp = Number(m[1]);
      if (section === 'bon') {
        if (bon) throw new Error('two free-games blocks in the yaml');
        bon = complete(pend, 'bon');
        pend = {};
      }
    } else if (section === 'rmap' && (m = /^(\d+\.\d+):\s*$/.exec(line))) {
      const label = Number(m[1]).toFixed(6);
      sets.set(label, complete(pend, `set ${label}`));
      pend = {};
    }
  }
  if (!bon || sets.size === 0) throw new Error(`could not read slotopol's printed figures from ${YAML}`);
  return { bon, sets, list };
}
