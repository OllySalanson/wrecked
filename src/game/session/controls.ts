/**
 * Who is playing, what colour they are, and which keys are theirs.
 *
 * This is the one place that answers "which keys belong to player 2". The lineup screen reads it to
 * draw the keycaps, and the two-players-on-one-keyboard work (MVP item 6) reads the same table to
 * bind them, so the screen can never drift from the game.
 *
 * Two players on one keyboard is the captain's chosen starting point. Slots 3 and 4 are declared
 * here as reserved rather than omitted: they are gamepad seats (MVP item 11), and naming them keeps
 * the lineup layout honest about the shape of the finished game.
 */

import { PALETTE } from '../theme';

export type SeatKind = 'keyboard' | 'gamepad-later';

export interface DriverKeys {
  /** Physical KeyboardEvent.code values, so the binding does not depend on layout. */
  readonly accelerate: string;
  readonly brake: string;
  readonly left: string;
  readonly right: string;
}

/** What to print on a keycap. Kept apart from the code so the drawing never parses a code string. */
export interface DriverKeyCaps {
  readonly accelerate: string;
  readonly brake: string;
  readonly left: string;
  readonly right: string;
}

export interface Seat {
  readonly index: number;
  /** Short form, for HUD furniture where space is tight. */
  readonly tag: string;
  readonly name: string;
  readonly colour: number;
  readonly css: string;
  readonly kind: SeatKind;
  readonly cluster: string;
  readonly keys?: DriverKeys;
  readonly caps?: DriverKeyCaps;
}

/**
 * Boost has no button on purpose - the captain chose the original's combo, warts and all. Every
 * seat performs it the same way with its own two pedals, so it is stated once rather than per seat.
 */
export const BOOST_COMBO = 'TAP BRAKE, THEN DOUBLE-TAP ACCELERATE';

export const SEATS: readonly Seat[] = [
  {
    index: 0,
    tag: 'P1',
    name: 'PLAYER ONE',
    colour: PALETTE.player1,
    css: '#ffd200',
    kind: 'keyboard',
    cluster: 'ARROW CLUSTER',
    keys: { accelerate: 'ArrowUp', brake: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' },
    caps: { accelerate: '↑', brake: '↓', left: '←', right: '→' },
  },
  {
    index: 1,
    tag: 'P2',
    name: 'PLAYER TWO',
    colour: PALETTE.player2,
    css: '#00d9ff',
    kind: 'keyboard',
    cluster: 'LEFT HAND',
    keys: { accelerate: 'KeyW', brake: 'KeyS', left: 'KeyA', right: 'KeyD' },
    caps: { accelerate: 'W', brake: 'S', left: 'A', right: 'D' },
  },
  {
    index: 2,
    tag: 'P3',
    name: 'PLAYER THREE',
    colour: PALETTE.player3,
    css: '#ff2d78',
    kind: 'gamepad-later',
    cluster: 'GAMEPAD',
  },
  {
    index: 3,
    tag: 'P4',
    name: 'PLAYER FOUR',
    colour: PALETTE.player4,
    css: '#8cff36',
    kind: 'gamepad-later',
    cluster: 'GAMEPAD',
  },
];

/** The seats a race can actually be started with today. */
export const ACTIVE_SEATS: readonly Seat[] = SEATS.filter((seat) => seat.kind === 'keyboard');

export function seatAt(index: number): Seat {
  const seat = SEATS[index];
  if (!seat) throw new RangeError(`no seat ${index}`);
  return seat;
}
