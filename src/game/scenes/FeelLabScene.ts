/**
 * The feel lab: one car, an empty plane, and every handling dial live.
 *
 * The argument for building this before anything else is in the design report: if a lone car on an
 * empty plane is not enjoyable to drive, nothing downstream saves it. So there is deliberately no
 * track, no camera work, no eliminator and no weapons here — only the car.
 *
 * The camera below is Phaser's plain follow, on purpose. SHUNT's real camera is the shared
 * zoom-to-fit frame that eliminates the backmarker, and it is a whole work item of its own; putting
 * a placeholder here keeps the spike about the car.
 */

import Phaser from 'phaser';
import { CAR_LENGTH, CAR_WIDTH, type HandlingConstants } from '../sim/handling';
import {
  createCarInput,
  createCarState,
  stepCar,
  type CarState,
  type CarTelemetry,
} from '../sim/carModel';
import { FixedStepLoop } from '../sim/fixedStep';
import { BoostComboDetector, FAITHFUL_BOOST_DEFAULT } from '../sim/boostCombo';
import { KeyboardDriver, isTypingTarget, toCarInput } from '../input/keyboardInput';
import { PALETTE } from '../theme';
import { DebugOverlay } from '../ui/debugOverlay';
import { TuningPanel } from '../ui/tuningPanel';
import { loadHandling } from '../ui/tuningStore';

const GRID_TILE = 128;
const GRID_TEXTURE_KEY = 'shunt-grid';
/** How many recent sliding positions the tyre-mark trail keeps. */
const TRAIL_LENGTH = 240;
const CAMERA_LERP = 0.12;
/** Distance rings on the plane, in world units. */
const RING_RADII = [240, 600, 1200] as const;

interface TrailPoint {
  x: number;
  y: number;
  heading: number;
}

export class FeelLabScene extends Phaser.Scene {
  private handling!: HandlingConstants;
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

  private loop!: FixedStepLoop;
  private driver!: KeyboardDriver;
  private combo!: BoostComboDetector;
  private faithfulBoost = FAITHFUL_BOOST_DEFAULT;
  private lastBoostButton = false;

  private grid!: Phaser.GameObjects.TileSprite;
  private body!: Phaser.GameObjects.Container;
  private trailGraphics!: Phaser.GameObjects.Graphics;
  private originMarker!: Phaser.GameObjects.Graphics;
  private trail: TrailPoint[] = [];
  private showTrail = true;

  private panel!: TuningPanel;
  private overlay!: DebugOverlay;
  private stepsThisFrame = 0;

  constructor() {
    super('FeelLab');
  }

  create(): void {
    this.handling = loadHandling();
    this.car = createCarState(0, 0);
    this.previous = { x: this.car.x, y: this.car.y, heading: this.car.heading };
    this.loop = new FixedStepLoop();
    this.driver = new KeyboardDriver();
    this.combo = new BoostComboDetector();

    this.cameras.main.setBackgroundColor(PALETTE.asphalt);
    this.buildGrid();

    this.originMarker = this.add.graphics();
    this.drawOriginMarker();

    this.trailGraphics = this.add.graphics();
    this.body = this.buildCar();

    this.cameras.main.startFollow(this.body, false, CAMERA_LERP, CAMERA_LERP);
    this.cameras.main.setZoom(0.9);

    this.mountDom();
    window.addEventListener('keydown', this.onHotkey);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
  }

  update(_time: number, deltaMs: number): void {
    this.previous = { x: this.car.x, y: this.car.y, heading: this.car.heading };

    this.stepsThisFrame = this.loop.advance(deltaMs, (dt) => this.simulate(dt));
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

    if (this.telemetry.slipping && this.telemetry.speed > 40) {
      this.trail.push({ x: this.car.x, y: this.car.y, heading: this.car.heading });
      if (this.trail.length > TRAIL_LENGTH) this.trail.shift();
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
    this.grid.setSize(camera.width / camera.zoom + GRID_TILE * 2, camera.height / camera.zoom + GRID_TILE * 2);
    this.grid.setTilePosition(camera.midPoint.x, camera.midPoint.y);

    this.drawTrail();

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
    });
  }

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
   * Distance rings and a start bar. They exist so speed and corner radius can be judged by eye
   * rather than only read off the numbers — nothing overlaps the spawn point, so the car is never
   * competing with the furniture for attention.
   */
  private drawOriginMarker(): void {
    this.originMarker.setDepth(-9);

    for (const radius of RING_RADII) {
      this.originMarker.lineStyle(2, PALETTE.line, 1);
      this.originMarker.strokeCircle(0, 0, radius);
      // Cardinal ticks, so which ring you are on is readable at a glance while moving.
      this.originMarker.lineStyle(3, PALETTE.line, 1);
      this.originMarker.lineBetween(radius - 14, 0, radius + 14, 0);
      this.originMarker.lineBetween(-radius - 14, 0, -radius + 14, 0);
      this.originMarker.lineBetween(0, radius - 14, 0, radius + 14);
      this.originMarker.lineBetween(0, -radius - 14, 0, -radius + 14);
    }

    // Start bar, hazard striped, sitting behind the spawn point.
    const halfBar = 120;
    for (let x = -halfBar; x < halfBar; x += 24) {
      this.originMarker.fillStyle(x % 48 === 0 ? PALETTE.player1 : PALETTE.line, 0.9);
      this.originMarker.fillRect(x, 44, 24, 10);
    }
  }

  /**
   * The car is drawn rather than loaded. At this stage art would only be a distraction, and the
   * identity's four player colours mean a flat shape with a clear nose reads perfectly well.
   */
  private buildCar(): Phaser.GameObjects.Container {
    const shape = this.add.graphics();
    const halfW = CAR_WIDTH / 2;
    const halfL = CAR_LENGTH / 2;

    // Drop shadow, so the car sits above the plane rather than on it.
    shape.fillStyle(0x000000, 0.45);
    shape.fillRoundedRect(-halfW + 3, -halfL + 5, CAR_WIDTH, CAR_LENGTH, 7);

    shape.fillStyle(PALETTE.player1, 1);
    shape.fillRoundedRect(-halfW, -halfL, CAR_WIDTH, CAR_LENGTH, 7);

    // Dark cockpit towards the back and a white wedge at the nose. Which way the car is pointing
    // has to be unmistakable in peripheral vision, because that is how it will be read in a race.
    shape.fillStyle(0x000000, 0.55);
    shape.fillRect(-halfW + 4, -2, CAR_WIDTH - 8, 20);
    shape.fillStyle(PALETTE.text, 1);
    shape.beginPath();
    shape.moveTo(0, -halfL + 3);
    shape.lineTo(halfW - 5, -halfL + 15);
    shape.lineTo(-halfW + 5, -halfL + 15);
    shape.closePath();
    shape.fillPath();

    const container = this.add.container(0, 0, [shape]);
    // Sprite art points up the screen; the model's heading 0 points along +x, so rotate to match.
    shape.setAngle(90);
    container.setDepth(5);
    return container;
  }

  private drawTrail(): void {
    this.trailGraphics.clear();
    if (!this.showTrail) return;
    this.trailGraphics.setDepth(-1);

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
    this.panel = new TuningPanel({ values: this.handling });
    host.appendChild(this.overlay.root);
    host.appendChild(this.panel.root);
  }

  private readonly onHotkey = (event: KeyboardEvent): void => {
    if (isTypingTarget(event.target)) return;
    switch (event.code) {
      case 'KeyR':
        this.resetCar();
        break;
      case 'KeyP':
        this.panel.toggle();
        break;
      case 'KeyO':
        this.overlay.toggle();
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

  private resetCar(): void {
    this.car = createCarState(0, 0);
    this.previous = { x: 0, y: 0, heading: this.car.heading };
    this.trail = [];
    this.combo.reset();
    this.telemetry = stepCar(this.car, createCarInput(), this.handling, this.loop.stepSeconds);
  }

  private teardown(): void {
    window.removeEventListener('keydown', this.onHotkey);
    this.driver.destroy();
    this.panel.destroy();
    this.overlay.destroy();
  }
}
