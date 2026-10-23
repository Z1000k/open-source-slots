# SAMURAI

A warrior slot. 5 reels, 3 rows, 20 fixed bet lines. The SAMURAI is wild and the top symbol: he joins any run from the left and pays on his own from 3 in a row. The GONG is the scatter: three or more anywhere pay the total bet and start 10 free games on their own set of reels. In the free games a SAMURAI anywhere on a reel takes the whole reel, every position on it is wild for every line. Gongs pay in the free games too and add 10 more without limit.

Play it: https://apexslots.eu/games/samurai/

## Figures

| | |
|---|---|
| Layout | 5x3, 20 lines, all always active |
| RTP | 95.388785% |
| Wild | SAMURAI. Substitutes for every symbol except the GONG, pays on his own from 3 in a row, never doubles |
| Scatter | GONG, 3 or more anywhere, pays in the main game and in the free games |
| Free games | 10, own reel strips, a SAMURAI anywhere on a reel turns the whole reel wild, retrigger 10 more without limit |
| Top line pay | 5 SAMURAI, 50x the total bet on one line |
| Bet lines | slotopol BetLinesNvm5x3v2 |

## Paytable

Pays per line bet, for runs from the leftmost reel on consecutive reels, from 3 in a row. Divide by 20 for multiples of the total bet.

| Symbol | 3 | 4 | 5 |
|---|---|---|---|
| SAMURAI (wild) | 100 | 500 | 1000 |
| DRAGON | 80 | 250 | 800 |
| TIGER | 40 | 200 | 600 |
| ONI | 40 | 200 | 600 |
| HELMET | 30 | 150 | 500 |
| FAN | 30 | 150 | 500 |
| ACE | 10 | 50 | 200 |
| KING | 10 | 30 | 150 |
| QUEEN | 10 | 30 | 150 |
| JACK | 10 | 20 | 100 |
| TEN | 10 | 20 | 100 |

A line pays whichever is worth more: the SAMURAI's own run or the run he completes. Only the highest win on each line pays. Wins on different lines are added.

Scatter pay, in multiples of the total bet, in the main game and in the free games alike: 3 GONGS anywhere 2x, 4 anywhere 20x, 5 anywhere 200x, added to any line win. 3 or more also start 10 free games, and in the free games 10 more.

## Reels

`src/engine/config/reelSets.ts` holds every base set slotopol publishes for the game plus the free-games strips, generated from `slotopol/katana_data.yaml`. The game deals the base set slotopol labels 95.385457%. `npm run sim:reels` re-parses the yaml independently and proves the shipped strips match it symbol for symbol, and that the 20 lines are the ones the rules name.

The RTP of the game is 95.388785%, a little above slotopol's label for the set, and the reason is worth knowing. slotopol printed its figures from a scan of one line, the middle row. In the main game that changes nothing, every line earns the same. In the free games a SAMURAI one row off a line still turns the reel wild for it, so each line shape earns a different amount, and the 20-line average sits 0.003328 points above the middle line's. Nothing was retuned: same reels, same rules. Both proofs below reproduce slotopol's one-line figures to 6 decimals as well as the 20-line figure.

## How the RTP was proven

The figure 95.388785% is reproduced three ways that share no code, and each run fails unless it hits the figure exactly:

1. `npm run sim:exact` enumerates the game through the shipped evaluator: every line tuple weighted by its stop counts, with the wild-reel states of the free games, every combination of gong counts, the free games priced with their retriggers as a geometric series. A second phase brute forces every stop combination of every set.
2. `npm run sim:parsheet` counts the winning combinations in closed form from the rules alone, reading the paytable, the wild-reel rule and the bet lines straight out of the slotopol Go source.
3. `npm run sim -- 50000000 --seed 42` plays whole rounds through the real round path, free games and retriggers included, and judges every measured figure against its exact value in standard errors. Without `--seed` it draws from Web Crypto and can run for billions of rounds.

`npm test` runs the engine tests.

## Run it

    npm install
    npm run dev

Vite serves it on http://localhost:5211. `npm run build` writes the static bundle to `dist/`. Set `GAME_BASE=/some/path/` to build for a subpath.

Keys: SPACE spins, S toggles sound.

## Credits and licence

Maths ported from [slotopol/server](https://github.com/slotopol/server), game `katana`, MIT, copyright schwarzlichtbezirk. Their source and data sit in `slotopol/` with their licence. Art by APEXSLOTS, CC BY 4.0. Code MIT. The licences are at the root of this repository.
