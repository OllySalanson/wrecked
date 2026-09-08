/**
 * What happens when the car meets a wall.
 *
 * This is handling, not plumbing. A generic solver would stop the car and conserve momentum
 * correctly and feel like nothing at all; what a top-down racer needs is that a graze costs almost
 * nothing, a square hit is a disaster, and you can lean on a wall through a corner and get away with
 * it. So the response is written the same way the car model is: by hand, with every number a dial.
 *
 * The shape of it, in four parts:
 *
 * 1. **Separate.** Push the car out along the contact normal. Position only - adding velocity to
 *    un-penetrate is what makes cars ping off walls they were only resting against.
 * 2. **Bounce, across the wall.** Reflect the closing speed, scaled by `wallRestitution`. Below
 *    `wallSettleSpeed` the bounce is dropped entirely so a car pressed into a barrier sits quietly
 *    instead of buzzing.
 * 3. **Drag, along the wall.** Coulomb's rule: the speed lost along the face is `wallFriction`
 *    times how hard the car went into it. That one relationship is where most of the feel lives,
 *    because the cost of a hit then scales with the tangent of its angle all by itself - at ten
 *    degrees you keep about ninety per cent of your speed, at forty-five you lose about half, and
 *    leaning on a barrier through a corner costs exactly as much as you are leaning on it. On top
 *    of that, and only once a contact is a real hit rather than a scrape, `wallBite` takes a
 *    further bite out of everything. That is the dial that decides whether a wall is a nuisance or
 *    a disaster, and it moves without making scrapes draggy.
 * 4. **Spin, and then guide.** The impulse acts at the contact point, so clipping a wall with a
 *    front corner whips the back round. Then, only while the hit is shallow, the nose is pulled
 *    towards the wall's direction - that is what makes scraping along a barrier a thing you can
 *    hold rather than a thing that spits you out.
 *
 * Nothing here except the guidance term uses `dt`, so a collision resolves identically no matter
 * what the display is doing. That is not an accident: the fixed timestep exists to make handling
 * mean one thing everywhere, and a frame-rate-dependent wall would quietly undo it.
 */

import type { CarState } from './carModel';
import {
  CAR_COLLISION_RADIUS,
  CAR_LENGTH,
  CAR_SPINE_HALF_LENGTH,
  type WallConstants,
} from './handling';
import type { SegmentGrid } from '../track/segmentGrid';
import type { WallSegment } from '../track/trackTypes';

/**
 * Passes over the contact set per step. One pass leaves a car wedged into a corner half-solved,
 * because pushing it off one wall drives it into the other; two settles it. More is wasted work.
 */
const SOLVER_PASSES = 2;
/** Extra separation so a resolved contact does not immediately re-register next step. */
const SEPARATION_SLOP = 0.02;
/**
 * Divides the angular kick from an impact. Not a physical moment of inertia - none of this is a
 * rigid-body solve - but derived from the car's size so `wallSpin` sits near 1, and so that changing
 * the car's dimensions later does not silently change how hard walls spin it.
 */
const SPIN_INERTIA = CAR_LENGTH * CAR_COLLISION_RADIUS;

export interface WallImpact {
  /** Where the car touched, world units. */
  x: number;
  y: number;
  /** Unit normal pointing away from the wall, into the road. */
  nx: number;
  ny: number;
  /** 0 for a perfectly shallow graze, 1 for a dead-square hit. */
  severity: number;
  /** Closing speed into the wall before the response, world units per second. */
  closingSpeed: number;
  /** Total speed the car lost to this contact, world units per second. */
  speedLost: number;
  /** True while the car is touching a wall but not really hitting it - a scrape. */
  scraping: boolean;
}

interface Contact {
  wall: WallSegment;
  /** How far the capsule overlaps the wall. */
  depth: number;
  nx: number;
  ny: number;
  /** Point on the car's surface, which is also the lever arm for the spin. */
  x: number;
  y: number;
}

/**
 * A hit shallower than this reads as a scrape rather than a crash: no crash penalty, and the wall
 * guides you rather than punishing you. 0.3 is about seventeen degrees off the barrier, which is
 * roughly where "I brushed it" stops being what happened.
 */
const SCRAPE_SEVERITY = 0.3;

/**
 * Resolve the car against the track walls for one simulation step. Mutates `state` and returns the
 * worst contact of the step, or null if the car touched nothing.
 *
 * Call it AFTER the car model has integrated: the model decides where the car wanted to go, this
 * decides what the world had to say about it.
 */
export function resolveWallCollisions(
  state: CarState,
  walls: readonly WallSegment[],
  grid: SegmentGrid,
  c: WallConstants,
  dt: number,
  scratch: number[] = [],
): WallImpact | null {
  let worst: WallImpact | null = null;

  for (let pass = 0; pass < SOLVER_PASSES; pass += 1) {
    const cos = Math.cos(state.heading);
    const sin = Math.sin(state.heading);
    const headX = state.x + cos * CAR_SPINE_HALF_LENGTH;
    const headY = state.y + sin * CAR_SPINE_HALF_LENGTH;
    const tailX = state.x - cos * CAR_SPINE_HALF_LENGTH;
    const tailY = state.y - sin * CAR_SPINE_HALF_LENGTH;

    const reach = CAR_SPINE_HALF_LENGTH + CAR_COLLISION_RADIUS;
    const candidates = grid.query(
      state.x - reach,
      state.y - reach,
      state.x + reach,
      state.y + reach,
      scratch,
    );

    let touched = false;
    // Ascending segment index, always - see SegmentGrid. Collision response does not commute, so a
    // stable order is what keeps the simulation deterministic.
    for (const index of candidates) {
      const contact = probe(walls[index], headX, headY, tailX, tailY);
      if (!contact) continue;
      touched = true;
      const impact = respond(state, contact, c);
      if (!worst || impact.severity > worst.severity) worst = impact;
    }
    if (!touched) break;
  }

  // Guidance is applied once per step rather than once per contact, so a car wedged against two
  // walls in a corner is not straightened twice as hard as one leaning on a single barrier.
  if (worst && worst.scraping) guideAlongWall(state, worst, c, dt);

  return worst;
}

/**
 * Turn the nose towards whichever way along the wall it is already closest to pointing.
 *
 * This is the difference between a wall you can lean on and a wall that stops you. It only runs on
 * shallow contacts and fades out completely by the time a hit is a real one, so it never rescues
 * anybody from driving straight into a barrier.
 */
function guideAlongWall(state: CarState, impact: WallImpact, c: WallConstants, dt: number): void {
  if (c.wallAlign <= 0) return;
  // The two directions along the wall are the normal turned either way. Choose by the nose, not by
  // the velocity, so reversing out of a scrape does not try to spin the car round.
  const tangentX = -impact.ny;
  const tangentY = impact.nx;
  const facing = Math.cos(state.heading) * tangentX + Math.sin(state.heading) * tangentY;
  const along = facing >= 0 ? 1 : -1;
  const error = shortestAngle(Math.atan2(tangentY * along, tangentX * along) - state.heading);
  const strength = 1 - impact.severity / SCRAPE_SEVERITY;
  state.angularVelocity += error * c.wallAlign * strength * dt;
}

/** Closest approach between the car's spine and one wall, as a contact or nothing. */
function probe(
  wall: WallSegment,
  headX: number,
  headY: number,
  tailX: number,
  tailY: number,
): Contact | null {
  const near = closestPointsBetweenSegments(tailX, tailY, headX, headY, wall);
  const dx = near.spineX - near.wallX;
  const dy = near.spineY - near.wallY;
  const gap = Math.hypot(dx, dy);
  if (gap >= CAR_COLLISION_RADIUS) return null;

  // Normally the push-out direction is simply away from the wall. If the car has somehow ended up
  // behind the barrier - a bad spawn, a future teleporting weapon - that direction would drive it
  // further out, so fall back to the wall's own inward normal and push it all the way back.
  let nx: number;
  let ny: number;
  let depth: number;
  if (gap > 1e-6 && dx * wall.nx + dy * wall.ny > 0) {
    nx = dx / gap;
    ny = dy / gap;
    depth = CAR_COLLISION_RADIUS - gap;
  } else {
    nx = wall.nx;
    ny = wall.ny;
    depth = CAR_COLLISION_RADIUS + gap;
  }

  return {
    wall,
    depth,
    nx,
    ny,
    x: near.spineX - nx * CAR_COLLISION_RADIUS,
    y: near.spineY - ny * CAR_COLLISION_RADIUS,
  };
}

function respond(state: CarState, contact: Contact, c: WallConstants): WallImpact {
  // Separate first, in position only. Un-penetrating with velocity is what makes a car resting
  // against a barrier vibrate off it.
  state.x += contact.nx * (contact.depth + SEPARATION_SLOP);
  state.y += contact.ny * (contact.depth + SEPARATION_SLOP);

  const speedBefore = Math.hypot(state.vx, state.vy);
  const normalSpeed = state.vx * contact.nx + state.vy * contact.ny;

  // Already leaving. The push-out was enough, and reflecting here would fling the car off a wall it
  // was driving away from. Still reported, because touching a wall is a thing the game wants to
  // know about even when nothing was lost by it.
  if (normalSpeed >= 0) {
    return {
      x: contact.x,
      y: contact.y,
      nx: contact.nx,
      ny: contact.ny,
      severity: 0,
      closingSpeed: 0,
      speedLost: 0,
      scraping: true,
    };
  }

  const closingSpeed = -normalSpeed;
  const severity = speedBefore > 1 ? Math.min(closingSpeed / speedBefore, 1) : 0;

  const tangentX = state.vx - normalSpeed * contact.nx;
  const tangentY = state.vy - normalSpeed * contact.ny;

  const bounce = closingSpeed < c.wallSettleSpeed ? 0 : closingSpeed * c.wallRestitution;

  // Coulomb: the drag along the face is proportional to the impulse across it, capped so friction
  // can slow the car along the wall but never drag it backwards.
  const tangentSpeed = Math.hypot(tangentX, tangentY);
  const drag = Math.min(tangentSpeed, c.wallFriction * (closingSpeed + bounce));
  const keep = tangentSpeed > 1e-6 ? 1 - drag / tangentSpeed : 0;

  let nextVx = contact.nx * bounce + tangentX * keep;
  let nextVy = contact.ny * bounce + tangentY * keep;

  const scraping = severity < SCRAPE_SEVERITY;
  if (!scraping && c.wallBite > 0) {
    const penalty = Math.max(0, 1 - c.wallBite * severity * severity);
    nextVx *= penalty;
    nextVy *= penalty;
  }

  // The impulse acts at the contact point, not at the centre, so clipping a wall with a front
  // corner whips the back round while the same hit taken flat barely moves you.
  const leverX = contact.x - state.x;
  const leverY = contact.y - state.y;
  const impulseX = nextVx - state.vx;
  const impulseY = nextVy - state.vy;
  state.angularVelocity += (c.wallSpin * (leverX * impulseY - leverY * impulseX)) / SPIN_INERTIA;

  state.vx = nextVx;
  state.vy = nextVy;

  return {
    x: contact.x,
    y: contact.y,
    nx: contact.nx,
    ny: contact.ny,
    severity,
    closingSpeed,
    speedLost: Math.max(0, speedBefore - Math.hypot(state.vx, state.vy)),
    scraping,
  };
}

interface ClosestPoints {
  spineX: number;
  spineY: number;
  wallX: number;
  wallY: number;
}

/**
 * Closest points between the car's spine and a wall segment.
 *
 * Two-segment closest approach, done the plain way: clamp the unconstrained solution and then walk
 * the clamped parameter back onto the other segment. Parallel segments fall out of the same code
 * because the degenerate case is handled by the clamp rather than by a special branch.
 */
function closestPointsBetweenSegments(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  wall: WallSegment,
): ClosestPoints {
  const ux = bx - ax;
  const uy = by - ay;
  const vx = wall.bx - wall.ax;
  const vy = wall.by - wall.ay;
  const wx = ax - wall.ax;
  const wy = ay - wall.ay;

  const a = ux * ux + uy * uy;
  const b = ux * vx + uy * vy;
  const cc = vx * vx + vy * vy;
  const d = ux * wx + uy * wy;
  const e = vx * wx + vy * wy;
  const denominator = a * cc - b * b;

  if (denominator <= 1e-9) {
    // Parallel, which for a car running flat along a barrier is the common case, not the exception.
    // Any point of the overlap is equally close, so take the middle of it: picking an end instead
    // would invent a lever arm and spin a car that landed on the wall perfectly flat.
    const inverse = a > 1e-9 ? 1 / a : 0;
    const first = clamp01((ux * (wall.ax - ax) + uy * (wall.ay - ay)) * inverse);
    const second = clamp01((ux * (wall.bx - ax) + uy * (wall.by - ay)) * inverse);
    const s = (first + second) / 2;
    const spineX = ax + ux * s;
    const spineY = ay + uy * s;
    const t = cc > 1e-9 ? clamp01(((spineX - wall.ax) * vx + (spineY - wall.ay) * vy) / cc) : 0;
    return { spineX, spineY, wallX: wall.ax + vx * t, wallY: wall.ay + vy * t };
  }

  let s = clamp01((b * e - cc * d) / denominator);
  let t = cc > 1e-9 ? (b * s + e) / cc : 0;

  if (t < 0) {
    t = 0;
    s = a > 1e-9 ? clamp01(-d / a) : 0;
  } else if (t > 1) {
    t = 1;
    s = a > 1e-9 ? clamp01((b - d) / a) : 0;
  }

  return {
    spineX: ax + ux * s,
    spineY: ay + uy * s,
    wallX: wall.ax + vx * t,
    wallY: wall.ay + vy * t,
  };
}

function shortestAngle(angle: number): number {
  const wrapped = (angle + Math.PI) % (Math.PI * 2);
  return (wrapped < 0 ? wrapped + Math.PI * 2 : wrapped) - Math.PI;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
