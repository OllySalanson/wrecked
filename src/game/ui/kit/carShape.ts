/**
 * The car, drawn.
 *
 * It lives in the identity kit rather than in a scene because the menus and the race have to show
 * the same object. A lineup screen that draws its own approximation of the car is a lineup screen
 * that will quietly stop matching the game.
 *
 * The shape is deliberately flat: a coloured slab, a dark cockpit set back, and a white wedge at
 * the nose. Which way a car is pointing has to be unmistakable in peripheral vision, because on one
 * shared screen at low zoom that is the only way it will ever be read.
 */

import type Phaser from 'phaser';
import { CAR_COLLISION_RADIUS, CAR_LENGTH, CAR_WIDTH } from '../../sim/handling';
import { INK } from './design';

export interface CarBodyOptions {
  colour: number;
  /** Drop shadow beneath the slab, so the car sits above the road rather than on it. */
  shadow?: boolean;
  scale?: number;
}

/**
 * Draws a car centred on the graphics origin, nose towards -y (up the screen).
 * The simulation's heading 0 points along +x, so a scene rendering a live car rotates by 90.
 */
export function drawCarBody(
  graphics: Phaser.GameObjects.Graphics,
  { colour, shadow = true, scale = 1 }: CarBodyOptions,
): void {
  const width = CAR_WIDTH * scale;
  const length = CAR_LENGTH * scale;
  const halfW = width / 2;
  const halfL = length / 2;
  // Matched to the collision capsule's radius, so the drawn body and the thing that hits walls
  // agree about where the corners of the car are.
  const radius = CAR_COLLISION_RADIUS * 0.6 * scale;

  if (shadow) {
    // Drop shadow, so the car sits above the road rather than on it.
    graphics.fillStyle(0x000000, 0.45);
    graphics.fillRoundedRect(-halfW + 3 * scale, -halfL + 5 * scale, width, length, radius);
  }

  graphics.fillStyle(colour, 1);
  graphics.fillRoundedRect(-halfW, -halfL, width, length, radius);

  graphics.fillStyle(0x000000, 0.55);
  graphics.fillRect(-halfW + 4 * scale, -2 * scale, width - 8 * scale, 20 * scale);

  graphics.fillStyle(INK.text, 1);
  graphics.beginPath();
  graphics.moveTo(0, -halfL + 3 * scale);
  graphics.lineTo(halfW - 5 * scale, -halfL + 15 * scale);
  graphics.lineTo(-halfW + 5 * scale, -halfL + 15 * scale);
  graphics.closePath();
  graphics.fillPath();
}
