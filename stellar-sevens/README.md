# STELLAR SEVENS

A classic fruit slot on three reels. 3 reels, 3 rows, 5 fixed bet lines, no wild, no scatter, no free games. Only three of the same symbol on a bet line pays, and every symbol pays the same way. The SEVEN is the top symbol, and a full screen of them fills all five lines for the top win.

Play it: https://apexslots.eu/games/stellar-sevens/

## Figures

| | |
|---|---|
| Layout | 3x3, 5 lines, all always active |
| RTP | 95.504233% |
| Wild | none |
| Scatter | none |
| Hit rate | about 1 in 35 spins pays something, measured over 50,000,000 Monte Carlo spins; `npm run sim:exact` prints the exact figure |
| Top line pay | 3 SEVEN, 60x the total bet on one line |
| Biggest single spin | 300x the total bet, a full screen of SEVENs paying all 5 lines, proven by enumerating every stop combination of the dealt strips |
| Bet lines | slotopol BetLinesHot3x3 |

## Paytable

Per line bet, three of a kind only. Divide by 5 for total-bet multiples; every entry is a multiple of 5 so the result is whole.

| Symbol | 3 | Total-bet multiple |
|---|---|---|
| SEVEN | 300 | 60x |
| STAR | 200 | 40x |
| MELON | 100 | 20x |
| GRAPES | 80 | 16x |
| BELL | 80 | 16x |
| ORANGE | 40 | 8x |
| PLUM | 40 | 8x |
| LEMON | 40 | 8x |
| CHERRY | 40 | 8x |

A line pays only when all three of its positions show the same symbol. Wins on different lines are added. There is no doubler, no multiplier and nothing carried from one spin to the next.

## Reels

reelSets.ts is generated from slotopol/alwayshot_data.yaml by `npm run gen:reels` and holds every set slotopol publishes for this game, labelled from 87.328582% to 110.124183%. In every set the three reels are the same strip, so each set is stored once and expanded to three. The game deals the 95.504233% set, which is the original the slotopol par sheet ships with, and that is the RTP.

The dealt strip is 46 symbols long: 4 SEVEN, 4 STAR, 4 MELON, 5 GRAPES, 5 BELL, 6 ORANGE, 6 PLUM, 6 LEMON, 6 CHERRY, so 97,336 stop combinations. Because every reel is the same strip and every line takes one position from each reel, a line pays a symbol with probability its count cubed over 97,336, and the RTP is the sum of count cubed times line pay over 97,336: 92,960 over 97,336, which is 95.504233%. That is the whole of slotopol's alwayshot_calc.lua, and the two proofs below reach the same figure without using it.

`npm run sim:reels` re-reads the yaml on its own and proves the shipped strips still match it symbol for symbol.

## How the RTP was proven

1. `npm run sim:exact`. Walks every stop combination of every set, between 68,921 and 132,651 grids each, scores each through the shipped evaluator and prints the exact RTP beside slotopol's label to 6 decimals, with the exact hit rate and the biggest single spin. No sampling anywhere. It exits non-zero unless every set matches.
2. `npm run sim`. Monte Carlo through the real spin path on every set, which exercises the one thing enumeration cannot, the mapping from the random draw to the reel stops. 5,000,000 spins by default, `npm run sim -- 50000000` for more. It prints the seed it drew so a run can be repeated.
3. `npm run sim:reels`. Parses slotopol's yaml independently of the generator and compares every strip of every set against the file that ships. It exits non-zero on any difference.

`npm test` runs the engine tests, which include the full enumeration of the dealt set.

## Run it

    npm install
    npm run dev

Open http://localhost:5205. `npm run build` writes the static bundle to `dist/`. Set `GAME_BASE=/some/path/` to build for a subpath. Keys: SPACE spins, S toggles sound.

## Credits and licence

Maths ported from [slotopol/server](https://github.com/slotopol/server), game `alwayshot`, MIT, copyright schwarzlichtbezirk. Their source, data and par sheet sit in `slotopol/` with their licence. Art by APEXSLOTS, CC BY 4.0; `art-src/` holds the tile's vector source. Code MIT. The licences are at the root of this repository.
