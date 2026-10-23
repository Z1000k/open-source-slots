/**
 * One-off transcription check: compare the reel strips in reelSets.ts against
 * slotopol's bookofra_data.yaml (copy it to the project root first). Order in
 * the yaml: 5 bonus rows, then 7 sets x 5 rows in ascending-RTP order.
 */
import { readFileSync } from 'node:fs';
import { REEL_SETS, BONUS_REELS } from '../engine/config/reelSets';
import { SYMBOL_ORDER, type SymbolId } from '../engine/types';

const yaml = readFileSync('bookofra_data.yaml', 'utf8');
const rows: number[][] = [];
for (const line of yaml.split('\n')) {
  const m = line.match(/^\s*-\s*\[(.+)\]\s*$/);
  if (m) rows.push(m[1].split(',').map((s) => parseInt(s.trim(), 10)));
}
console.log(`yaml rows parsed: ${rows.length} (expect 40)`);

const toNum = (reels: SymbolId[][]) => reels.map((r) => r.map((s) => SYMBOL_ORDER.indexOf(s) + 1));

const expected = [
  { name: 'bonus', reels: rows.slice(0, 5) },
  ...REEL_SETS.map((s, i) => ({ name: `set ${s.rtp}`, reels: rows.slice(5 + i * 5, 10 + i * 5) })),
];
const actual = [
  { name: 'bonus', reels: toNum(BONUS_REELS) },
  ...REEL_SETS.map((s) => ({ name: `set ${s.rtp}`, reels: toNum(s.reels) })),
];

let bad = 0;
for (let i = 0; i < expected.length; i++) {
  for (let r = 0; r < 5; r++) {
    const e = expected[i].reels[r];
    const a = actual[i].reels[r];
    if (e.length !== a.length || e.some((v, j) => v !== a[j])) {
      bad++;
      console.log(`MISMATCH ${expected[i].name} reel ${r + 1}:`);
      console.log(`  yaml (${e.length}): ${e.join(',')}`);
      console.log(`  ts   (${a.length}): ${a.join(',')}`);
    }
  }
}
console.log(bad === 0 ? 'ALL REELS MATCH the slotopol yaml exactly.' : `${bad} mismatched strips`);
