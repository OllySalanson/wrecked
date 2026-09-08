/**
 * The feel lab: one car, one circuit, and every handling dial live.
 *
 * It started as a car on an empty plane, because if a lone car is not enjoyable to drive nothing
 * downstream saves it. It now has walls, for the reason the design report gives: an empty plane
 * tells you about acceleration and turning and nothing at all about impacts, about scraping along a
 * barrier, or about being shoved into one. Those are handling too, and they cannot be judged
 * without something to hit.
 *
 * Still deliberately absent: the shared zoom-to-fit camera, the eliminator line, weapons and a
 * second car. The camera below is Phaser's plain follow, and it is a placeholder - SHUNT's real
 * camera is a work item of its own and putting a sketch of it here would only make the car harder
 * to judge.
 */

import Phaser from 'phaser';
import { CAR_COLLISION_RADIUS, CAR_SPINE_HALF_LENGTH } from '../sim/handling';
import type { HandlingConstants } from '../sim/handling';
import {
  createCarInput,
  createCarState,
  stepCar,
  type CarState,
  type CarTelemetry,
} from '../sim/carModel';
import { resolveWallCollisions, type WallImpact } from '../sim/wallCollision';
import { FixedStepLoop } from '../sim/fixedStep';
import { BoostComboDetector, FAITHFUL_BOOST_DEFAULT } from '../sim/boostCombo';
import { KeyboardDriver, isTypingTarget, toCarInput } from '../input/keyboardInput';
import { buildTrack, buildWallGrid, trackPositionOf } from '../track/buildTrack';
import { CUTTERS_YARD } from '../track/tracks/cuttersYard';
import type { SegmentGrid } from '../track/segmentGrid';
import type { Track } from '../track/trackTypes';
import { drawTrack, type TrackView } from '../render/trackRenderer';
import { PALETTE } from '../theme';
import { drawCarBody } from '../ui/kit/carShape';
import { DebugOverlay } from '../ui/debugOverlay';
import { Minimap } from '../ui/minimap';
import { TuningPanel } from '../ui/tuningPanel';
import { loadHandling } from '../ui/tuningStore';
import { SCENE_KEYS, sceneAfterLab } from '../session/navigation';
import { readSession } from '../session/store';

const GRID_TILE = 128;
const GRID_TEXTURE_KEY = 'shunt-grid';
/** How many recent sliding positions the tyre-mark trail keeps. */
const TRAIL_LENGTH = 240;
const CAMERA_LERP = 0.12;
const CAMERA_ZOOM = 0.78;

/** Impact severity below which nothing is thrown at the screen. */
const SHAKE_THRESHOLD = 0.3;
const SPARK_LIFE_TICKS = 26;
const MAX_SPARKS = 90;
/** Lap distance a car must have covered before crossing the line counts as a lap. */
const LAP_MINIMUM_FRACTION = 0.6;

interface TrailPoint {
  x: number;
  y: number;
  heading: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  hot: boolean;
}

export class FeelLabScene extends Phaser.Scene {
  private handling!: HandlingConstants;
  private track!: Track;
  private wallGrid!: SegmentGrid;
  private wallScratch: number[] = [];

  private car!: CarState;
  private previous!: { x: number; y: number; heading: number };
  private telemetry: CarTelemetry = {
    speed: 0,
    forwardSpeed: 0,
    lateralSpeed: 0,
    slipping: false,
    boosting: false,
    boostReady: true,
  };
  private impact: WallImpact | null = null;
  private lastRealHit: WallImpact | null = null;
  private contactTicks = 0;

  private loop!: FixedStepLoop;
  private driver!: KeyboardDriver;
  private combo!: BoostComboDetector;
  private faithfulBoost = FAITHFUL_BOOST_DEFAULT;
  private lastBoostButton = false;

  private grid!: Phaser.GameObjects.TileSprite;
  private trackView!: TrackView;
  private body!: Phaser.GameObjects.Container;
  private trailGraphics!: Phaser.GameObjects.Graphics;
  private effectGraphics!: Phaser.GameObjects.Graphics;
  private trail: TrailPoint[] = [];
  private sparks: Spark[] = [];
  private showTrail = true;
  private showShapes = false;

  private lapDistance = 0;
  private lapProgress = 0;
  private lapTicks = 0;
  private lapCount = 0;
  private lastLapSeconds = 0;
  private bestLapSeconds = 0;

  private panel!: TuningPanel;
  private overlay!: DebugOverlay;
  private minimap!: Minimap;
  private stepsThisFrame = 0;

  constructor() {
    super(SCENE_KEYS.feelLab);
  }

  create(): void {
    this.handling = loadHandling();
    this.track = buildTrack(CUTTERS_YARD);
    this.wallGrid = buildWallGrid(this.track);

    this.loop = new FixedStepLoop();
    this.driver = new KeyboardDriver();
    this.combo = new BoostComboDetector();

    this.cameras.main.setBackgroundColor(PALETTE.asphalt);
    this.buildGrid();
    this.trackView = drawTrack(this, this.track);

    this.trailGraphics = this.add.graphics().setDepth(-1);
    this.effectGraphics = this.add.graphics().setDepth(6);
    this.body = this.buildCar();

    this.resetCar();

    this.cameras.main.startFollow(this.body, false, CAMERA_LERP, CAMERA_LERP);
    this.cameras.main.setZoom(CAMERA_ZOOM);

    this.mountDom();
    window.addEventListener('keydown', this.onHotkey);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
  }

  update(): void {
    this.previous = { x: this.car.x, y: this.car.y, heading: this.car.heading };

    // `rawDelta`, not the `delta` Phaser hands to update(). Phaser smooths its delta and, once a
    // frame runs longer than its `fps.min` window, substitutes an older value instead - which is
    // sensible for tweens and catastrophic here: the accumulator is fed less time than really
    // passed, so the whole simulation quietly runs in slow motion and never recovers. Found by
    // driving this in software rendering, where the car took four seconds to reach a speed it
    // should hit in a third of one. The fixed-step loop owns the time policy, including the clamp
    // that stops a long stall becoming a burst of catch-up steps, so it wants the real number.
    this.stepsThisFrame = this.loop.advance(this.game.loop.rawDelta, (dt) => this.simulate(dt));
    this.render();
  }

  private simulate(dt: number): void {
    const buttons = this.driver.read();
    const dtMs = dt * 1000;

    const comboFired = this.combo.update(buttons.throttleDown, buttons.brakeDown, dtMs);
    // Plain button is rising-edge only, so holding Shift does not re-trigger every tick.
    const boostRequested = this.faithfulBoost
      ? comboFired
      : buttons.boostButtonDown && !this.lastBoostButton;
    this.lastBoostButton = buttons.boostButtonDown;

    const input = toCarInput(buttons, boostRequested);
    this.telemetry = stepCar(this.car, input, this.handling, dt);

    // Walls resolve after the model has moved the car: the model says where it wanted to go, this
    // says what the world had to say about it.
    const speedBefore = this.telemetry.speed;
    this.impact = resolveWallCollisions(
      this.car,
      this.track.walls,
      this.wallGrid,
      this.handling,
      dt,
      this.wallScratch,
    );
    if (this.impact) {
      this.contactTicks += 1;
      if (this.impact.severity > 0) this.lastRealHit = this.impact;
      this.spawnSparks(this.impact, speedBefore);
      if (this.impact.severity >= SHAKE_THRESHOLD) {
        this.cameras.main.shake(
          90 + this.impact.severity * 120,
          0.002 + this.impact.severity * 0.004,
        );
      }
      // The collision changed the velocity, so the readout has to be told or it will show the
      // speed the car would have had if the wall had not been there - which is exactly the number
      // you are trying to compare against while tuning a wall.
      const cos = Math.cos(this.car.heading);
      const sin = Math.sin(this.car.heading);
      this.telemetry.speed = Math.hypot(this.car.vx, this.car.vy);
      this.telemetry.forwardSpeed = this.car.vx * cos + this.car.vy * sin;
      this.telemetry.lateralSpeed = -this.car.vx * sin + this.car.vy * cos;
      this.telemetry.slipping = Math.abs(this.telemetry.lateralSpeed) > this.handling.slipThreshold;
    } else {
      this.contactTicks = 0;
    }

    this.updateLap(dt);
    this.stepSparks();

    if (this.telemetry.slipping && this.telemetry.speed > 40) {
      this.trail.push({ x: this.car.x, y: this.car.y, heading: this.car.heading });
      if (this.trail.length > TRAIL_LENGTH) this.trail.shift();
    }
  }

  /** Lap timing, so the track's own numbers can be argued with as easily as the car's. */
  private updateLap(dt: number): void {
    const position = trackPositionOf(this.track, this.car.x, this.car.y);
    const previousProgress = this.lapProgress;
    this.lapProgress = position.distance / this.track.length;
    this.lapDistance = position.distance;
    this.lapTicks += 1;

    // Crossing the line forwards, having actually been round most of the lap - so reversing over
    // the line, or wobbling across it, does not award anything.
    const crossed = previousProgress > LAP_MINIMUM_FRACTION && this.lapProgress < 0.2;
    if (crossed) {
      this.lastLapSeconds = this.lapTicks * dt;
      if (this.bestLapSeconds === 0 || this.lastLapSeconds < this.bestLapSeconds) {
        this.bestLapSeconds = this.lastLapSeconds;
      }
      this.lapCount += 1;
      this.lapTicks = 0;
    }
  }

  private render(): void {
    // Interpolate between the last two simulation steps so a 144 Hz display does not add judder
    // that would be misread as bad handling.
    const alpha = this.loop.alpha;
    this.body.x = Phaser.Math.Linear(this.previous.x, this.car.x, alpha);
    this.body.y = Phaser.Math.Linear(this.previous.y, this.car.y, alpha);
    this.body.rotation = Phaser.Math.Angle.RotateTo(
      this.previous.heading,
      this.car.heading,
      Math.abs(Phaser.Math.Angle.Wrap(this.car.heading - this.previous.heading)) * alpha,
    );

    const camera = this.cameras.main;
    this.grid.setPosition(camera.midPoint.x, camera.midPoint.y);
    this.grid.setSize(
      camera.width / camera.zoom + GRID_TILE * 2,
      camera.height / camera.zoom + GRID_TILE * 2,
    );
    this.grid.setTilePosition(camera.midPoint.x, camera.midPoint.y);

    this.drawTrail();
    this.drawEffects();
    this.minimap.render(this.car.x, this.car.y, this.car.heading, '#ffd200');

    this.overlay.render({
      fps: this.game.loop.actualFps,
      stepsThisFrame: this.stepsThisFrame,
      ticks: this.loop.ticksElapsed,
      telemetry: this.telemetry,
      heading: this.car.heading,
      angularVelocity: this.car.angularVelocity,
      x: this.car.x,
      y: this.car.y,
      faithfulBoost: this.faithfulBoost,
      combo: this.combo.state,
      track: {
        name: this.track.definition.name,
        lapProgress: this.lapProgress,
        lapDistance: this.lapDistance,
        lapLength: this.track.length,
        laps: this.lapCount,
        lastLapSeconds: this.lastLapSeconds,
        bestLapSeconds: this.bestLapSeconds,
        touching: this.impact !== null,
        contactTicks: this.contactTicks,
        lastHit: this.lastRealHit,
      },
    });
  }

  // --- impact effects --------------------------------------------------------------------------

  /**
   * Sparks. Not decoration: they are how you see *where* on the car the wall was hit, which is the
   * difference between "that felt wrong" and "I clipped it with the left front".
   *
   * Spawned from inside the simulation step so a hit that happens between two rendered frames is
   * still seen. Nothing here is ever read back by the car or the walls, so the randomness below
   * cannot make the simulation itself non-deterministic.
   */
  private spawnSparks(impact: WallImpact, speedBefore: number): void {
    if (speedBefore < 30) return;
    const hard = impact.severity >= SHAKE_THRESHOLD;
    const count = hard ? 10 : this.contactTicks % 3 === 0 ? 2 : 0;
    const tangentX = -impact.ny;
    const tangentY = impact.nx;

    for (let i = 0; i < count && this.sparks.length < MAX_SPARKS; i += 1) {
      const spread = (Math.random() - 0.5) * (hard ? 2.4 : 1.1);
      const speed = (hard ? 120 : 45) + Math.random() * speedBefore * (hard ? 0.35 : 0.18);
      const along = Math.sign(this.car.vx * tangentX + this.car.vy * tangentY) || 1;
      this.sparks.push({
        x: impact.x,
        y: impact.y,
        vx: (impact.nx + tangentX * along * spread) * speed,
        vy: (impact.ny + tangentY * along * spread) * speed,
        life: SPARK_LIFE_TICKS,
        hot: hard,
      });
    }
  }

  private stepSparks(): void {
    const dt = this.loop.stepSeconds;
    for (let i = this.sparks.length - 1; i >= 0; i -= 1) {
      const spark = this.sparks[i];
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.vx *= 0.9;
      spark.vy *= 0.9;
      spark.life -= 1;
      if (spark.life <= 0) this.sparks.splice(i, 1);
    }
  }

  private drawEffects(): void {
    this.effectGraphics.clear();
    for (const spark of this.sparks) {
      const fade = spark.life / SPARK_LIFE_TICKS;
      this.effectGraphics.fillStyle(spark.hot ? PALETTE.text : PALETTE.player1, fade);
      this.effectGraphics.fillCircle(spark.x, spark.y, spark.hot ? 2.6 : 1.8);
    }

    if (!this.showShapes) return;
    // The collision shape, on demand. Worth having visible while tuning the wall block: the capsule
    // is not the drawn car, and knowing exactly where the two differ stops you chasing a feel
    // problem that is really a shape problem.
    // Drawn around the car's rendered position rather than its simulation position, so the shape
    // sits on the car you can see. They are at most one simulation step apart.
    this.effectGraphics.lineStyle(1, PALETTE.player3, 0.9);
    const cos = Math.cos(this.body.rotation);
    const sin = Math.sin(this.body.rotation);
    for (const end of [1, -1]) {
      this.effectGraphics.strokeCircle(
        this.body.x + cos * CAR_SPINE_HALF_LENGTH * end,
        this.body.y + sin * CAR_SPINE_HALF_LENGTH * end,
        CAR_COLLISION_RADIUS,
      );
    }
    if (this.impact) {
      this.effectGraphics.lineStyle(2, PALETTE.danger, 1);
      this.effectGraphics.lineBetween(
        this.impact.x,
        this.impact.y,
        this.impact.x + this.impact.nx * 46,
        this.impact.y + this.impact.ny * 46,
      );
    }
  }

  // --- scenery ---------------------------------------------------------------------------------

  private buildGrid(): void {
    if (!this.textures.exists(GRID_TEXTURE_KEY)) {
      const tile = this.make.graphics({ x: 0, y: 0 }, false);
      tile.fillStyle(PALETTE.asphalt, 1);
      tile.fillRect(0, 0, GRID_TILE, GRID_TILE);
      tile.lineStyle(1, PALETTE.line, 0.55);
      tile.strokeRect(0.5, 0.5, GRID_TILE - 1, GRID_TILE - 1);
      tile.lineStyle(1, PALETTE.line, 0.25);
      tile.lineBetween(GRID_TILE / 2, 0, GRID_TILE / 2, GRID_TILE);
      tile.lineBetween(0, GRID_TILE / 2, GRID_TILE, GRID_TILE / 2);
      tile.generateTexture(GRID_TEXTURE_KEY, GRID_TILE, GRID_TILE);
      tile.destroy();
    }

    this.grid = this.add.tileSprite(0, 0, GRID_TILE * 4, GRID_TILE * 4, GRID_TEXTURE_KEY);
    this.grid.setDepth(-10);
  }

  /**
   * The car is drawn rather than loaded. At this stage art would only be a distraction, and the
   * identity's four player colours mean a flat shape with a clear nose reads perfectly well.
   * The shape itself lives in the identity kit so the menus show this exact car.
   */
  private buildCar(): Phaser.GameObjects.Container {
    const shape = this.add.graphics();
    drawCarBody(shape, { colour: PALETTE.player1 });

    const container = this.add.container(0, 0, [shape]);
    // Sprite art points up the screen; the model's heading 0 points along +x, so rotate to match.
    shape.setAngle(90);
    container.setDepth(5);
    return container;
  }

  private drawTrail(): void {
    this.trailGraphics.clear();
    if (!this.showTrail) return;

    for (let i = 0; i < this.trail.length; i += 1) {
      const point = this.trail[i];
      const fade = (i / this.trail.length) * 0.5;
      this.trailGraphics.fillStyle(0x000000, fade);
      const dx = Math.cos(point.heading) * 6;
      const dy = Math.sin(point.heading) * 6;
      this.trailGraphics.fillCircle(point.x - dx, point.y - dy, 4);
      this.trailGraphics.fillCircle(point.x + dx, point.y + dy, 4);
    }
  }

  private mountDom(): void {
    const host = document.getElementById('app') ?? document.body;
    this.overlay = new DebugOverlay();
    this.minimap = new Minimap(this.track);
    this.panel = new TuningPanel({ values: this.handling });
    host.appendChild(this.overlay.root);
    host.appendChild(this.minimap.root);
    host.appendChild(this.panel.root);
  }

  private readonly onHotkey = (event: KeyboardEvent): void => {
    if (isTypingTarget(event.target)) return;
    switch (event.code) {
      case 'Escape':
        // Back to whichever screen the lab was opened from. Opening it never touched the session,
        // so a round that was in progress is still there, on the same score.
        this.scene.start(sceneAfterLab(readSession(this).phase));
        break;
      case 'KeyR':
        this.resetCar();
        break;
      case 'KeyP':
        this.panel.toggle();
        break;
      case 'KeyO':
        this.overlay.toggle();
        break;
      case 'KeyM':
        this.minimap.toggle();
        break;
      case 'KeyC':
        this.showShapes = !this.showShapes;
        break;
      case 'KeyT':
        this.showTrail = !this.showTrail;
        if (!this.showTrail) this.trail = [];
        break;
      case 'KeyF':
        this.faithfulBoost = !this.faithfulBoost;
        this.combo.reset();
        break;
      default:
        break;
    }
  };

  /** Back to the start line, pointing down the road. */
  private resetCar(): void {
    const { x, y, heading } = this.track.start;
    this.car = createCarState(x, y, heading);
    this.previous = { x, y, heading };
    this.trail = [];
    this.sparks = [];
    this.impact = null;
    this.lastRealHit = null;
    this.contactTicks = 0;
    this.lapTicks = 0;
    this.lapProgress = 0;
    this.combo.reset();
    this.telemetry = stepCar(this.car, createCarInput(), this.handling, this.loop.stepSeconds);
  }

  private teardown(): void {
    window.removeEventListener('keydown', this.onHotkey);
    this.driver.destroy();
    this.trackView.destroy();
    this.panel.destroy();
    this.overlay.destroy();
    this.minimap.destroy();
  }
}
