# PEARL REEF

A reef slot. 5 reels, 3 rows, 10 fixed bet lines. The TURTLE is wild and the top symbol: it joins any run from the left, doubles every win it completes, and pays on its own from 2 in a row. The CLAM is the scatter: two or more anywhere pay the total bet, three or more start 15 free games on their own set of reels where every win, line and scatter alike, pays triple. Three or more clams in the free games add 15 more without limit.

Play it: https://apexslots.eu/games/pearl-reef/

## Figures

| | |
|---|---|
| Layout | 5x3, 10 lines, all always active |
| RTP | 95.133189% (base game 59.764586%, the rest from the free games) |
| Wild | TURTLE. Substitutes for every symbol except the CLAM, doubles the win it completes, pays on its own from 2 in a row and that pay is not doubled |
| Scatter | CLAM, 2 or more anywhere, pays the total bet |
| Free games | 15, own reel strips, every win tripled, a line the TURTLE doubled pays 6x, retrigger 15 more without limit |
| Free games trigger | 391,230 of the 102,564,030 stop combinations of a paid spin, about once in 262 spins |
| Free games return | 618.143873% of the total bet per free game awarded, retriggers included |
| Top line pay | 5 TURTLE, 900x the total bet on one line, 2700x in a free game |
| Biggest single spin | 915x the total bet in the main game, 2745x in a free game (five turtles across the middle row, the crossing lines adding the rest) |
| Bet lines | slotopol BetLinesNvm10 |

## Paytable

Per line bet, runs 2/3/4/5. Divide by 10 for total-bet multiples.

| Symbol | 2 | 3 | 4 | 5 |
|---|---|---|---|---|
| TURTLE (wild) | 10 | 250 | 2500 | 9000 |
| SHARK | 2 | 25 | 125 | 750 |
| OCTOPUS | 2 | 25 | 125 | 750 |
| JELLYFISH | | 20 | 100 | 400 |
| PUFFERFISH | | 15 | 75 | 250 |
| STARFISH | | 15 | 75 | 250 |
| ACE | | 10 | 50 | 125 |
| KING | | 10 | 50 | 125 |
| QUEEN | | 5 | 25 | 100 |
| JACK | | 5 | 25 | 100 |
| TEN | | 5 | 25 | 100 |
| NINE | 2 | 5 | 25 | 100 |

A run the TURTLE helped complete pays double. A run of turtles alone pays as the TURTLE, not doubled. A line pays whichever is worth more, the doubled run or the turtles' own run, never both. Only the longest match on each line pays. Wins on different lines are added. The CLAM has no line pay and ends a run.

Scatter pay, total-bet multiples: 2 CLAMS 2x, 3 CLAMS 5x, 4 CLAMS 20x, 5 CLAMS 500x, added to any line win and tripled in the free games. 3 or more also start 15 free games, and in the free games 15 more.

## Reels

reelSets.ts holds every base set slotopol publishes plus the free-games strips, generated from slotopol/dolphinspearl_data.yaml. The game deals the set slotopol labels 95.133189%, and that is the RTP: both proofs reproduce the label to 6 decimals, and the free-games figure slotopol printed with it. Base strips 30, 43, 43, 43, 43 symbols long, free strips 33, 36, 36, 36, 36. `npm run sim:reels` proves the strips match the yaml, that the regular and free strips hard-coded in slotopol's own par sheet (slotopol/dolphinspearl_calc.lua) are exactly the ones the game deals, and that no window ever shows two CLAMS, which is the one assumption slotopol's RTP maths makes about these strips.

## How the RTP was proven

1. `npm run sim:exact`. Phase 1 factors the game through the shipped evaluator: the lines as a weighted sum over the symbol tuples, the scatter and the trigger over its 32 reel cases, the free games on their own strips at triple pay, retriggers as a geometric series, every set held against what slotopol printed into the yaml. Phase 2 brute forces every stop combination of every base set and of the free strips with a fast integer evaluator first proven to agree with the shipped one on millions of random grids, which also gives the exact hit rate and the biggest single spin.
2. `npm run sim:parsheet`. Closed form, a straight port of slotopol's own dolphinspearl_calc.lua, no code shared with the evaluator. It reads the paytable, the scatter pays, the free games table, the wild multiplier and the free-game multiplier out of that file and asserts they equal what the game ships, on all nine sets.
3. `npm run sim -- 50000000 --seed 42`. Monte Carlo through the real round path, free games and retriggers included. Without `--seed` it draws from Web Crypto, which is what long runs must use.

Both proofs fail unless they reproduce the label exactly. `npm test` runs the engine tests.

## Run it

    npm install
    npm run dev

Open http://localhost:5207. `npm run build` writes the static bundle to `dist/`. Set `GAME_BASE=/some/path/` to build for a subpath. Keys: SPACE spins, S toggles sound.

## Credits and licence

Maths ported from [slotopol/server](https://github.com/slotopol/server), game `dolphinspearl`, MIT, copyright schwarzlichtbezirk. Their source and data sit in `slotopol/` with their licence. Art by APEXSLOTS, CC BY 4.0. Code MIT. The licences are at the root of this repository.
