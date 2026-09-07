# SHUNT

A top-down combat racer, rebuilt so it can be played again.

SHUNT is a fresh recreation of the *kind* of game *Wrecked: Revenge Revisited* and its predecessor
*Mashed* were: four cars on **one shared screen**, a camera that zooms to fit everybody, and a
trailing edge that eliminates whoever falls behind. Its own name, its own art, its own tracks. The
mechanics and the feel are what we are chasing; nothing is copied.

**This repository is at the very start of that.** What exists today is the project skeleton and the
car handling lab — one car, an empty plane, and every handling dial live on screen. There is no
track, no camera work, no eliminator line and no weapons yet, on purpose.

---

## Run it

```bash
npm install
npm run dev
```

Open the URL it prints. You are driving immediately — no menu, no loading.

| | |
| --- | --- |
| `npm run dev` | Play it, with live reload |
| `npm test` | Run the simulation tests |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm run build` | Production build |

## Drive it

| Key | Does |
| --- | --- |
| **Arrows** or **WASD** | Steer, accelerate, brake — and reverse, if you keep braking once stopped |
| **Brake tap, then double-tap accelerate** | Boost. Yes, really — see "The boost is meant to be awkward" below |
| **Shift** | Boost, but only when the faithful combo is switched off (`F`) |
| **R** | Put the car back at the start |
| **P** | Show or hide the handling panel |
| **O** | Show or hide the readout |
| **T** | Tyre marks on or off |
| **F** | Faithful boost combo on or off |

## The handling panel is the point

The panel down the right-hand side is not a debug afterthought, it is the deliverable. Every number
that a driver can feel is a slider, and moving one changes the car **on the next frame** — no
rebuild, no reload. Your values are saved in the browser, so what you found last night is still
there in the morning.

When you land on something you like:

- **Copy JSON** puts the whole set on your clipboard.
- **Copy as code** gives you a `DEFAULT_HANDLING` block you can paste straight over the one in
  [`src/game/sim/handling.ts`](src/game/sim/handling.ts). That is how a good session becomes the new
  baseline for everyone.
- **Reset** goes back to the values committed in that file.

The readout in the top-left shows the things you cannot see: how much of your speed is going
sideways, whether the tyres have actually let go, and — because the boost combo is famously
obscure — exactly where in the combo your fingers are.

## The numbers, and why

Units are world units and seconds. **16 world units = 1 metre**, and the car is 30 x 56 units, so
roughly 1.9 m x 3.5 m — a stubby arcade car. The readout converts to m/s and km/h so the speeds can
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

### How the grip numbers were chosen

Driving it, not reasoning about it. Three behaviours were the target, and these values hit all three:

| Situation | What happens | Measured |
| --- | --- | --- |
| Full lock at top speed | Breaks traction into a holdable power slide | 28% of speed going sideways, tyres SLIDING |
| Release the steering | Snaps back into line, quickly but not instantly | Gripping again in under 0.6 s |
| Full lock at half speed | Grips all the way round | 21% sideways, never breaks away |

So the car grips through an ordinary corner and steps out when you commit at speed. That is the
behaviour to argue with first — if it is wrong, it is the fastest thing to change and everything
else is downstream of it.

### The boost is meant to be awkward

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
    gameConfig.ts             Phaser config — note: no physics engine is registered
    sim/                      Pure TypeScript. No Phaser import anywhere in here.
      handling.ts             Every tunable constant, plus the slider metadata
      carModel.ts             The handling model
      boostCombo.ts           The faithful brake-tap/double-tap detector
      fixedStep.ts            The 60 Hz accumulator
    input/keyboardInput.ts    Keys in, car input out
    scenes/FeelLabScene.ts    The lab
    ui/                       The tuning panel, the readout, saved values
```

Three decisions worth knowing about, because they are hard to reverse:

**We own the physics.** Phaser's Arcade Physics is not used — its bodies are always axis-aligned and
cannot rotate, which is disqualifying for a game whose whole feel is cars hitting each other at
angles. Matter.js is not used either: a general rigid-body solver models a car as a sliding brick,
and you would spend the project fighting it. The model in `carModel.ts` is about 100 lines and every
constant in it is a dial we control.

**Fixed 60 Hz timestep, from the first commit.** The simulation runs at a constant rate no matter
what the display does, so a handling value means the same thing on a 60 Hz laptop and a 144 Hz
monitor. Rendering interpolates between the last two steps so a fast display does not add judder
that would be misread as bad handling. This is cheap now and painful to retrofit, and it is what
keeps input recording, deterministic replay and headless tuning available later.

**The simulation has no Phaser in it.** `src/game/sim` is pure and testable, which is why the
handling can be covered by real tests rather than by clicking about.

### One bug this already caught

The first version of the model split the car's velocity across the **old** heading, turned the car,
and recomposed onto the **new** one. That rigidly drags the velocity round with the nose, so the car
turned perfectly and could never slide at all — and reading the code did not reveal it, because the
comment next to it described the correct behaviour. Driving it for ten seconds did.

Rotation now happens first and the velocity is split afterwards, which is what actually creates
sideways speed. Two tests in `carModel.test.ts` pin it down. This is the argument for the feel lab
in miniature: the handling cannot be judged on paper.

## What is deliberately not here yet

Each of these is its own piece of work, and none of them should start before the car feels right.

- **The shared camera.** The defining mechanic — one frame holding every player, zooming to fit,
  with a trailing edge that eliminates the backmarker. The camera in the lab is Phaser's plain
  follow and is a placeholder, nothing more.
- **The eliminator line**, and everything about making elimination feel fair rather than random.
- **Tracks**, and the split between what you can drive on and what you can see.
- **A second car on the same keyboard**, then gamepads and cars three and four.
- **Weapons**, which manipulate position rather than subtracting health. There is no health bar in
  this game and there should never be one.
- **Airstrikes** for eliminated players, so nobody sits and watches.

## Licence and provenance

An original work. The mechanics and rules of this genre are free to rebuild, and that is what this
is: our own name, our own art, our own tracks, written from scratch. No assets, code, audio or
authored track layouts from any other game are used here.
