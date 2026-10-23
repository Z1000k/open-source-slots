# FAIRYTALE

A storybook slot. 5 reels, 3 rows, 10 fixed bet lines. The ENCHANTRESS is wild and the top symbol: she joins any run from the left and pays on her own from 2 in a row. The LANTERN is the scatter: two or more anywhere pay the total bet, three or more start 10 free games. Before every free game one symbol is drawn from a pool and cast over the first two or three reels, filling them top to bottom, and only the reels after the cast spin, on their own strips. Every free game pays. Lanterns pay in the free games too and three or more add 10 more without limit.

Play it: https://apexslots.eu/games/fairytale/

## Figures

| | |
|---|---|
| Layout | 5x3, 10 lines, all always active |
| RTP | 95.566989% (base game 54.040105%, the rest from the free games) |
| Wild | ENCHANTRESS. Substitutes for every symbol except the LANTERN, pays on her own from 2 in a row, never doubles |
| Scatter | LANTERN, 2 or more anywhere, pays in the main game and in the free games |
| Free games | 10, a symbol drawn before every spin covers the first 2 or 3 reels, the other reels spin on their own strips, retrigger 10 more without limit |
| Top line pay | 5 ENCHANTRESS, 900x the total bet on one line |
| Biggest single spin | 908.2x the total bet in the main game, 750x in a free game |
| Bet lines | slotopol BetLinesNvm10 |

## Paytable

Per line bet, runs 2/3/4/5. Divide by 10 for total-bet multiples.

| Symbol | 2 | 3 | 4 | 5 |
|---|---|---|---|---|
| ENCHANTRESS (wild) | 10 | 250 | 2500 | 9000 |
| UNICORN | 2 | 25 | 125 | 750 |
| GRIFFIN | 2 | 25 | 125 | 750 |
| CASTLE | | 20 | 100 | 400 |
| SLIPPER | | 15 | 75 | 250 |
| MIRROR | | 15 | 75 | 250 |
| ACE | | 10 | 50 | 125 |
| KING | | 10 | 50 | 125 |
| QUEEN | | 5 | 25 | 100 |
| JACK | | 5 | 25 | 100 |
| TEN | | 5 | 25 | 100 |
| NINE | 2 | 5 | 25 | 100 |

A line pays whichever is worth more: the ENCHANTRESS's own run or the run she completes. Only the highest win on each line pays. Wins on different lines are added.

Scatter pay, total-bet multiples, base and free alike: 2 LANTERNS 2x, 3 5x, 4 75x, 5 750x, added to any line win. 3 or more also start 10 free games, and in the free games 10 more.

## Free games

Before every free game one entry is drawn, uniformly, from a pool of 28:

| Cast symbol | Reels covered | Chances in 28 |
|---|---|---|
| UNICORN | 2 | 4 |
| GRIFFIN | 2 | 4 |
| NINE | 2 | 6 |
| LANTERN | 2 | 3 |
| QUEEN | 3 | 2 |
| JACK | 3 | 2 |
| TEN | 3 | 2 |
| CASTLE | 3 | 1 |
| SLIPPER | 3 | 1 |
| MIRROR | 3 | 1 |
| ACE | 3 | 1 |
| KING | 3 | 1 |

The ENCHANTRESS is never drawn. The cast symbol fills every row of its reels, so every line starts with it, and an ENCHANTRESS on the spinning reels carries the run further. A cast LANTERN lights the middle row of the first two reels with empty cells above and below: those cells pay nothing and stop any line that starts on them, the two lanterns pay 2x as scatters, and one more anywhere adds 10 free games.

## Reels

reelSets.ts holds every base set slotopol publishes plus the free-games strips and the pool, generated from slotopol/fairyqueen_data.yaml. The game deals the set slotopol labels 95.566989%, and that is the RTP: both proofs reproduce the label to 6 decimals, and every per-symbol free-game figure slotopol printed into the yaml with it. `npm run sim:reels` proves the strips, the pool and the cover counts match the yaml, that no window ever shows two LANTERNS, and that the 10 lines are the ones the rules name.

One thing to know. slotopol's live server code for this game reads the reel cover table one place off from how its own par sheet reads it, which would cover a different number of reels for some symbols and fail on the LANTERN. The game follows the par sheet, since that is the game every published figure describes. The exact proof runs slotopol's live scan as well, so the difference is on record.

## How the RTP was proven

1. `npm run sim:exact`. Phase 1 enumerates through the shipped evaluator: every free game symbol by symbol (every stop combination of the uncovered reels), the pool average, retriggers as a geometric series, the base lines as a weighted sum over symbol tuples, the scatter over its 32 reel cases. Phase 2 brute forces every stop combination of every base set and every free game, which also gives the exact hit rates, the biggest single spins and the exact per-round standard deviation. `-- --quick` runs phase 1 only.
2. `npm run sim:parsheet`. Closed form, no code shared with the evaluator. It reads the paytable, the cover counts, the scatter pays and the free games awarded out of the slotopol Go source and asserts they equal what the game ships.
3. `npm run sim -- 50000000 --seed 42`. Monte Carlo through the real round path, free games and retriggers included. Without `--seed` it draws from Web Crypto, which is what long runs must use.

Both proofs fail unless they reproduce 95.566989 exactly. `npm test` runs the engine tests.

## Run it

    npm install
    npm run dev

Open http://localhost:5210. `npm run build` writes the static bundle to `dist/`. Set `GAME_BASE=/some/path/` to build for a subpath. Keys: SPACE spins, S toggles sound.

## Credits and licence

Maths ported from [slotopol/server](https://github.com/slotopol/server), game `fairyqueen`, MIT, copyright schwarzlichtbezirk. Their source and data sit in `slotopol/` with their licence. Art by APEXSLOTS, CC BY 4.0. Code MIT. The licences are at the root of this repository.
