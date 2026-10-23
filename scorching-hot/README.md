# SCORCHING HOT

A classic fruit slot. 5 reels, 3 rows, 5 fixed bet lines, no wild, no free games. The SEVEN is the top symbol, the CHERRY pays from 2 in a row, and the STAR is the scatter: three or more anywhere pay the total bet on top of whatever the lines pay.

Play it: https://apexslots.eu/games/scorching-hot/

## Figures

| | |
|---|---|
| Layout | 5x3, 5 lines, all always active |
| RTP | 95.655629% (slotopol prints it as 89.653% on the lines plus 6.0024% from the stars) |
| Wild | none |
| Scatter | STAR, 3 or more anywhere, pays the total bet |
| Free games | none |
| Top line pay | 5 SEVEN, 1000x the total bet on one line |
| Paytable maximum | 5000x the total bet, a full screen of SEVENS paying all 5 lines, the figure the game's info screen states |
| Bet lines | the first 5 of slotopol BetLinesNvm10 |

## Paytable

Per line bet, runs 2/3/4/5. Divide by 5 for total-bet multiples.

| Symbol | 2 | 3 | 4 | 5 |
|---|---|---|---|---|
| SEVEN | | 100 | 1000 | 5000 |
| MELON | | 50 | 200 | 500 |
| GRAPES | | 50 | 200 | 500 |
| PLUM | | 20 | 50 | 200 |
| ORANGE | | 20 | 50 | 200 |
| LEMON | | 20 | 50 | 200 |
| CHERRY | 5 | 20 | 50 | 200 |

A line pays as its first symbol for as far as that symbol reaches from the left. Only the longest match on each line pays. Wins on different lines are added. The STAR never pays on a line and ends a run.

Scatter pay, total-bet multiples: 3 STARS 2x, 4 STARS 10x, 5 STARS 50x, added to any line win.

## Reels

reelSets.ts holds the three sets slotopol publishes for this game, copied from their sizzlinghot_data.yaml: two on 25-symbol strips, labelled 93.791949% and 95.655629%, and one on 39-symbol strips, labelled 99.088693%. The game deals the 95.655629% set, which is the original, and that is the RTP. This folder carries no copy of the slotopol source; the strips, the paytable and the lines sit in `src/engine/config/` with the slotopol file they came from named beside them.

## How the RTP was proven

1. `npm run sim:exact`. Walks every stop combination of every set, 9,765,625 grids on the 25-symbol strips and 90,224,199 on the 39-symbol strips, scores each through the shipped evaluator and prints the exact RTP beside slotopol's label, split into the lines and the stars, with the exact hit rate. No sampling anywhere: the two figures must agree to the printed precision.
2. `npm run sim -- 5000000`. Monte Carlo through the real spin path on every set, which exercises the one thing enumeration cannot, the mapping from the random draw to the reel stops. It prints the seed it drew so a run can be repeated.

`npm test` runs the engine tests.

## Run it

    npm install
    npm run dev

Open http://localhost:5201. `npm run build` writes the static bundle to `dist/`. Set `GAME_BASE=/some/path/` to build for a subpath. Keys: SPACE spins, S toggles sound.

## Credits and licence

Maths ported from [slotopol/server](https://github.com/slotopol/server), game `sizzlinghot`, MIT, copyright schwarzlichtbezirk. Art by APEXSLOTS, CC BY 4.0; `art-src/` holds the tile's vector source. Code MIT. The licences are at the root of this repository.
