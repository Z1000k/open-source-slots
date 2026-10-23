# HOUSE OF RA

An Egyptian slot. 5 reels, 3 rows, 10 fixed bet lines. The SUN DISC is wild on the lines in the main game and the scatter everywhere: three or more anywhere pay the total bet and start 10 free games on their own set of reels. In the free games a symbol wins when it shows on consecutive reels from the left, in any row of each reel. Only the best way on the screen pays: its symbol expands to cover those reels and pays on all 10 lines. Sun discs pay in the free games too and three or more add 10 more without limit.

Play it: https://apexslots.eu/games/house-of-ra/

## Figures

| | |
|---|---|
| Layout | 5x3, 10 lines, all always active |
| RTP | 95.182099% (base game 65.317603%, the rest from the free games) |
| Wild | SUN DISC, in the main game only. No line pay of its own, so a line of sun discs alone pays nothing |
| Scatter | SUN DISC, 3 or more anywhere, pays in the main game and in the free games |
| Free games | 10, own reel strips, the best way on the screen expands and pays on every line, the SUN DISC is not wild, retrigger 10 more without limit |
| Top line pay | 5 PHARAOH, 100x the total bet on one line in the main game, 1000x the total bet in the free games |
| Biggest single spin | 253.5x the total bet in the main game, 1000x in a free game |
| Bet lines | slotopol BetLinesNvm10 |

## Paytable

Per line bet, runs 2/3/4/5. Divide by 10 for total-bet multiples in the main game. In the free games the best way pays its line pay on all 10 lines, so the figure below is the win in total-bet multiples.

| Symbol | 2 | 3 | 4 | 5 |
|---|---|---|---|---|
| PHARAOH | 10 | 50 | 200 | 1000 |
| FALCON | 5 | 25 | 100 | 500 |
| ANKH | 5 | 20 | 50 | 250 |
| LOTUS | 5 | 20 | 50 | 250 |
| COBRA | 5 | 20 | 50 | 250 |
| ACE | | 10 | 30 | 125 |
| KING | | 10 | 30 | 125 |
| QUEEN | | 5 | 20 | 100 |
| JACK | | 5 | 20 | 100 |
| TEN | | 5 | 20 | 100 |

Main game: a line pays as its first symbol other than the SUN DISC, for as far as that symbol reaches with sun discs substituting. Only the longest match on each line pays. Wins on different lines are added.

Scatter pay, total-bet multiples, base and free alike: 3 SUN DISCS 2x, 4 20x, 5 200x, added to any other win. 3 or more also start 10 free games, and in the free games 10 more.

## Reels

reelSets.ts holds every base set slotopol publishes, generated from slotopol/dynastyofra_data.yaml, plus two sets of free-games strips: slotopol's own, kept for the proofs and never dealt, and the ones the game deals. The game deals the base set slotopol labels 95.189553%. `npm run sim:reels` proves the base strips match the yaml, re-derives the free strips from slotopol's by the rule below and asserts the shipped strips are exactly that, and proves the 10 lines are the ones the rules name.

The free games are not slotopol's, and this is the one game in the collection where the maths was changed. slotopol's free-games scan stops searching too early after it finds a best way of 3 or 4, so it often pays a smaller way than the best one on the screen, and every figure slotopol publishes for this game was computed through that scan. The exact proof runs a verbatim port of that scan on slotopol's free strips and reproduces its printed 509.147554% per free game to 6 decimals, which is the diagnosis on record. Paying the best way on those same strips would be worth 918.495775% per free game, far too much for the base strips.

So the game pays the best way, always, and the free strips were rebuilt from slotopol's by one stated rule: reels 1 and 2 unchanged; on reels 3, 4 and 5 every symbol stacked two high, except the SUN DISC and, on reel 3 only, the COBRA; and reels 3 to 5 each given a second SUN DISC at the stack boundary nearest the far side of the strip, so the free games retrigger at close to slotopol's rate. Stacking narrows how many different symbols a window shows, which prices the best-way rule back to the original set's figure. The result is 541.467507% per free game awarded and a whole-game RTP of 95.182099%, 0.007454 points under slotopol's label for the set. Free reel lengths 34, 34, 65, 68, 68.

## How the RTP was proven

1. `npm run sim:exact`. Phase 1 factors the game through the shipped evaluator: the base lines as a weighted sum over symbol tuples, the scatter over its 32 reel cases, the free games' best way over reel 1's windows times the pattern each later reel can show, retriggers as a geometric series. The base figures of every set are held against what slotopol printed into the yaml. Phase 2 brute forces every stop combination of every base set, of the shipped free strips and of slotopol's free strips, which also gives the exact hit rates, the biggest single spins and the exact per-round standard deviation. `-- --quick` runs phase 1 only.
2. `npm run sim:parsheet`. Closed form, no code shared with the evaluator: the line rule as a product over reels, the best way as a tail sum with inclusion-exclusion over the candidates on reel 1. It reads the paytable, the scatter pays, the free games awarded and the sun disc's id out of the slotopol Go source and asserts they equal what the game ships.
3. `npm run sim -- 50000000 --seed 42`. Monte Carlo through the real round path, free games and retriggers included. Without `--seed` it draws from Web Crypto, which is what long runs must use.

Both proofs fail unless they reproduce 95.182099 exactly. `npm test` runs the engine tests.

## Run it

    npm install
    npm run dev

Open http://localhost:5209. `npm run build` writes the static bundle to `dist/`. Set `GAME_BASE=/some/path/` to build for a subpath. Keys: SPACE spins, S toggles sound.

## Credits and licence

Base maths ported from [slotopol/server](https://github.com/slotopol/server), game `dynastyofra`, MIT, copyright schwarzlichtbezirk. Their source and data sit in `slotopol/` with their licence. Free games as described above. Art by APEXSLOTS, CC BY 4.0. Code MIT. The licences are at the root of this repository.
