/**
 * Drawing a track.
 *
 * The only file in the track pipeline that knows Phaser exists. It reads exactly the same samples
 * and walls the simulation collides against, which is what keeps the picture honest: if a barrier
 * is drawn somewhere, the car will hit it there.
 *
 * The track never moves, so it is drawn once and then baked into a single texture. That matters
 * more than it sounds: a circuit is a few thousand filled quads, and Phaser Graphics re-issues every
 * one of its commands on every frame. Left live, the track alone costs more per frame than the
 * whole rest of the game, which is a strange thing to pay for a picture that never changes - and on
 * a machine without hardware acceleration it drops the frame rate far enough to make the car feel
 * wrong for reasons that have nothing to do with the car. Everything that does move - the car, the
 * sparks, later the eliminator - is somebody else's layer.
 *
 * The look is the identity: hazard tape on wet asphalt. Barriers are striped so their angle is
 * readable in peripheral vision at speed, which matters more than it sounds - on one shared screen
 * the wall you are about to hit is usually not the one you are looking at.
 */

import Phaser from 'phaser';
import { PALETTE } from '../theme';
import type { Track } from '../track/trackTypes';

export const TRACK_DEPTH = {
  surface: -8,
  markings: -7,
  barrier: -6,
} as const;

/** Barrier thickness, drawn outwards from the wall line the simulation actually uses. */
const BARRIER_WIDTH = 22;
/** Length of one hazard stripe along a barrier, world units. */
const STRIPE_LENGTH = 46;
/** Dash geometry for the centreline. */
const DASH_LENGTH = 44;
const DASH_GAP = 56;
/** Slack around the track bounds so the outer edge of a barrier is inside the baked texture. */
const BAKE_PADDING = BARRIER_WIDTH + 8;
/**
 * Largest texture we will ask for. Every WebGL implementation guarantees at least 4096, and a track
 * bigger than that stays on live Graphics rather than silently rendering at half resolution.
 */
const MAX_BAKE_SIZE = 4096;

export interface TrackView {
  destroy(): void;
}

export function drawTrack(scene: Phaser.Scene, track: Track): TrackView {
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  fillSurface(graphics, track);
  drawCentreDashes(graphics, track);
  drawStartLine(graphics, track);
  drawBarriers(graphics, track);

  const x = track.bounds.minX - BAKE_PADDING;
  const y = track.bounds.minY - BAKE_PADDING;
  const width = Math.ceil(track.bounds.maxX - track.bounds.minX + BAKE_PADDING * 2);
  const height = Math.ceil(track.bounds.maxY - track.bounds.minY + BAKE_PADDING * 2);

  if (width > MAX_BAKE_SIZE || height > MAX_BAKE_SIZE) {
    // Too big to bake. Keep it live and correct rather than baked and blurry.
    graphics.setDepth(TRACK_DEPTH.surface);
    scene.add.existing(graphics);
    return { destroy: () => graphics.destroy() };
  }

  const baked = scene.add.renderTexture(x, y, width, height).setOrigin(0, 0);
  baked.setDepth(TRACK_DEPTH.surface);
  baked.draw(graphics, -x, -y);
  graphics.destroy();

  return { destroy: () => baked.destroy() };
}

/**
 * The road is filled as a strip of quads between the two walls rather than as one polygon with a
 * hole in it, which a canvas fill cannot express and a WebGL one gets wrong.
 */
function fillSurface(graphics: Phaser.GameObjects.Graphics, track: Track): void {
  const count = track.samples.length;
  graphics.fillStyle(PALETTE.road, 1);
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    graphics.fillPoints(
      [
        new Phaser.Geom.Point(track.left[i].x, track.left[i].y),
        new Phaser.Geom.Point(track.right[i].x, track.right[i].y),
        new Phaser.Geom.Point(track.right[j].x, track.right[j].y),
        new Phaser.Geom.Point(track.left[j].x, track.left[j].y),
      ],
      true,
    );
  }
}

/** A dashed centreline. Not a racing line - just something to judge your position against. */
function drawCentreDashes(graphics: Phaser.GameObjects.Graphics, track: Track): void {
  graphics.lineStyle(3, PALETTE.line, 0.85);
  const period = DASH_LENGTH + DASH_GAP;
  const step = Math.max(1, Math.round(period / track.spacing));
  const dashSamples = Math.max(1, Math.round(DASH_LENGTH / track.spacing));

  for (let i = 0; i < track.samples.length; i += step) {
    const from = track.samples[i];
    const to = track.samples[(i + dashSamples) % track.samples.length];
    graphics.lineBetween(from.x, from.y, to.x, to.y);
  }
}

/** Start/finish: a chequered bar across the road, at lap distance zero. */
function drawStartLine(graphics: Phaser.GameObjects.Graphics, track: Track): void {
  const sample = track.samples[0];
  const rows = 2;
  const columns = 12;
  const depth = 26;
  const halfWidth = sample.halfWidth;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const light = (row + column) % 2 === 0;
      const acrossFrom = halfWidth - (column / columns) * halfWidth * 2;
      const acrossTo = halfWidth - ((column + 1) / columns) * halfWidth * 2;
      const alongFrom = (row / rows) * depth - depth / 2;
      const alongTo = ((row + 1) / rows) * depth - depth / 2;
      graphics.fillStyle(light ? PALETTE.text : PALETTE.asphalt, 1);
      graphics.fillPoints(
        [
          cornerPoint(sample, acrossFrom, alongFrom),
          cornerPoint(sample, acrossTo, alongFrom),
          cornerPoint(sample, acrossTo, alongTo),
          cornerPoint(sample, acrossFrom, alongTo),
        ],
        true,
      );
    }
  }
}

function cornerPoint(
  sample: { x: number; y: number; tx: number; ty: number; nx: number; ny: number },
  across: number,
  along: number,
): Phaser.Geom.Point {
  return new Phaser.Geom.Point(
    sample.x + sample.nx * across + sample.tx * along,
    sample.y + sample.ny * across + sample.ty * along,
  );
}

/**
 * Barriers, drawn outwards from the collision line so the painted edge and the thing you hit are
 * the same edge. Stripes alternate along the wall, which is what makes a barrier's angle readable
 * without looking straight at it.
 */
function drawBarriers(graphics: Phaser.GameObjects.Graphics, track: Track): void {
  const count = track.samples.length;
  const perStripe = Math.max(1, Math.round(STRIPE_LENGTH / track.spacing));

  for (const side of ['left', 'right'] as const) {
    const inner = side === 'left' ? track.left : track.right;
    for (let i = 0; i < count; i += 1) {
      const j = (i + 1) % count;
      const sample = track.samples[i];
      // Outwards is away from the road, which for the left wall is +normal and for the right is -.
      const sign = side === 'left' ? 1 : -1;
      const outX = sample.nx * sign * BARRIER_WIDTH;
      const outY = sample.ny * sign * BARRIER_WIDTH;
      const nextSample = track.samples[j];
      const nextOutX = nextSample.nx * sign * BARRIER_WIDTH;
      const nextOutY = nextSample.ny * sign * BARRIER_WIDTH;

      const stripe = Math.floor(i / perStripe) % 2 === 0;
      graphics.fillStyle(stripe ? PALETTE.player1 : PALETTE.barrier, 1);
      graphics.fillPoints(
        [
          new Phaser.Geom.Point(inner[i].x, inner[i].y),
          new Phaser.Geom.Point(inner[i].x + outX, inner[i].y + outY),
          new Phaser.Geom.Point(inner[j].x + nextOutX, inner[j].y + nextOutY),
          new Phaser.Geom.Point(inner[j].x, inner[j].y),
        ],
        true,
      );
    }
  }

  // A hard edge on the road side, so the barrier reads as a wall rather than as paint.
  graphics.lineStyle(2, PALETTE.text, 0.28);
  strokeLoop(graphics, track.left);
  strokeLoop(graphics, track.right);
}

function strokeLoop(
  graphics: Phaser.GameObjects.Graphics,
  points: readonly { x: number; y: number }[],
): void {
  graphics.beginPath();
  graphics.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) graphics.lineTo(points[i].x, points[i].y);
  graphics.closePath();
  graphics.strokePath();
}
