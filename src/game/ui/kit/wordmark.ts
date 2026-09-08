/**
 * The SHUNT wordmark, drawn as geometry rather than set in a typeface.
 *
 * A logotype that depends on a font is a logotype that changes shape on a machine without that
 * font, and the condensed faces this look wants are not reliably installed anywhere. So the five
 * letters are polygons on a 100x140 grid: square-cut, sheared forward, and extruded down-right the
 * way arcade cabinet art always was. It is identical on every machine and it scales without limit.
 */

import Phaser from 'phaser';
import { INK } from './design';

/** Design grid for one glyph. */
const GLYPH_W = 100;
const GLYPH_H = 140;
/** Stroke weight. Heavy enough to read across a room. */
const T = 28;
/** Gap between glyphs, before the shear. */
const TRACK = 24;
/** Forward lean: the top of a letter sits this fraction of its height to the right of the bottom. */
const SLANT = 0.16;

const MID_TOP = 56;
const MID_BOTTOM = MID_TOP + T;
const FOOT = GLYPH_H - T;
const STEM_LEFT = (GLYPH_W - T) / 2;

type Polygon = readonly (readonly [number, number])[];

function bar(x0: number, y0: number, x1: number, y1: number): Polygon {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

const LEFT_STEM = bar(0, 0, T, GLYPH_H);
const RIGHT_STEM = bar(GLYPH_W - T, 0, GLYPH_W, GLYPH_H);
const TOP_BAR = bar(0, 0, GLYPH_W, T);
const BOTTOM_BAR = bar(0, FOOT, GLYPH_W, GLYPH_H);
const MID_BAR = bar(0, MID_TOP, GLYPH_W, MID_BOTTOM);

const GLYPHS: Record<string, readonly Polygon[]> = {
  S: [
    TOP_BAR,
    bar(0, 0, T, MID_BOTTOM),
    MID_BAR,
    bar(GLYPH_W - T, MID_TOP, GLYPH_W, GLYPH_H),
    BOTTOM_BAR,
  ],
  H: [LEFT_STEM, RIGHT_STEM, MID_BAR],
  U: [LEFT_STEM, RIGHT_STEM, BOTTOM_BAR],
  N: [
    LEFT_STEM,
    RIGHT_STEM,
    [
      [0, 0],
      [T, 0],
      [GLYPH_W, GLYPH_H],
      [GLYPH_W - T, GLYPH_H],
    ],
  ],
  T: [TOP_BAR, bar(STEM_LEFT, 0, STEM_LEFT + T, GLYPH_H)],
};

const LETTERS = ['S', 'H', 'U', 'N', 'T'] as const;

/** Unit size of the whole wordmark, shear included. Multiply by the scale you draw it at. */
export const WORDMARK_UNITS = {
  width: LETTERS.length * GLYPH_W + (LETTERS.length - 1) * TRACK + GLYPH_H * SLANT,
  height: GLYPH_H,
} as const;

export interface WordmarkOptions {
  colour?: number;
  /** The extruded side of the letters. Defaults to a deep shade of the face colour's family. */
  extrudeColour?: number;
  /** Depth of the extrude in unit space. Zero draws a flat wordmark. */
  extrude?: number;
  /** Which letters are drawn, 0..5. Used by the title screen's entrance. */
  visibleLetters?: number;
}

/**
 * Draws the wordmark into `graphics` with its top-left at the graphics origin, in unit space.
 * Scale the graphics object (or its container) to size it; nothing here is stroked, so it stays
 * crisp at any scale.
 */
export function drawWordmark(
  graphics: Phaser.GameObjects.Graphics,
  {
    colour = INK.hazard,
    extrudeColour = INK.hazardDeep,
    extrude = 11,
    visibleLetters = LETTERS.length,
  }: WordmarkOptions = {},
): void {
  const letters = LETTERS.slice(0, Math.max(0, Math.min(visibleLetters, LETTERS.length)));
  letters.forEach((letter, index) => {
    paintGlyph(graphics, letter, index * (GLYPH_W + TRACK), { colour, extrudeColour, extrude });
  });
}

interface GlyphPaint {
  colour: number;
  extrudeColour: number;
  extrude: number;
}

function paintGlyph(
  graphics: Phaser.GameObjects.Graphics,
  letter: string,
  originX: number,
  { colour, extrudeColour, extrude }: GlyphPaint,
): void {
  // The extrude is a stack of offset copies rather than one offset copy, so the side of the letter
  // reads as a solid slab instead of a drop shadow with a gap in it.
  for (let depth = extrude; depth >= 1; depth -= 1) {
    graphics.fillStyle(extrudeColour, 1);
    fillGlyph(graphics, letter, originX + depth, depth);
  }
  graphics.fillStyle(colour, 1);
  fillGlyph(graphics, letter, originX, 0);
}

function fillGlyph(
  graphics: Phaser.GameObjects.Graphics,
  letter: string,
  originX: number,
  offsetY: number,
): void {
  for (const polygon of GLYPHS[letter]) {
    graphics.fillPoints(
      polygon.map(
        ([x, y]) =>
          // Shear about the baseline: the top of the letter leans forward, the foot stays put.
          new Phaser.Geom.Point(originX + x + (GLYPH_H - y) * SLANT, y + offsetY),
      ),
      true,
    );
  }
}

/**
 * A wordmark sized to a target width, as its own container. Its origin is its centre, so it can be
 * dropped straight onto a layout axis.
 *
 * The five letters are separate children rather than one drawing, because the title screen brings
 * them in one at a time and a wordmark that cannot be taken apart cannot do that.
 */
export function createWordmark(
  scene: Phaser.Scene,
  targetWidth: number,
  options: WordmarkOptions = {},
): { root: Phaser.GameObjects.Container; letters: Phaser.GameObjects.Container[] } {
  const scale = targetWidth / WORDMARK_UNITS.width;
  const { colour = INK.hazard, extrudeColour = INK.hazardDeep, extrude = 11 } = options;

  const letters = LETTERS.map((letter, index) => {
    const graphics = scene.add.graphics();
    paintGlyph(graphics, letter, 0, { colour, extrudeColour, extrude });
    const child = scene.add.container(index * (GLYPH_W + TRACK) * scale, 0, [graphics]);
    graphics.setScale(scale);
    return child;
  });

  const root = scene.add.container(0, 0, letters);
  // Recentre: children were laid out from a left origin in unit space.
  root.setPosition(0, 0);
  for (const child of letters) {
    child.x -= (WORDMARK_UNITS.width / 2) * scale;
    child.y -= (WORDMARK_UNITS.height / 2) * scale;
  }
  return { root, letters };
}
