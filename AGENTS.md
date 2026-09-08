# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## SHUNT

The design plan, the captain's seven recorded decisions and the ordered MVP work live outside this
repo at `data/wrecked-design-plan/report.md` in the firstmate data directory. Read section 5 for what
to build next and section 0b for what has already been decided. `README.md` here explains what
exists, what it feels like, and why each hard-to-reverse choice was made.

## Sharp edges

- **Feed the simulation `game.loop.rawDelta`, never the `delta` Phaser passes to `update()`.** Phaser
  smooths its delta and substitutes an older value once a frame overruns its `fps.min` window, which
  starves the fixed-step accumulator and makes the whole game run in slow motion with nothing
  visibly wrong. See `FeelLabScene.update()`.
- **Nothing in `src/game/sim`, `src/game/track` or `src/game/session/session.ts` may import Phaser.**
  That is what keeps the handling, the geometry and the session rules unit-testable, and it is the
  line the whole project is built on. Screens are a rendering of session state, never the reverse.
- **No physics engine is registered.** Arcade Physics bodies cannot rotate and Matter.js fights car
  feel; `sim/carModel.ts` and `sim/wallCollision.ts` are ours. See `gameConfig.ts`.
- **Collision order is load-bearing.** `SegmentGrid.query` returns segment indices ascending on
  purpose; collision response does not commute, and the determinism tests depend on it.
- **The look lives in `src/game/ui/kit`, not in scenes.** New screens and in-game furniture compose
  those components; a second styling vocabulary is the failure mode the kit exists to prevent. Its
  two colour rules - red for the eliminator alone, chrome stepping back wherever player colours are
  on screen - are stated at the top of `kit/design.ts`.
- **Nothing between two rounds waits for a keypress.** The design's sub-two-second restart is a
  requirement, so the between-rounds hold runs itself out and input can only shorten it. See
  `INTERMISSION_MS` and its tests in `src/game/session/session.test.ts`.

## Checks before a PR

`npm run typecheck && npm run lint && npm test && npm run build`, plus `npm run format` (Prettier is
configured but nothing runs it automatically). Note that `format` covers `src/**` only: `README.md`
and `index.html` are hand-written and are not Prettier-clean, so do not reformat them. Drive it as
well: the things that matter in this project are the ones a test cannot see.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
