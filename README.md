# SHUNT

A top-down combat racer, rebuilt so it can be played again.

SHUNT is a fresh recreation of the *kind* of game *Wrecked: Revenge Revisited* and its predecessor
*Mashed* were: four cars on **one shared screen**, a camera that zooms to fit everybody, and a
trailing edge that eliminates whoever falls behind. Its own name, its own art, its own tracks. The
mechanics and the feel are what we are chasing; nothing is copied.

**This repository is at the very start of that.** What exists today is the project skeleton, the car
handling lab, one circuit with walls you can hit, and the screens a session is played through - one
car, every handling dial live on screen, and something to crash into. There is no camera work, no
eliminator line and no weapons yet, on purpose.

---

## Run it

```bash
npm install
npm run dev
```

Open the URL it prints. It lands on the title screen; `?lab` in the URL goes straight to the
handling lab instead, and **F** on the title screen does the same.

| | |
| --- | --- |
| `npm run dev` | Play it, with live reload |
| `npm test` | Run the simulation tests |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm run build` | Production build |
| `npm run format` | Prettier over the source |

## Play a session

Two people, one keyboard, first to ten. The screens exist to make that legible and to keep the gap
between rounds short.

| Screen | What it is for |
| --- | --- |
| **Title** | The name, and one way in. There is nothing else to choose yet, so there is no menu. |
| **The grid** | Who is playing, what colour they are, and which keys are theirs - shown together, because sharing a keyboard is confusing and nothing else in the game will explain it. Slots three and four are drawn as reserved gamepad seats. |
| **Round** | The score furniture that sits over a race. The circuit exists - drive it in the handling lab - but wiring it into a round with two cars and an eliminator is the next work item; until then `1` and `2` call the round. |
| **Scoreboard** | Between rounds. It holds for 1.5 s and starts the next round **itself** - the design's sub-two-second restart is a requirement, so nothing here waits for a keypress. `Enter` can only make the gap shorter. |
| **Winner** | The end of a session, in the winner's colour. The one screen allowed to wait. `Enter` rematches. |

`Esc` steps back, and abandons a session from inside one.

## Drive it

| Key | Does |
| --- | --- |
| **Arrows** or **WASD** | Steer, accelerate, brake - and reverse, if you keep braking once stopped |
| **Brake tap, then double-tap accelerate** | Boost. Yes, really - see "The boost is meant to be awkward" below |
| **Shift** | Boost, but only when the faithful combo is switched off (`F`) |
| **R** | Put the car back on the start line |
| **P** | Show or hide the handling panel |
| **O** | Show or hide the readout |
| **M** | Show or hide the minimap |
| **C** | Show the collision shape and the last contact normal |
| **T** | Tyre marks on or off |
| **F** | Faithful boost combo on or off |

## The handling panel is the point

The panel down the right-hand side is not a debug afterthought, it is the deliverable. Every number
that a driver can feel is a slider, and moving one changes the car **on the next frame** - no
rebuild, no reload. Your values are saved in the browser, so what you found last night is still
there in the morning.

When you land on something you like:

- **Copy JSON** puts the whole set on your clipboard.
- **Copy as code** gives you a `DEFAULT_HANDLING` block you can paste straight over the one in
  [`src/game/sim/handling.ts`](src/game/sim/handling.ts). That is how a good session becomes the new
  baseline for everyone.
- **Reset** goes back to the values committed in that file.

The readout in the top-left shows the things you cannot see: how much of your speed is going
sideways, whether the tyres have actually let go, and - because the boost combo is famously
obscure - exactly where in the combo your fingers are.

## The numbers, and why

Units are world units and seconds. **16 world units = 1 metre**, and the car is 30 x 56 units, so
roughly 1.9 m x 3.5 m - a stubby arcade car. The readout converts to m/s and km/h so the speeds can
be argued with.

These are a considered starting point, not a finished car. They are meant to be moved.

| Block | Where it landed | Why |
| --- | --- | --- |
| Engine 1150, top speed 620 | 0 to flat out in about 0.6 s, 140 km/h | Micro Machines-lineage cars accelerate almost instantly. Slow acceleration makes every restart a chore, and in a game of 45-second rounds that is fatal. |
| Drag 0.35, coast-down 0.55 | Coasting bleeds about 60% of speed a second | Enough that lifting off is a real decision, not so much that the car feels like it is wading. |
| Turn rate 3.4 rad/s, washout 0.35 | About a 5-car-length radius flat out | Tight enough to feel arcade, loose enough that top speed feels committing. |
| Turn-in 14/s, straighten-up 6/s | Turn-in inside ~70 ms | Snappy without being twitchy. The car should feel like it is on rails until it is not. |
| Steering cut-in 110 | No steering below walking pace | Stops the car pirouetting on the spot, which instantly reads as "physics toy" rather than "car". |
| **Grip 14, break-away 90, grip while sliding 0.5** | See below | The most important block, and the one that was actually tuned by driving. |
| **Walls: bounce 0.3, drag 0.35, crash penalty 0.35** | See "Hitting things" | A graze costs 4%, a square hit costs 80%. |

### How the grip numbers were chosen

Driving it, not reasoning about it. Three behaviours were the target, and these values hit all three:

| Situation | What happens | Measured |
| --- | --- | --- |
| Full lock at top speed | Breaks traction into a holdable power slide | 28% of speed going sideways, tyres SLIDING |
| Release the steering | Snaps back into line, quickly but not instantly | Gripping again in under 0.6 s |
| Full lock at half speed | Grips all the way round | 21% sideways, never breaks away |

So the car grips through an ordinary corner and steps out when you commit at speed. That is the
behaviour to argue with first - if it is wrong, it is the fastest thing to change and everything
else is downstream of it.

## The track

One circuit, **Cutter's Yard**: 641 m a lap, about 18 seconds if you never lift and 22 if you brake
properly. Two long straights so top speed means something, a fast right onto the back of the yard, an
S-bend on the narrowest road here, a long flat-out horseshoe, and **the Elbow** - 114 degrees of left
on a 170-unit radius, arriving straight off the quickest part of the lap. That corner exists to be
crashed into.

A track is authored as **corner vertices, each with a radius and a road width**, in
[`src/game/track/tracks/cuttersYard.ts`](src/game/track/tracks/cuttersYard.ts). The centreline, both
walls, the drivable surface, the start line and the bounds are all derived from that by `buildTrack`.
So a corner really is one number, and retuning one is editing it and reloading.

Three reasons for that shape rather than a polygon soup, a tilemap or a painted mask, and the first
is the one that matters:

- **It gives us a race coordinate for free.** Every point on the track maps to a distance along the
  centreline. That single number is what the shared camera will need to know who the backmarker is,
  what the eliminator line has to chase, and what a lap counter counts. A polygon soup can tell you
  where a wall is; it cannot tell you who is winning.
- **The picture and the collision are already separate**, which the design plan calls the most
  important asset decision and free if made now. The simulation owns line segments; the drawing is
  built from the same data, in a file that never touches the simulation.
- **The geometry cannot go wrong quietly.** Straights are exactly straight and arcs are exactly
  circular, so a corner's radius is a number you can compare against the car's turning circle. The
  first attempt used a spline through the same points; it looked equally plausible and had hidden a
  58-unit apex inside a 96-unit road, which is a wall lying across the track. Tests now assert that
  no wall ever cuts inside the road and that no wall crosses another.

What it cannot express is a fork, a crossover, or an open arena. Those want a *graph* of these strips
rather than one loop, which is an extension rather than a rewrite, because everything downstream
consumes samples and wall segments.

## Hitting things

Wall response is hand-written next to the car model, for the same reason the car model is: a generic
solver stops the car correctly and feels like nothing at all. Measured at top speed, 620 u/s:

| You hit it at | You keep | And |
| --- | --- | --- |
| 5° | 96% | a nudge back towards parallel |
| 10° | 91% | still going where you were going |
| 15° | 85% | the last angle that counts as a scrape |
| 30° | 60% | that hurt |
| 45° | 36% | and the wall swings the back round at 2.4 rad/s |
| 90° | 20% | stopped dead in 0.8 s, and 0.9 s to reverse clear |

Most of that curve falls out of one relationship rather than being drawn by hand: the speed lost
along a wall is Coulomb friction, proportional to how hard the car went into it, so the cost scales
with the tangent of the angle by itself. One dial then gives a cheap graze, a ruinous square hit, and
a lean on a barrier that costs exactly as much as you are leaning on it.

**Sliding along a wall is nearly free.** Two seconds of full throttle along a barrier you are
brushing covers 1228 units against 1236 with no wall there at all, and you still finish at top speed.
Lean into it and you keep 329 of 620. Hold full lock into it and it stops you, which it should.

The car's collision shape is a **capsule** down its spine, not a rotated rectangle. The difference
only shows where a wall ends or two walls meet - exactly where a rectangle solver has to choose
between competing axes, and where a car parked in a corner buzzes between two answers. Press **C** to
see it drawn on the car.

### One more bug this caught

Driving the lab under software rendering, the car took four seconds to reach a speed it hits in a
third of one. Phaser smooths the delta it hands to `update()`, and once a frame runs longer than its
`fps.min` window it substitutes an older value instead. Sensible for tweens, catastrophic for us: the
accumulator was fed less time than really passed, so the **whole simulation quietly ran in slow
motion and never recovered**. The scene now reads `game.loop.rawDelta` and does its own clamping,
which is what the fixed timestep was for in the first place. Nothing in the simulation was wrong; the
time going into it was.

## The boost is meant to be awkward

The original's boost had no button. You tapped the brake, then double-tapped accelerate. It was the
most criticised control in the game, and it is in here deliberately: the brief was "warts and all".

It is faithful right down to the maths being marginal. Measured in this build at top speed:

| | |
| --- | --- |
| 100 ms brake tap | Costs you 253 u/s |
| 50 ms brake tap | Costs you 110 u/s |
| The boost you get | +140 u/s over the cruise cap, for 900 ms |

So a clumsy boost loses you more than it gives, and a sharp one just about pays. That is exactly the
"something to master, for minimal advantage" the 2012 reviews describe, and it falls out of the
model rather than being faked.

Press **F** to switch to a plain Shift-to-boost and feel the difference back to back. Faithful is
the default, and `FAITHFUL_BOOST_DEFAULT` in
[`src/game/sim/boostCombo.ts`](src/game/sim/boostCombo.ts) is the one line that decides it.

## How it is put together

```
src/
  main.ts                     Phaser boot
  game/
    theme.ts                  The palette. The four player colours ARE the brand.
    gameConfig.ts             Phaser config - note: no physics engine is registered
    sim/                      Pure TypeScript. No Phaser import anywhere in here.
      handling.ts             Every tunable constant, plus the slider metadata
      carModel.ts             The handling model
      wallCollision.ts        What happens when the car meets a wall
      boostCombo.ts           The faithful brake-tap/double-tap detector
      fixedStep.ts            The 60 Hz accumulator
    track/                    Also pure. What a track is, and how one is built.
      trackTypes.ts           The representation, and why it is that one
      buildTrack.ts           Vertices and radii in, centreline and walls out
      segmentGrid.ts          Broadphase, in a fixed order so collisions stay deterministic
      tracks/cuttersYard.ts   The track itself: fourteen corners
    render/trackRenderer.ts   The only file in the track pipeline that knows Phaser exists
    input/keyboardInput.ts    Keys in, car input out
    session/                  Pure TypeScript. No Phaser import in session.ts.
      session.ts              The session state machine: rounds, scores, first to ten
      controls.ts             Which keys and which colour belong to which seat
      navigation.ts           Which screen shows which phase
      store.ts                The live session, and handing over between screens
    scenes/
      FeelLabScene.ts         The lab
      IdentityScene.ts        The base every screen is built on
      TitleScene.ts           ...and the five screens themselves
      LineupScene.ts
      RoundScene.ts
      ScoreboardScene.ts
      ChampionScene.ts
    ui/
      kit/                    The identity: tokens, chrome, the wordmark, the race HUD
      tuningPanel.ts          The tuning panel, the readout, the minimap, saved values
```

Three decisions worth knowing about, because they are hard to reverse:

**We own the physics.** Phaser's Arcade Physics is not used - its bodies are always axis-aligned and
cannot rotate, which is disqualifying for a game whose whole feel is cars hitting each other at
angles. Matter.js is not used either: a general rigid-body solver models a car as a sliding brick,
and you would spend the project fighting it. The model in `carModel.ts` is about 100 lines and every
constant in it is a dial we control.

**Fixed 60 Hz timestep, from the first commit.** The simulation runs at a constant rate no matter
what the display does, so a handling value means the same thing on a 60 Hz laptop and a 144 Hz
monitor. Rendering interpolates between the last two steps so a fast display does not add judder
that would be misread as bad handling. This is cheap now and painful to retrofit, and it is what
keeps input recording, deterministic replay and headless tuning available later.

**The simulation has no Phaser in it.** `src/game/sim` and `src/game/track` are pure and testable,
which is why the handling and the geometry can be covered by real tests rather than by clicking
about. Collisions resolve in a fixed segment order and touch `dt` only in the wall-guidance term, so
a drive at 30, 60 and 144 frames a second lands on bit-identical numbers. There is a test that says
so. `src/game/session/session.ts` is written the same way and for the same reason: the screens are a
rendering of that state, so "a session reaches ten and ends" is a test rather than something you
find out by playing.

**The look lives in `src/game/ui/kit`, not in the screens.** Tokens, hazard tape, slabs, keycaps,
score pips, the wordmark and the race HUD are all components, and the screens are compositions of
them. That is what stops the round scoreboard and the in-game furniture inventing a second visual
identity later. Two rules inside it are load-bearing: **red belongs to the eliminator alone** and
never appears as chrome, and **hazard yellow is the chrome except where player colours are on
screen** - player one is that same yellow, so any screen showing drivers steps its chrome back.

### One bug this already caught

The first version of the model split the car's velocity across the **old** heading, turned the car,
and recomposed onto the **new** one. That rigidly drags the velocity round with the nose, so the car
turned perfectly and could never slide at all - and reading the code did not reveal it, because the
comment next to it described the correct behaviour. Driving it for ten seconds did.

Rotation now happens first and the velocity is split afterwards, which is what actually creates
sideways speed. Two tests in `carModel.test.ts` pin it down. This is the argument for the feel lab
in miniature: the handling cannot be judged on paper.

## What is deliberately not here yet

Each of these is its own piece of work, and none of them should start before the car feels right.

- **The shared camera.** The defining mechanic - one frame holding every player, zooming to fit,
  with a trailing edge that eliminates the backmarker. The camera in the lab is Phaser's plain
  follow and is a placeholder, nothing more.
- **The eliminator line**, and everything about making elimination feel fair rather than random.
- **More tracks.** The representation supports them; there is one.
- **A second car on the same keyboard**, then gamepads and cars three and four. The grid screen
  already names both seats and reserves the space for the other two.
- **Settings, audio options, customisation, unlockables, a single-player mode, anything online.**
  None of these are in the MVP and none of them have a menu entry waiting for them.
- **Weapons**, which manipulate position rather than subtracting health. There is no health bar in
  this game and there should never be one.
- **Airstrikes** for eliminated players, so nobody sits and watches.

## Licence and provenance

An original work. The mechanics and rules of this genre are free to rebuild, and that is what this
is: our own name, our own art, our own tracks, written from scratch. No assets, code, audio or
authored track layouts from any other game are used here.
