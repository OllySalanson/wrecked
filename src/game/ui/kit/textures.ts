/**
 * Generated textures for the identity: hazard tape, asphalt grain, and a vignette.
 *
 * All three are made at runtime rather than shipped as files. That is not a shortcut - a hazard
 * band has to tile seamlessly at any width and take a player's colour, and an image cannot do
 * either. Every texture is cached in Phaser's texture manager under a stable key, so a screen can
 * ask for one on every rebuild without paying for it twice.
 */

import Phaser from 'phaser';
import { INK } from './design';

/** Side of the hazard tile, in pixels. The stripes run at 45 degrees and tile seamlessly. */
const HAZARD_TILE = 40;
const HAZARD_PERIOD = 20;
const HAZARD_STRIPE = 10;
const GRAIN_TILE = 128;
const VIGNETTE_SIZE = 512;

export function hazardTextureKey(colour: number): string {
  return `shunt-hazard-${colour.toString(16)}`;
}

/**
 * Diagonal hazard tape in the given colour on asphalt. The tile is square and the stripe period
 * divides its side, so a `TileSprite` of any size shows an unbroken run of stripes - and scrolling
 * `tilePositionX` makes the tape crawl, which is the identity's one piece of idle motion.
 */
export function ensureHazardTexture(scene: Phaser.Scene, colour: number): string {
  const key = hazardTextureKey(colour);
  if (scene.textures.exists(key)) return key;

  const tile = scene.make.graphics({ x: 0, y: 0 }, false);
  tile.fillStyle(INK.asphalt, 1);
  tile.fillRect(0, 0, HAZARD_TILE, HAZARD_TILE);
  tile.fillStyle(colour, 1);

  for (let x = -HAZARD_TILE * 2; x <= HAZARD_TILE * 2; x += HAZARD_PERIOD) {
    tile.fillPoints(
      [
        new Phaser.Geom.Point(x, 0),
        new Phaser.Geom.Point(x + HAZARD_STRIPE, 0),
        new Phaser.Geom.Point(x + HAZARD_STRIPE - HAZARD_TILE, HAZARD_TILE),
        new Phaser.Geom.Point(x - HAZARD_TILE, HAZARD_TILE),
      ],
      true,
    );
  }

  tile.generateTexture(key, HAZARD_TILE, HAZARD_TILE);
  tile.destroy();
  return key;
}

export const GRAIN_KEY = 'shunt-grain';

/**
 * Asphalt grain. Without it a flat near-black fill reads as "empty canvas"; with it, at very low
 * alpha, the same fill reads as a surface with something on the other side of it.
 */
export function ensureGrainTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(GRAIN_KEY)) return GRAIN_KEY;

  const canvas = scene.textures.createCanvas(GRAIN_KEY, GRAIN_TILE, GRAIN_TILE);
  const context = canvas?.getContext();
  if (!canvas || !context) return GRAIN_KEY;

  const image = context.createImageData(GRAIN_TILE, GRAIN_TILE);
  for (let i = 0; i < image.data.length; i += 4) {
    // A deterministic-enough speckle: some pixels lift, some sink, most do nothing.
    const noise = Math.random();
    const lift = noise > 0.86 ? 255 : 0;
    image.data[i] = lift;
    image.data[i + 1] = lift;
    image.data[i + 2] = lift;
    image.data[i + 3] = noise > 0.86 ? 26 : noise < 0.1 ? 34 : 0;
  }
  context.putImageData(image, 0, 0);
  canvas.refresh();
  return GRAIN_KEY;
}

export const VIGNETTE_KEY = 'shunt-vignette';

/** A soft darkening towards the corners, so the eye is pushed to the middle of the screen. */
export function ensureVignetteTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(VIGNETTE_KEY)) return VIGNETTE_KEY;

  const canvas = scene.textures.createCanvas(VIGNETTE_KEY, VIGNETTE_SIZE, VIGNETTE_SIZE);
  const context = canvas?.getContext();
  if (!canvas || !context) return VIGNETTE_KEY;

  const half = VIGNETTE_SIZE / 2;
  const gradient = context.createRadialGradient(half, half, half * 0.25, half, half, half);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(0.62, 'rgba(0,0,0,0.28)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.82)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, VIGNETTE_SIZE, VIGNETTE_SIZE);
  canvas.refresh();
  return VIGNETTE_KEY;
}
