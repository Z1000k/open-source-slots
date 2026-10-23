# Open Source Slots

Complete slot machine games, ready to play.

Slot maths is usually a closed box. The [slotopol](https://github.com/slotopol/server) project opened the first half of it by publishing reel strips and paytables for hundreds of games. This collection gives the other half: finished, playable slots built on that maths, each with its own art, sound and client, and a simulator that checks the published RTP.

Every game runs in the browser on its own. You can play it, read every line of it, check the numbers yourself, and use it as the starting point for your own. Code and sound are MIT, art is CC BY. New games join the list as they are finished.

## The games

| | Game | Layout | RTP | Play | Source |
|---|---|---|---|---|---|
| <img src="tiles/discovery-voyage.webp" width="96" alt="DISCOVERY VOYAGE"> | **DISCOVERY VOYAGE**<br>A voyage slot. The captain is wild and the top symbol. Three galleons start 10 free games on their own reels, where the galleon is wild as well. | 5x3, 10 lines | 95.02% | [Play](https://apexslots.eu/games/discovery-voyage/) | [Code](discovery-voyage/) |
| <img src="tiles/house-of-ra.webp" width="96" alt="HOUSE OF RA"> | **HOUSE OF RA**<br>An Egyptian slot. The sun disc is wild and the scatter. Three start 10 free games on their own reels where the best way on the screen expands over its reels and pays on every line. | 5x3, 10 lines | 95.18% | [Play](https://apexslots.eu/games/house-of-ra/) | [Code](house-of-ra/) |
| <img src="tiles/fairytale.webp" width="96" alt="FAIRYTALE"> | **FAIRYTALE**<br>A storybook slot. The enchantress is wild and the top symbol. Three lanterns start 10 free games where, before every spin, one symbol is drawn and covers the first two or three reels whole, so every free game pays. | 5x3, 10 lines | 95.57% | [Play](https://apexslots.eu/games/fairytale/) | [Code](fairytale/) |
| <img src="tiles/samurai.webp" width="96" alt="SAMURAI"> | **SAMURAI**<br>A warrior slot. The samurai is wild and the top symbol. Three gongs pay and start 10 free games on their own reels, where a samurai anywhere on a reel turns the whole reel wild. | 5x3, 20 lines | 95.39% | [Play](https://apexslots.eu/games/samurai/) | [Code](samurai/) |
| <img src="tiles/the-dynasty.webp" width="96" alt="THE DYNASTY"> | **THE DYNASTY**<br>A royal court. The monarch is wild and doubles the wins it completes. Two heirs call 25 to 45 free games on their own reels, where the other heir is crowned wild. | 5x3, 20 lines | 94.14% | [Play](https://apexslots.eu/games/the-dynasty/) | [Code](the-dynasty/) |

All of them are playable at [apexslots.eu](https://apexslots.eu).

## Run a game

Each game is its own project. Node 20 or newer.

    cd the-dynasty
    npm install
    npm run dev

Open the address Vite prints. `npm run build` writes the static bundle to `dist/`, `npm test` runs the engine tests.

## What is in every game

| Folder | What it is |
|---|---|
| `src/engine/` | The maths: reel strips, paytable, bet lines, the evaluator and the round. No graphics in here. |
| `src/game/` | The PixiJS client: reels, HUD, win presentation, game info screen, and the sound. Every game's soundtrack is synthesised in WebAudio, there are no audio files. |
| `src/sim/` | The proofs: exact enumeration, closed-form par sheet, reel strip check against the source yaml, Monte Carlo. |
| `tests/` | Vitest tests of the engine. |
| `slotopol/` | The reference maths the game was ported from, as published by slotopol (MIT), with their licence. |
| `public/` | The art. |

Each game's own README has its paytable, rules, RTP and the exact commands that reproduce the figure.

## Licence

- Code: [MIT](LICENSE).
- Art (everything under each game's `public/`, and `tiles/`): [CC BY 4.0](LICENSE-ART.md). Use it anywhere, credit APEXSLOTS.
- Reference maths under each game's `slotopol/` folder: MIT, copyright schwarzlichtbezirk, see the LICENSE file in that folder.

## Credits

The maths of these games was ported from [slotopol/server](https://github.com/slotopol/server) by schwarzlichtbezirk, MIT. The reel strips and paytables are theirs. The games, art, sound, clients and simulators are ours.
