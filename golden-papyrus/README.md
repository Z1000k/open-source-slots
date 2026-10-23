# GOLDEN PAPYRUS

An Egyptian book slot. 5 reels, 3 rows, 10 fixed bet lines. The PAPYRUS is wild on the lines and the scatter everywhere: it joins and extends any run, pays nothing on its own, and three or more anywhere pay the total bet and start 10 free games on their own set of reels. Before the free games one of the nine paying symbols is drawn at random as the expanding symbol. In the free games enough of it anywhere on the screen pays its line prize on all 10 lines at once. Three or more papyri in the free games add 10 more without limit.

Play it: https://apexslots.eu/games/golden-papyrus/

## Figures

| | |
|---|---|
| Layout | 5x3, 10 lines, all always active |
| RTP | 95.111967% (base game 50.8847%, free games 44.2273%) |
| Wild | PAPYRUS. Substitutes for every symbol, no line pay of its own |
| Scatter | PAPYRUS, 3 or more anywhere, pays the total bet |
| Free games | 10, own reel strips, one expanding symbol drawn for the whole session, retrigger 10 more without limit |
| Free games trigger | once in about 176.2 paid spins |
| Free games length | 13.195 spins on average, retriggers included |
| Free games return | 779.285363% of the total bet per free spin, averaged over the nine expanding symbols, retriggers included |
| Top line pay | 5 EXPLORER, 500x the total bet on one line |
| Top expanding pay | 5 EXPLORERS anywhere in a free game, 5000x the total bet |
| Bet lines | slotopol BetLinesNvm10 |

## Paytable

Per line bet, runs 2/3/4/5. Divide by 10 for total-bet multiples. In the free games the same table prices the expanding symbol: its pay for the count anywhere on the screen, collected on all 10 lines, so the figure below is then the win in total-bet multiples.

| Symbol | 2 | 3 | 4 | 5 |
|---|---|---|---|---|
| EXPLORER | 10 | 100 | 1000 | 5000 |
| MUMMY | 5 | 40 | 400 | 2000 |
| ANUBIS | 5 | 30 | 100 | 750 |
| SCARAB | 5 | 30 | 100 | 750 |
| ACE | | 5 | 40 | 150 |
| KING | | 5 | 40 | 150 |
| QUEEN | | 5 | 25 | 100 |
| JACK | | 5 | 25 | 100 |
| TEN | | 5 | 25 | 100 |

A line pays as its first symbol other than the PAPYRUS, for as far as that symbol reaches with papyri substituting. Only the longest match on each line pays. Wins on different lines are added.

Scatter pay, total-bet multiples, base and free alike: 3 PAPYRI 2x, 4 20x, 5 200x, added to any other win. 3 or more also start 10 free games, and in the free games 10 more.

In the free games the expanding symbol pays through its collect, not through the lines: a line that starts with the expanding symbol pays nothing as a line. When a PAPYRUS leads the line, the expanding symbol joins the run and the line pays as usual. The collect and the line wins are added.

## Reels

reelSets.ts holds every base set slotopol publishes plus the one free-games strip they all share, copied from their bookofra_data.yaml, which sits at the root of this folder. The game deals the set slotopol labels 95.111967%, and that is the RTP: both proofs reproduce the label to 6 decimals, and the free-games figure slotopol printed with it. Base strips 50, 45, 46, 50, 45 symbols long, free strips 37, 37, 36, 37, 37. `npx tsx src/sim/checkReels.ts` re-parses the yaml and proves every shipped strip, base and free, matches it symbol by symbol.

## How the RTP was proven

1. `npm run sim:exact`. Full enumeration. A numeric mirror of the evaluator is first proven equal to the shipped one on 2,000,000 random grids, paid and free, then every stop combination of every base set is walked, up to 269,100,000 grids a set, and the 67,469,796 free-games grids are scored for all nine expanding symbols in one pass. Retriggers enter as a geometric series. Every set prints MATCH or MISMATCH against slotopol's label, and the free-games figure prints beside slotopol's 779.285363%.
2. `npm run sim:parsheet`. Closed form, no enumeration of grids. Every line cell comes from a different reel with a uniform stop, so the expected line pay is a sum over the symbol assignments of one line weighted by the strip counts, and the scatter, trigger and expanding-symbol counts convolve the per-reel window counts. Same MATCH test, same figures.
3. `npm run sim -- 20000000`. Monte Carlo through the real round path on the dealt set, trigger, expanding-symbol draw, free games and retriggers included. It prints the seed it drew so a run can be repeated, and the base, free-games, trigger and session-length figures beside their exact targets.

`npm test` runs the engine tests.

## Run it

    npm install
    npm run dev

Open http://localhost:5203. `npm run build` writes the static bundle to `dist/`. Set `GAME_BASE=/some/path/` to build for a subpath. Keys: SPACE spins, S toggles sound.

## Credits and licence

Maths ported from [slotopol/server](https://github.com/slotopol/server), game `bookofra`, MIT, copyright schwarzlichtbezirk. Their data file bookofra_data.yaml sits at the root of this folder with their licence in LICENSE-slotopol. Art by APEXSLOTS, CC BY 4.0; `art-src/` holds the tile's vector source. Code MIT. The licences are at the root of this repository.
