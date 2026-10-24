# TROPIC ESCAPE

A beach slot with a doubling wild and 45 free games. 5 reels, 3 rows, 9 fixed bet lines. The BANANA is wild and the top symbol: it joins any run from the left and doubles what that run pays, and a run of bananas on its own pays as the top symbol, undoubled. The SUITCASE is the scatter: two or more anywhere pay the total bet, and three or more start 45 free games on their own reels, which carry more bananas and more suitcases. Three or more suitcases during the free games add 45 more, without limit.

Play it: https://apexslots.eu/games/tropic-escape/

## Figures

| | |
|---|---|
| Layout | 5x3, 9 lines, all always active |
| RTP | 95.364527%, of which about 59.2% comes from the base game symbols and about 36.1% from the free games |
| Wild | BANANA. Substitutes for every symbol except the SUITCASE, doubles the win it completes, pays on its own undoubled |
| Scatter | SUITCASE, 2 or more anywhere, pays the total bet; 3 or more start the free games |
| Free games | 45 on 3 or more SUITCASE, on their own reels, retriggerable without limit. Triggered on 391,230 of the 102,564,030 stop combinations, about 1 in 262 spins |
| Retrigger | 642,573 of the 57,153,600 stop combinations of the free game reels, about 1 in 89 free spins, so a session runs about 91 free spins on average |
| Free games return | 210.461503% of the total bet per free spin, retriggers included, as slotopol publishes it; 45 times that, 9470.767635% of the total bet per trigger |
| Top line pay | 5 BANANA, 1000x the total bet on one line |
| Biggest single spin | 9120 line bets, 1013.33x the total bet, by enumerating every stop combination of the dealt strips. There is no cap: a free games session stacks 45 or more such spins |
| Bet lines | the first 9 of slotopol BetLinesNvm10 |

## Paytable

Per line bet, runs 2/3/4/5 from the leftmost reel. Divide by 9 for total-bet multiples.

| Symbol | 2 | 3 | 4 | 5 |
|---|---|---|---|---|
| BANANA (wild) | 10 | 250 | 2500 | 9000 |
| STRAWBERRY | 2 | 30 | 120 | 800 |
| MELON | 2 | 30 | 120 | 800 |
| PINEAPPLE | | 20 | 100 | 400 |
| MANGO | | 20 | 70 | 250 |
| COCONUT | | 20 | 70 | 250 |
| ACE | | 10 | 50 | 120 |
| KING | | 10 | 50 | 120 |
| QUEEN | | 4 | 30 | 100 |
| JACK | | 4 | 30 | 100 |
| TEN | | 4 | 30 | 100 |
| NINE | 2 | 4 | 30 | 100 |

A line pays whichever is worth more: the doubled run the BANANA completed, or the plain run of BANANAs at the front of it, never both. Only the longest match on each line pays. Wins on different lines are added, and scatter pays are added to them.

Scatter pay, total-bet multiples: 2 SUITCASE 2x, 3 SUITCASE 4x, 4 SUITCASE 20x, 5 SUITCASE 500x. A SUITCASE never pays on a line and ends any run it sits in.

## Reels

reelSets.ts is generated from slotopol/bananasgobahamas_data.yaml by `npm run gen:reels` and holds every base set slotopol publishes for this game, labelled from 90.142004% to 175.266200%, plus the single set of free game strips every base set shares. The game deals the 95.364527% set, which is the original the slotopol par sheet ships with, and that is the RTP. Base strips 30, 43, 43, 43, 43 symbols long, 102,564,030 stop combinations, one SUITCASE on every reel. Free game strips 35, 35, 36, 36, 36 symbols long, 57,153,600 stop combinations, with two BANANAs on the second and third reels and three SUITCASEs on the fifth. No strip shows two SUITCASEs in one window, which is the one assumption slotopol's closed-form maths makes, and `npm run sim:reels` proves it along with the strips themselves.

## How the RTP was proven

1. `npm run sim:exact`. Exact in two independent ways. First it factors the game the way it factors: every bet line reads one uniform symbol from each reel, so the line return is a weighted sum over the 13 to the power of 5 symbol tuples, each scored by the shipped evaluator, and the scatter return and the free games awarded are a sum over the 32 patterns of which reels show a SUITCASE. That reproduces slotopol's label for every base set to 6 decimals and their 210.461503% for the free game strips. Then it brute-forces every one of the 57,153,600 free game stops and the 102,564,030 base stops with a fast integer scorer, after proving that scorer agrees with the shipped evaluator on 2,000,000 random grids, and reaches the same figures from the other direction, with the exact hit rate and the biggest single spin.
2. `npm run sim:parsheet`. A port of slotopol's own bananasgobahamas_calc.lua, which counts winning combinations in closed form and shares no code with the evaluator. Its paytable is transcribed from the lua and asserted equal to the one the game ships. It exits non-zero unless every set matches.
3. `npm run sim`. Monte Carlo through the real round path, free games and retriggers included, 5,000,000 rounds by default, `npm run sim -- 20000000` for more. Prints the base and free game split, the trigger rate, free spins and retriggers per session, and the return per trigger beside the exact 9470.767635%. It prints the seed it drew so a run can be repeated.
4. `npm run sim:reels`. Parses slotopol's yaml independently of the generator, compares every base strip and the free game strips against the file that ships, and checks that no strip shows two SUITCASEs in one window. It exits non-zero on any difference.

`npm test` runs the engine tests.

## Run it

    npm install
    npm run dev

Open http://localhost:5206. `npm run build` writes the static bundle to `dist/`. Set `GAME_BASE=/some/path/` to build for a subpath. Keys: SPACE spins, S toggles sound.

## Credits and licence

Maths ported from [slotopol/server](https://github.com/slotopol/server), game `bananasgobahamas`, MIT, copyright schwarzlichtbezirk. Their source, data and par sheet sit in `slotopol/` with their licence. Art by APEXSLOTS, CC BY 4.0; `art-src/` holds the tile's vector source. Code MIT. The licences are at the root of this repository.
