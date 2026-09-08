/**
 * SHUNT's design tokens: the numbers behind the look, in one place.
 *
 * The palette itself lives in `src/game/theme.ts` because the four player colours are a gameplay
 * requirement before they are a style. This module is the layer on top - what the type sizes are,
 * how far things sit from each other, how fast anything is allowed to move - so that the round
 * scoreboard and the in-game furniture inherit the identity instead of inventing a second one.
 *
 * Three rules hold everything together:
 *
 * 1. **Red is the eliminator and nothing else.** It never appears as chrome, a border, a warning,
 *    or a losing score. When the trailing edge finally goes in, red will be the only new thing on
 *    screen and it will mean exactly one thing.
 * 2. **Hazard yellow is the chrome - until a player colour is on screen.** Player one is that same
 *    yellow, so any screen showing drivers steps its chrome back to neutral and lets the four
 *    colours do the talking.
 * 3. **Everything is uppercase, tracked out, and square-cornered.** Trackside signage, not an app.
 */

import type Phaser from 'phaser';
import { PALETTE } from '../../theme';

/**
 * Screens are composed inside this box and then scaled to fit the window, rather than reflowed.
 * Two people leaning over one keyboard need the composition to hold its proportions; a layout that
 * rearranges itself at some breakpoint is a layout they have to re-read.
 */
export const STAGE = {
  width: 1280,
  height: 720,
} as const;

export const INK = {
  asphalt: PALETTE.asphalt,
  /** Slightly lifted from the asphalt: panels, slabs, keycaps. */
  slab: 0x15181d,
  slabRaised: 0x1d2128,
  rule: 0x2c313a,
  ruleBright: 0x424a56,
  text: PALETTE.text,
  dim: PALETTE.dim,
  dimmer: 0x6a727d,
  /** The chrome accent, and player one's colour. */
  hazard: PALETTE.player1,
  hazardDeep: 0x8a7300,
  /** The eliminator. Never chrome, never a player. */
  eliminator: PALETTE.danger,
} as const;

export const FONTS = {
  /** Headings, labels, keycaps, scores. Heavy and tracked out. */
  display: 'Ubuntu, "Arial Narrow", "Helvetica Neue", Inter, system-ui, sans-serif',
  /** Anything the eye reads as an instrument reading rather than a word. */
  mono: 'ui-monospace, "Ubuntu Mono", SFMono-Regular, Menlo, Consolas, monospace',
} as const;

export type TextTone = 'text' | 'dim' | 'dimmer' | 'hazard' | 'asphalt';

const TONES: Record<TextTone, string> = {
  text: '#e9ebee',
  dim: '#98a0ab',
  dimmer: '#6a727d',
  hazard: '#ffd200',
  asphalt: '#0a0b0d',
};

export function toneColour(tone: TextTone): string {
  return TONES[tone];
}

/** `#rrggbb` for a palette number, for the places Phaser wants a string. */
export function hex(colour: number): string {
  return `#${colour.toString(16).padStart(6, '0')}`;
}

export interface TypeOptions {
  size: number;
  tone?: TextTone;
  colour?: number;
  /** Letter spacing in pixels. Defaults scale with the size so tracking stays optical. */
  tracking?: number;
  weight?: '400' | '500' | '700';
  mono?: boolean;
}

/**
 * The only way a screen should build a text style. Tracking defaults to roughly 8% of the size,
 * which is what stops a system sans from reading as a web page.
 */
export function type_({
  size,
  tone = 'text',
  colour,
  tracking,
  weight = '700',
  mono = false,
}: TypeOptions): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: mono ? FONTS.mono : FONTS.display,
    fontSize: `${size}px`,
    fontStyle: weight === '400' ? 'normal' : weight === '500' ? '500' : 'bold',
    color: colour === undefined ? toneColour(tone) : hex(colour),
    // Phaser applies letterSpacing itself; it is the single biggest lever on how this reads.
    letterSpacing: tracking ?? Math.max(1, Math.round(size * 0.08)),
  };
}

/** Named steps, so two screens cannot pick 27px and 29px for the same job. */
export const SIZE = {
  /** Session-defining numbers: a score, a round win count. */
  hero: 128,
  title: 56,
  heading: 34,
  subheading: 24,
  body: 17,
  label: 14,
  micro: 11,
} as const;

export const SPACE = {
  hair: 4,
  tight: 8,
  snug: 14,
  base: 22,
  wide: 36,
  huge: 60,
} as const;

/**
 * Motion is short and hard. This is a game about a camera that snaps; nothing in front of it is
 * allowed to ease in luxuriously. Anything longer than `settle` needs a reason.
 */
export const MOTION = {
  /** A keypress acknowledging itself. */
  snap: 90,
  /** The default entrance for one element. */
  enter: 180,
  /** The longest a single element may take to arrive. */
  settle: 280,
  /** Gap between staggered siblings. */
  stagger: 45,
  ease: 'Cubic.easeOut',
  /** For a thing that lands rather than arrives - a score, a winner. */
  slamEase: 'Back.easeOut',
  /** The idle pulse on a "press this" prompt. */
  pulse: 760,
} as const;
