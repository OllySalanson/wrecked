/**
 * Cutter's Yard - SHUNT's first track.
 *
 * A scrap yard circuit. Two long straights so top speed means something, one fast right onto the
 * back of the yard, an S-bend on the narrowest road here, a long flat-out horseshoe that is really
 * a grip test, and the Elbow: a hundred and fourteen degrees of left on a 170-unit radius, arriving
 * straight off the fastest part of the lap. That corner exists to be crashed into.
 *
 * Everything below is a corner: where it is, how tight it is, how wide the road is there. The
 * centreline, both walls, the drivable surface and the start line are all derived by `buildTrack`,
 * so retuning a corner is moving one number and reloading - the same relationship the tuning panel
 * has with the handling.
 *
 * Two things worth holding on to while reading the numbers. Distances are world units with y
 * pointing DOWN the screen, and the lap is driven clockwise. And the car is 30 units wide with a
 * minimum turning circle of roughly 280 units flat out, so a half-width of 145 is a road nine cars
 * across, and a 170-unit corner is one you cannot take without slowing down.
 */

import type { TrackDefinition } from '../trackTypes';

export const CUTTERS_YARD: TrackDefinition = {
  id: 'cutters-yard',
  name: "Cutter's Yard",
  blurb: 'Scrap yard circuit. Two straights, an S-bend, and one left-hander that bites.',
  startNode: 1,
  nodes: [
    // Out of the Pit and onto the Weighbridge - the long start/finish straight, left to right.
    { x: -1150, y: 1215, radius: 300, halfWidth: 140 },
    // A marker, not a corner: its neighbours are almost collinear so it rounds to nothing. It is
    // here purely to put the start/finish line partway down the straight.
    { x: -600, y: 1195, radius: 800, halfWidth: 145 },

    // Turn One - a long right you can hold flat if you are brave and run wide if you are not.
    { x: 1350, y: 1120, radius: 480, halfWidth: 132 },
    { x: 1690, y: 480, radius: 400, halfWidth: 118 },

    // The Sorter - an S-bend on the narrowest road on the track. This is where a pack bunches.
    { x: 1440, y: 120, radius: 200, halfWidth: 104 },
    { x: 1690, y: -260, radius: 200, halfWidth: 104 },

    // Onto the Gantry - the back straight, driven right to left.
    { x: 1690, y: -880, radius: 460, halfWidth: 134 },
    { x: 100, y: -1150, radius: 700, halfWidth: 145 },

    // The Crusher - a long, fast horseshoe on a narrowing road. Nothing here needs braking; it is
    // the corner that tells you whether the grip numbers are right.
    { x: -1150, y: -1010, radius: 520, halfWidth: 130 },
    { x: -1600, y: -420, radius: 420, halfWidth: 102 },
    { x: -1150, y: 80, radius: 300, halfWidth: 112 },

    // The Elbow - the tight one, and the narrowest exit on the track. You arrive carrying
    // everything the Crusher gave you, which is the joke.
    { x: -780, y: 260, radius: 170, halfWidth: 96 },

    { x: -1300, y: 700, radius: 380, halfWidth: 120 },
    // The Pit - slow left back onto the start straight.
    { x: -1660, y: 1080, radius: 240, halfWidth: 112 },
  ],
};
