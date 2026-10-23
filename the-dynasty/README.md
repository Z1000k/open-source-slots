# THE DYNASTY

A royal court slot. 5 reels, 3 rows, 20 fixed bet lines. The MONARCH is wild and doubles every line win it helps complete. The HEIRESS and the HEIR are the scatters: three or more of either anywhere call 25, 30, 35, 40 or 45 free games, drawn at random, played on their own set of reels. In the free games the heir who called them pays as a scatter and retriggers without limit, and the other heir is crowned and plays as a second MONARCH.

Play it: https://apexslots.eu/games/the-dynasty/

## Figures

| | |
|---|---|
| Layout | 5x3, 20 lines, all always active |
| RTP | 94.138004% |
| Wild | MONARCH. Doubles the wins it completes, pays on its own from 2 in a row |
| Scatters | HEIRESS and HEIR, 3 or more anywhere |
| Free games | 25, 30, 35, 40 or 45, each equally likely, own reel strips, retrigger without limit |
| Top line pay | 5 MONARCHS, 250x the total bet on one line |
| Bet lines | slotopol BetLinesNvm5x3v1 |

## Paytable

Pays per line bet, for runs from the leftmost reel on consecutive reels. Only the MONARCH pays from 2 in a row. Divide by 20 for multiples of the total bet.

| Symbol | 2 | 3 | 4 | 5 |
|---|---|---|---|---|
| MONARCH (wild) | 10 | 200 | 1200 | 5000 |
| KNIGHT | | 25 | 100 | 500 |
| EAGLE | | 20 | 80 | 300 |
| WOLF | | 20 | 80 | 300 |
| CHALICE | | 15 | 60 | 200 |
| SCEPTER | | 15 | 60 | 200 |
| ACE | | 10 | 50 | 150 |
| KING | | 10 | 50 | 150 |
| QUEEN | | 5 | 25 | 100 |
| JACK | | 5 | 25 | 100 |
| TEN | | 5 | 25 | 100 |
| NINE | | 5 | 25 | 100 |

A line pays whichever is worth more: the MONARCH's own run, which is never doubled, or the doubled run it completes. Only the highest win on each line pays. Wins on different lines are added.

Scatter pay in the free games, in multiples of the total bet, for the heir who called them: 3 anywhere 5x, 4 anywhere 25x, 5 anywhere 500x, added to any line win and calling a new draw of free games. In the main game the heirs pay nothing themselves, they only call the free games.

## Reels

`src/engine/config/reelSets.ts` holds the base strips and the free-games strips, generated from `slotopol/royaldynasty_data.yaml`. `npm run sim:reels` re-parses the yaml independently and proves the shipped strips match it symbol for symbol, and that the 20 lines are the ones the rules name.

## How the RTP was proven

The figure 94.138004% is reproduced three ways that share no code, and each run fails unless it hits the figure exactly:

1. `npm run sim:exact` enumerates the game through the shipped evaluator: every line tuple weighted by its stop counts, every combination of heir counts, the free games priced with their retriggers as a geometric series. A second phase brute forces every stop combination.
2. `npm run sim:parsheet` counts the winning combinations in closed form from the rules alone.
3. `npm run sim -- 50000000 --seed 42` plays whole rounds through the real round path, free games draw and retriggers included, and judges every measured figure against its exact value in standard errors. Without `--seed` it draws from Web Crypto and can run for billions of rounds.

`npm test` runs the engine tests.

## Run it

    npm install
    npm run dev

Vite serves it on http://localhost:5212. `npm run build` writes the static bundle to `dist/`. Set `GAME_BASE=/some/path/` to build for a subpath.

Keys: SPACE spins, S toggles sound.

## Credits and licence

Maths ported from [slotopol/server](https://github.com/slotopol/server), game `royaldynasty`, MIT, copyright schwarzlichtbezirk. Their source and data sit in `slotopol/` with their licence. Art by APEXSLOTS, CC BY 4.0. Code MIT. The licences are at the root of this repository.
