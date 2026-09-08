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
- **Nothing in `src/game/sim` or `src/game/track` may import Phaser.** That is what keeps the
  handling and the geometry unit-testable, and it is the line the whole project is built on.
- **No physics engine is registered.** Arcade Physics bodies cannot rotate and Matter.js fights car
  feel; `sim/carModel.ts` and `sim/wallCollision.ts` are ours. See `gameConfig.ts`.
- **Collision order is load-bearing.** `SegmentGrid.query` returns segment indices ascending on
  purpose; collision response does not commute, and the determinism tests depend on it.

## Checks before a PR

`npm run typecheck && npm run lint && npm test && npm run build`, plus `npm run format` (Prettier is
configured but nothing runs it automatically). Drive it as well: the things that matter in this
project are the ones a test cannot see.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
