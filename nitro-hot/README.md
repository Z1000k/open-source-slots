# NITRO HOT

A classic fruit slot on three reels. 3 reels, 3 rows, 5 fixed bet lines, no wild, no scatter. Only three of the same symbol on a bet line pays. The SEVEN is the top symbol. Fill the whole screen with plums, oranges, lemons or cherries and every line win is doubled.

Play it: https://apexslots.eu/games/nitro-hot/

## Figures

| | |
|---|---|
| Layout | 3x3, 5 lines, all always active |
| RTP | 95.658244% |
| Wild | none |
| Scatter | none |
| Doubler | a full screen of one of PLUM, ORANGE, LEMON or CHERRY doubles every line win on that spin |
| Top line pay | 3 SEVEN, 150x the total bet on one line |
| Biggest single spin | 202x the total bet, a SEVEN line, a STAR line and a BAR line together, proven by enumerating every stop combination of the dealt strips |
| Full screen of a doubling fruit | 80x the total bet, all 5 lines doubled |
| Bet lines | slotopol BetLinesHot3x3 |

## Paytable

Per line bet, three of a kind only. Divide by 5 for total-bet multiples.

| Symbol | 3 | 3, full screen |
|---|---|---|
| SEVEN | 750 | |
| STAR | 200 | |
| BAR | 60 | |
| PLUM | 40 | 80 |
| ORANGE | 40 | 80 |
| LEMON | 40 | 80 |
| CHERRY | 40 | 80 |
| X | 5 | |

A line pays only when all three of its positions show the same symbol. Wins on different lines are added. When all nine positions show the same PLUM, ORANGE, LEMON or CHERRY, every line win is doubled.

## Reels

reelSets.ts holds the seven sets slotopol publishes for this game, copied from their ultrahot_data.yaml. In every set the three reels are the same strip, so each set is stored once and expanded to three. Strip lengths 37, 44, 43, 40, 43, 45 and 44, labelled 88.227746%, 90.275169%, 92.117675%, 93.0625%, 95.658244%, 97.816187% and 110.648713%. The game deals the 95.658244% set, which is the original, and that is the RTP. This folder carries no copy of the slotopol source; the strips, the paytable and the lines sit in `src/engine/config/` with the slotopol file they came from named beside them.

## How the RTP was proven

1. `npm run sim:exact`. Walks every stop combination of every set, between 50,653 and 91,125 grids each, scores each through the shipped evaluator and prints the exact RTP beside slotopol's label, with the exact hit rate, the number of doubling full screens and the biggest single spin. No sampling anywhere: the two figures must agree to the printed precision.
2. `npm run sim -- 5000000`. Monte Carlo through the real spin path on every set, which exercises the one thing enumeration cannot, the mapping from the random draw to the reel stops. It prints the seed it drew so a run can be repeated.

`npm test` runs the engine tests.

## Run it

    npm install
    npm run dev

Open http://localhost:5202. `npm run build` writes the static bundle to `dist/`. Set `GAME_BASE=/some/path/` to build for a subpath. Keys: SPACE spins, S toggles sound.

## Credits and licence

Maths ported from [slotopol/server](https://github.com/slotopol/server), game `ultrahot`, MIT, copyright schwarzlichtbezirk. Art by APEXSLOTS, CC BY 4.0; `art-src/` holds the tile's vector source. Code MIT. The licences are at the root of this repository.
