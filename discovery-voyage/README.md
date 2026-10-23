# DISCOVERY VOYAGE

A voyage slot. 5 reels, 3 rows, 10 fixed bet lines. The CAPTAIN is wild and the top symbol: he joins any run from the left and pays on his own from 2 in a row. The GALLEON is the scatter: it pays nothing itself, three or more anywhere start 10 free games on their own set of reels. In the free games the GALLEON is wild as well, so a run of galleons and captains pays as captains. Three or more galleons in the free games add 10 more without limit.

Play it: https://apexslots.eu/games/discovery-voyage/

## Figures

| | |
|---|---|
| Layout | 5x3, 10 lines, all always active |
| RTP | 95.022795% (base game 70.162364%, the rest from the free games) |
| Wild | CAPTAIN. Substitutes for every symbol except the GALLEON, pays on his own from 2 in a row, never doubles |
| Scatter | GALLEON, 3 or more anywhere, no pay of its own |
| Free games | 10, own reel strips, the GALLEON is wild on the lines too, retrigger 10 more without limit |
| Top line pay | 5 CAPTAIN, 500x the total bet on one line |
| Biggest single spin | 527x the total bet in the main game, 536x in a free game (five wilds on one line and three more lines paying) |
| Bet lines | slotopol BetLinesNvm10 |

## Paytable

Per line bet, runs 2/3/4/5. Divide by 10 for total-bet multiples.

| Symbol | 2 | 3 | 4 | 5 |
|---|---|---|---|---|
| CAPTAIN (wild) | 10 | 100 | 1000 | 5000 |
| CROWN | 5 | 50 | 200 | 1000 |
| CHEST | 5 | 25 | 100 | 500 |
| COMPASS | 5 | 15 | 75 | 250 |
| ACE | | 10 | 40 | 150 |
| KING | | 10 | 40 | 150 |
| QUEEN | | 10 | 40 | 150 |
| JACK | | 5 | 20 | 100 |
| TEN | | 5 | 20 | 100 |

A line pays whichever is worth more: the CAPTAIN's own run or the run he completes, never both. Only the longest match on each line pays. Wins on different lines are added. The GALLEON has no line pay and ends a run in the main game; in the free games it substitutes like the CAPTAIN.

3 or more GALLEONS anywhere start 10 free games, and in the free games 10 more.

## Reels

reelSets.ts holds every base set slotopol publishes plus the free-games strips, generated from slotopol/columbus_data.yaml. The game deals the set slotopol labels 95.022795%, and that is the RTP: both proofs reproduce the label to 6 decimals, and every figure slotopol printed into the yaml with it (the symbol return, the free spins count over all reshuffles, the trigger rate, the free games return). Base strips 32, 28, 32, 28, 32 symbols long, free strips 25, 25, 24, 25, 24. `npm run sim:reels` proves the strips match the yaml, that no window ever shows two GALLEONS, and that the 10 lines are the ones the rules name.

## How the RTP was proven

1. `npm run sim:exact`. Phase 1 factors the game through the shipped evaluator: the lines as a weighted sum over the symbol tuples, the trigger over its 32 reel cases, the free games on their own strips with the GALLEON wild, retriggers as a geometric series, every figure held against what slotopol printed into the yaml. Phase 2 brute forces every stop combination of every base set and of the free strips, which also gives the exact hit rate, the biggest single spin and the exact per-round standard deviation.
2. `npm run sim:parsheet`. Closed form, no code shared with the evaluator. It reads the paytable, the wild and scatter ids, the free-game wild, the trigger count and the award out of the slotopol Go source and asserts they equal what the game ships.
3. `npm run sim -- 50000000 --seed 42`. Monte Carlo through the real round path, free games and retriggers included. Without `--seed` it draws from Web Crypto, which is what long runs must use.

Both proofs fail unless they reproduce the label exactly. `npm test` runs the engine tests.

## Run it

    npm install
    npm run dev

Open http://localhost:5208. `npm run build` writes the static bundle to `dist/`. Set `GAME_BASE=/some/path/` to build for a subpath. Keys: SPACE spins, S toggles sound.

## Credits and licence

Maths ported from [slotopol/server](https://github.com/slotopol/server), game `columbus`, MIT, copyright schwarzlichtbezirk. Their source and data sit in `slotopol/` with their licence. Art by APEXSLOTS, CC BY 4.0. Code MIT. The licences are at the root of this repository.
