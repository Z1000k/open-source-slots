# BUMPER CROP

A farm slot with avalanches and a ladder bonus. 5 reels, 3 rows, 25 fixed bet lines. The SCARECROW is wild and the top symbol: it joins any run from the left and pays on its own from 3 in a row. Every winning symbol is harvested and leaves the field, whatever sat above falls into the gap, fresh symbols drop in from the strip above the window, and the new field is paid again for as long as it pays. The TRACTOR is the scatter: three or more anywhere pay the total bet and open the barn ladder, five floors of crates turned over one at a time, with prizes, multipliers and a spilled bucket that ends it. Tractors can land on any fall, so one spin can open the ladder more than once.

Play it: https://apexslots.eu/games/bumper-crop/

## Figures

| | |
|---|---|
| Layout | 5x3, 25 lines, all always active |
| RTP | 95.548865% (symbols with their avalanches 67.462352%, of which 64.246470% on the lines and 3.215882% from the tractors; the barn ladder 28.086514%) |
| Wild | SCARECROW. Substitutes for every symbol except the TRACTOR, pays on its own from 3 in a row, never doubles |
| Scatter | TRACTOR, 3 or more anywhere, pays the total bet and opens the ladder |
| Barn ladder | priced at 50x the total bet per ladder (slotopol's Ebon), opened once in 178.02 paid spins, biggest possible ladder 688x |
| Avalanche | total pays are 1.199 times the pays of the opening grids alone (slotopol's Mcascade); the chain counters slotopol prints are reproduced exactly |
| Hit rate | 1 in 3.44 spins pays something |
| Top line pay | 5 SCARECROW, 200x the total bet on one line |
| Biggest symbol round | 229x the total bet, avalanches included, ladder excluded, by enumerating every stop of the dealt strips |
| Bet lines | slotopol BetLinesNvm5x3v3 |

## Paytable

Per line bet, runs 3/4/5. Nothing pays for fewer than 3. Divide by 25 for total-bet multiples.

| Symbol | 3 | 4 | 5 |
|---|---|---|---|
| SCARECROW (wild) | 100 | 750 | 5000 |
| COW | 75 | 300 | 1000 |
| RAM | 50 | 150 | 500 |
| PIG | 50 | 150 | 500 |
| RABBIT | 30 | 100 | 300 |
| ROOSTER | 30 | 100 | 300 |
| ACE | 15 | 75 | 200 |
| KING | 15 | 75 | 200 |
| QUEEN | 10 | 50 | 150 |
| JACK | 10 | 50 | 150 |
| TEN | 5 | 25 | 75 |
| NINE | 5 | 25 | 75 |

A line pays whichever is worth more: the SCARECROW's own run or the run it completes, never both. Only the longest match on each line pays. Wins on different lines are added, and every fall of the avalanche is added to the round.

Scatter pay, total-bet multiples: 3 TRACTORS 5x, 4 TRACTORS 20x, 5 TRACTORS 200x, added to the line wins and kept when the ladder opens. That is how slotopol's own figures for this game are made up.

## The barn ladder

Five floors of face-down crates, each floor shuffled, turned over one at a time from the left. A plain crate adds its prize and you keep turning on the same floor. A golden crate adds its prize and lifts you a floor. A golden multiplier crate adds 1 to the multiplier and lifts you a floor. The spilled bucket ends the ladder. Everything collected is paid at the end, multiplied by the multiplier. Values in total-bet multiples.

| Floor | Crates | Prize values |
|---|---|---|
| 1 | 3 plain prizes, 3 golden prizes, no bucket, so every ladder reaches floor 2 | 2, 2, 3, 4, 5, 6, 8, 10 or 14 |
| 2 | 2 plain prizes, 1 golden prize, 1 multiplier, 1 bucket | 2, 2, 3, 4, 5, 6, 8, 10 or 14 |
| 3 | 1 plain prize, 1 golden prize, 1 multiplier, 1 bucket | 2, 2, 3, 4, 5, 6, 8, 10 or 14 |
| 4 | 1 prize, 1 multiplier, 1 bucket | 14, 14, 20 or 24 |
| 5 | 1 prize, 1 bucket | 20, 24, 40 or 50 |

The ladder is ported from slotopol's farm.go with one stated reading. Their Calc() subtracts the value of a climbing prize crate, which contradicts their own Cell.Pay() accessor two functions above it and would make the ladder worth far less than the 50x their published RTP table is built on. The game adds it, which is the only reading that reproduces their table, and `npm run sim:bonus` measures that back.

## Reels

reelSets.ts is generated from slotopol/cashfarm_data.yaml by `npm run gen:reels` and holds every set slotopol publishes, each with the figures slotopol printed beside it. The game deals the set slotopol labels 95.548865%, and that is the RTP: the exact proof reproduces the label and every one of those printed figures. Strips 37 symbols long on every reel, 69,343,957 stop combinations. `npm run sim:reels` re-reads the yaml and proves the shipped strips still match it.

## How the RTP was proven

1. `npm run sim:exact`. Full enumeration. Once the five reels stop, the whole avalanche that follows is fixed, so walking every stop combination of a set gives the symbol return with no sampling at all. For every set it reproduces what slotopol printed into the yaml: the symbol return, the ladder hit rate, the ladder return at 50x per ladder, the total, the cascade counters at every fall level, the mean cascade and the longest chain. It exits non-zero unless every set matches. `npm run sim:exact 95.548865` runs the dealt set alone.
2. `npm run sim:bonus`. The ladder on its own, 20,000,000 ladders with a fixed seed, measured against slotopol's 50x per ladder, with the floors reached and the multipliers drawn.
3. `npm run sim`. Monte Carlo through the real round path, 20,000,000 rounds on the dealt set, avalanches and ladders included, with xoshiro128** as the generator; the shipped mulberry32 is too short for runs of that length. Prints the return split into symbols and ladder beside the exact figures.

`npm test` runs the engine tests.

## Run it

    npm install
    npm run dev

Open http://localhost:5204. `npm run build` writes the static bundle to `dist/`. Set `GAME_BASE=/some/path/` to build for a subpath. Keys: SPACE spins, S toggles sound.

## Credits and licence

Maths ported from [slotopol/server](https://github.com/slotopol/server), game `cashfarm`, MIT, copyright schwarzlichtbezirk. Their source and data sit in `slotopol/` with their licence. The ladder reading is described above. Art by APEXSLOTS, CC BY 4.0; `art-src/` holds the tile's vector source. Code MIT. The licences are at the root of this repository.
