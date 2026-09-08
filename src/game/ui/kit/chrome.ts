/**
 * The identity's parts, as things a screen can ask for.
 *
 * Every menu and every piece of in-game furniture is built out of this file. That is the point: the
 * between-rounds scoreboard and the race HUD inherit the look rather than reinventing it, and a
 * change here is a change everywhere.
 *
 * The vocabulary is small on purpose - a striped hazard band, a slab with a hard border, a keycap,
 * a row of score pips, and one entrance animation.
 */

import Phaser from 'phaser';
import { INK, MOTION, SIZE, SPACE, hex, type_ } from './design';
import { ensureGrainTexture, ensureHazardTexture, ensureVignetteTexture } from './textures';

/* ------------------------------------------------------------------ backdrop */

/** Period of the background stripe wash relative to the hazard tile. */
const WASH_TILE_SCALE = 7;
const RAIL_HEIGHT = 9;
/** Pixels per second the hazard rails crawl. Slow enough to be felt rather than watched. */
const RAIL_DRIFT = 9;

/**
 * Wet asphalt with hazard tape at the edges: the ground every screen stands on.
 *
 * It is sized to the window rather than to the design stage, so the composition can scale while
 * the surface stays full-bleed and the rails stay pinned to the real top and bottom of the screen.
 */
export class Backdrop {
  private readonly scene: Phaser.Scene;
  private readonly fill: Phaser.GameObjects.Rectangle;
  private readonly wash: Phaser.GameObjects.TileSprite;
  private readonly grain: Phaser.GameObjects.TileSprite;
  private readonly vignette: Phaser.GameObjects.Image;
  private readonly railTop: Phaser.GameObjects.TileSprite;
  private readonly railBottom: Phaser.GameObjects.TileSprite;
  private drift = 0;

  constructor(scene: Phaser.Scene, accent: number = INK.hazard) {
    this.scene = scene;
    const hazard = ensureHazardTexture(scene, accent);
    ensureGrainTexture(scene);
    ensureVignetteTexture(scene);

    this.fill = scene.add.rectangle(0, 0, 10, 10, INK.asphalt).setOrigin(0, 0);

    this.wash = scene.add.tileSprite(0, 0, 10, 10, hazard).setOrigin(0, 0);
    this.wash.tileScaleX = WASH_TILE_SCALE;
    this.wash.tileScaleY = WASH_TILE_SCALE;
    // Barely there. The stripes should register as texture, never as pattern.
    this.wash.setAlpha(0.05);

    this.grain = scene.add.tileSprite(0, 0, 10, 10, ensureGrainTexture(scene)).setOrigin(0, 0);
    this.grain.setAlpha(0.9);

    this.vignette = scene.add.image(0, 0, ensureVignetteTexture(scene)).setOrigin(0, 0);

    this.railTop = scene.add.tileSprite(0, 0, 10, RAIL_HEIGHT, hazard).setOrigin(0, 0);
    this.railBottom = scene.add.tileSprite(0, 0, 10, RAIL_HEIGHT, hazard).setOrigin(0, 0);
    for (const rail of [this.railTop, this.railBottom]) rail.setAlpha(0.9);

    this.layout();
  }

  get depthObjects(): Phaser.GameObjects.GameObject[] {
    return [this.fill, this.wash, this.grain, this.vignette, this.railTop, this.railBottom];
  }

  layout(): void {
    const { width, height } = this.scene.scale;
    this.fill.setSize(width, height);
    this.wash.setSize(width, height);
    this.grain.setSize(width, height);
    this.vignette.setDisplaySize(width, height);
    this.railTop.setSize(width, RAIL_HEIGHT).setPosition(0, 0);
    this.railBottom.setSize(width, RAIL_HEIGHT).setPosition(0, height - RAIL_HEIGHT);
  }

  update(deltaMs: number): void {
    this.drift += (RAIL_DRIFT * deltaMs) / 1000;
    this.railTop.tilePositionX = -this.drift;
    this.railBottom.tilePositionX = this.drift;
  }

  destroy(): void {
    for (const object of this.depthObjects) object.destroy();
  }
}

/* ------------------------------------------------------------------ bands and rules */

export interface HazardBandOptions {
  width: number;
  height?: number;
  colour?: number;
  alpha?: number;
  /** Pixels per second of crawl. Zero holds still. */
  drift?: number;
}

/**
 * A length of hazard tape. The signature mark: under the wordmark, across a winner's banner, along
 * the head of a card. Returned as a TileSprite so it can be any width without the stripes stretching.
 */
export function hazardBand(
  scene: Phaser.Scene,
  { width, height = 14, colour = INK.hazard, alpha = 1, drift = 0 }: HazardBandOptions,
): Phaser.GameObjects.TileSprite {
  const band = scene.add.tileSprite(0, 0, width, height, ensureHazardTexture(scene, colour));
  band.setAlpha(alpha);

  if (drift !== 0) {
    const crawl = (_time: number, deltaMs: number): void => {
      band.tilePositionX += (drift * deltaMs) / 1000;
    };
    scene.events.on(Phaser.Scenes.Events.UPDATE, crawl);
    // A scene's event emitter outlives its shutdown, so a band that does not unhook itself leaves a
    // listener behind every time the screen is revisited.
    band.once(Phaser.GameObjects.Events.DESTROY, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, crawl);
    });
  }

  return band;
}

/**
 * A hairline rule with a short bright leader on the left. Signage, not a divider: the eye is meant
 * to start where the bright bit is.
 */
export function rule(
  scene: Phaser.Scene,
  width: number,
  accent: number = INK.hazard,
): Phaser.GameObjects.Graphics {
  const graphics = scene.add.graphics();
  graphics.fillStyle(INK.rule, 1);
  graphics.fillRect(0, 0, width, 2);
  graphics.fillStyle(accent, 1);
  graphics.fillRect(0, 0, Math.min(64, width * 0.2), 2);
  return graphics;
}

/* ------------------------------------------------------------------ slabs */

export interface SlabOptions {
  width: number;
  height: number;
  fill?: number;
  fillAlpha?: number;
  border?: number;
  borderWidth?: number;
  /** A thick coloured edge down the left, the way a hazard sign is edged. */
  edge?: number;
  edgeWidth?: number;
}

/**
 * A hard-edged panel. Square corners everywhere - the identity has exactly one rounded thing in it
 * and that is the car.
 */
export function slab(
  scene: Phaser.Scene,
  {
    width,
    height,
    fill = INK.slab,
    fillAlpha = 0.92,
    border = INK.rule,
    borderWidth = 2,
    edge,
    edgeWidth = 6,
  }: SlabOptions,
): Phaser.GameObjects.Graphics {
  const graphics = scene.add.graphics();
  graphics.fillStyle(fill, fillAlpha);
  graphics.fillRect(-width / 2, -height / 2, width, height);

  if (borderWidth > 0) {
    graphics.lineStyle(borderWidth, border, 1);
    graphics.strokeRect(-width / 2, -height / 2, width, height);
  }

  if (edge !== undefined) {
    graphics.fillStyle(edge, 1);
    graphics.fillRect(-width / 2, -height / 2, edgeWidth, height);
  }

  return graphics;
}

/* ------------------------------------------------------------------ keycaps */

export interface KeycapOptions {
  glyph: string;
  colour?: number;
  size?: number;
  /** A wide cap for a word like ENTER. Defaults to square. */
  width?: number;
}

/** One key, drawn as a key. Centred on its own origin. */
export function keycap(
  scene: Phaser.Scene,
  { glyph, colour = INK.hazard, size = 42, width }: KeycapOptions,
): Phaser.GameObjects.Container {
  const capWidth = width ?? size;
  const face = scene.add.graphics();
  face.fillStyle(INK.slabRaised, 1);
  face.fillRect(-capWidth / 2, -size / 2, capWidth, size);
  face.lineStyle(2, colour, 1);
  face.strokeRect(-capWidth / 2, -size / 2, capWidth, size);
  // A shadow along the bottom edge gives the cap a height without rounding a single corner.
  face.fillStyle(colour, 0.22);
  face.fillRect(-capWidth / 2, size / 2 - 4, capWidth, 4);

  const label = scene.add
    .text(0, 0, glyph, type_({ size: Math.round(size * 0.45), colour, tracking: 1 }))
    .setOrigin(0.5, 0.5);

  return scene.add.container(0, 0, [face, label]);
}

/**
 * A "do this next" prompt: the key, then what it does. Pulses gently so it is findable without
 * being the loudest thing on the screen.
 */
export function actionPrompt(
  scene: Phaser.Scene,
  key: string,
  action: string,
  {
    colour = INK.hazard,
    size = SIZE.body,
    pulse = false,
  }: { colour?: number; size?: number; pulse?: boolean } = {},
): Phaser.GameObjects.Container {
  const capSize = Math.round(size * 1.9);
  const capWidth = key.length > 1 ? Math.round(size * (1.5 + key.length * 0.62)) : capSize;
  const cap = keycap(scene, { glyph: key, colour, size: capSize, width: capWidth });

  const label = scene.add.text(0, 0, action, type_({ size, tone: 'dim' })).setOrigin(0, 0.5);

  // Lay the pair out left-aligned, then recentre the whole thing on its own origin.
  const gap = SPACE.snug;
  const total = capWidth + gap + label.width;
  cap.setX(-total / 2 + capWidth / 2);
  label.setX(-total / 2 + capWidth + gap);

  const container = scene.add.container(0, 0, [cap, label]);
  if (pulse) {
    scene.tweens.add({
      targets: container,
      alpha: { from: 1, to: 0.42 },
      duration: MOTION.pulse,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
  return container;
}

/* ------------------------------------------------------------------ score pips */

export interface ScorePipsOptions {
  /** How many rounds win the session. One pip each. */
  target: number;
  colour: number;
  pipWidth?: number;
  pipHeight?: number;
  gap?: number;
}

/**
 * The score, as a row of slots that fill up. A number tells you what the score is; this tells you
 * how close somebody is to winning without anybody having to read it, which is what two people
 * glancing across a keyboard actually need.
 *
 * The pips are sheared to match the wordmark, so the whole identity leans the same way.
 */
export class ScorePips {
  readonly root: Phaser.GameObjects.Container;
  readonly width: number;

  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly options: Required<ScorePipsOptions>;

  constructor(scene: Phaser.Scene, options: ScorePipsOptions) {
    this.options = {
      pipWidth: 16,
      pipHeight: 26,
      gap: 6,
      ...options,
    };
    const { target, pipWidth, gap } = this.options;
    this.width = target * pipWidth + (target - 1) * gap;
    this.graphics = scene.add.graphics();
    this.root = scene.add.container(0, 0, [this.graphics]);
    this.render(0);
  }

  /** Redraws for a score. Scores below zero are possible in the design, so nothing here assumes not. */
  render(score: number): void {
    const { target, colour, pipWidth, pipHeight, gap } = this.options;
    const filled = Math.max(0, Math.min(score, target));
    this.graphics.clear();

    for (let index = 0; index < target; index += 1) {
      const x = -this.width / 2 + index * (pipWidth + gap);
      const lean = pipHeight * 0.16;
      const points = [
        new Phaser.Geom.Point(x + lean, -pipHeight / 2),
        new Phaser.Geom.Point(x + lean + pipWidth, -pipHeight / 2),
        new Phaser.Geom.Point(x + pipWidth, pipHeight / 2),
        new Phaser.Geom.Point(x, pipHeight / 2),
      ];
      if (index < filled) {
        this.graphics.fillStyle(colour, 1);
        this.graphics.fillPoints(points, true);
      } else {
        this.graphics.fillStyle(INK.slabRaised, 0.85);
        this.graphics.fillPoints(points, true);
        this.graphics.lineStyle(1.5, INK.rule, 1);
        this.graphics.strokePoints(points, true, true);
      }
    }
  }
}

/* ------------------------------------------------------------------ text helpers */

/** A tracked-out uppercase label. The workhorse of every screen. */
export function label(
  scene: Phaser.Scene,
  text: string,
  {
    size = SIZE.label,
    tone = 'dim' as const,
    colour,
    origin = 0.5,
  }: {
    size?: number;
    tone?: 'text' | 'dim' | 'dimmer' | 'hazard';
    colour?: number;
    origin?: number;
  } = {},
): Phaser.GameObjects.Text {
  return scene.add
    .text(
      0,
      0,
      text.toUpperCase(),
      type_({ size, tone, colour, tracking: Math.round(size * 0.16) }),
    )
    .setOrigin(origin, 0.5);
}

/** A number meant to be read across a room. */
export function bigNumber(
  scene: Phaser.Scene,
  value: number | string,
  { size = SIZE.hero, colour = INK.text }: { size?: number; colour?: number } = {},
): Phaser.GameObjects.Text {
  return scene.add
    .text(0, 0, String(value), {
      ...type_({ size, colour, tracking: 0 }),
      // Tabular-ish: the score must not shuffle sideways when it ticks over.
      fixedWidth: 0,
    })
    .setOrigin(0.5, 0.5);
}

/* ------------------------------------------------------------------ motion */

export interface EnterOptions {
  /** Where the element comes from, relative to where it ends up. */
  dx?: number;
  dy?: number;
  delay?: number;
  duration?: number;
  ease?: string;
  fromAlpha?: number;
  /** Where the fade ends. Below 1 for anything that is deliberately knocked back. */
  toAlpha?: number;
}

/**
 * The one entrance in the game. Short, straight, and out of the same easing every time - a screen
 * where three things arrive three different ways reads as three screens.
 */
export function enter(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Container | Phaser.GameObjects.Components.Transform,
  {
    dx = 0,
    dy = 22,
    delay = 0,
    duration = MOTION.enter,
    ease = MOTION.ease,
    fromAlpha = 0,
    toAlpha = 1,
  }: EnterOptions = {},
): void {
  const object = target as Phaser.GameObjects.Container;
  const endX = object.x;
  const endY = object.y;
  object.setPosition(endX + dx, endY + dy);
  object.setAlpha(fromAlpha);
  scene.tweens.add({
    targets: object,
    x: endX,
    y: endY,
    alpha: toAlpha,
    delay,
    duration,
    ease,
  });
}

/** For a thing that should land rather than arrive: a winner, a score ticking over. */
export function slam(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Container | Phaser.GameObjects.Components.Transform,
  { delay = 0, from = 1.35 }: { delay?: number; from?: number } = {},
): void {
  const object = target as Phaser.GameObjects.Container;
  object.setScale(from);
  object.setAlpha(0);
  scene.tweens.add({
    targets: object,
    scale: 1,
    alpha: 1,
    delay,
    duration: MOTION.settle,
    ease: MOTION.slamEase,
  });
}

/** Colour as a CSS string, for the few places a Phaser style wants one. */
export const css = hex;
