import { describe, expect, it } from 'vitest';
import { createCarInput, createCarState, stepCar, type CarState } from './carModel';
import { resolveWallCollisions, type WallImpact } from './wallCollision';
import { CAR_COLLISION_RADIUS, DEFAULT_HANDLING, type HandlingConstants } from './handling';
import { SegmentGrid } from '../track/segmentGrid';
import type { WallSegment } from '../track/trackTypes';
import { FixedStepLoop } from './fixedStep';
import { buildTrack, buildWallGrid, trackPositionOf } from '../track/buildTrack';
import { CUTTERS_YARD } from '../track/tracks/cuttersYard';

const DT = 1 / 60;

/**
 * A single wall lying along the x axis with the road below it (+y). The car drives up into it, so
 * "square" is straight up and a shallow angle is nearly along it.
 */
function flatWall(): { walls: WallSegment[]; grid: SegmentGrid } {
  const walls: WallSegment[] = [];
  for (let i = 0; i < 40; i += 1) {
    const ax = -2000 + i * 100;
    walls.push({
      ax,
      ay: 0,
      bx: ax + 100,
      by: 0,
      nx: 0,
      ny: 1,
      length: 100,
      side: 'left',
      index: walls.length,
    });
  }
  return { walls, grid: new SegmentGrid(walls) };
}

/**
 * Fly a car at a wall at a given angle and speed, and report what it had left afterwards.
 * `angle` is degrees off the wall: 0 is parallel, 90 is dead square.
 */
function hitWall(
  angleDegrees: number,
  speed: number,
  overrides: Partial<HandlingConstants> = {},
): { state: CarState; impact: WallImpact | null; speedAfter: number; speedBefore: number } {
  const c: HandlingConstants = { ...DEFAULT_HANDLING, ...overrides };
  const { walls, grid } = flatWall();
  const radians = (angleDegrees * Math.PI) / 180;
  // Heading points up and to the right; the wall is above (negative y).
  const heading = -radians;
  const state = createCarState(-40, 200, heading);
  state.vx = Math.cos(heading) * speed;
  state.vy = Math.sin(heading) * speed;

  let impact: WallImpact | null = null;
  for (let i = 0; i < 240 && !impact; i += 1) {
    state.x += state.vx * DT;
    state.y += state.vy * DT;
    impact = resolveWallCollisions(state, walls, grid, c, DT);
  }
  return { state, impact, speedAfter: Math.hypot(state.vx, state.vy), speedBefore: speed };
}

describe('resolveWallCollisions', () => {
  it('does nothing at all when the car is nowhere near a wall', () => {
    const { walls, grid } = flatWall();
    const state = createCarState(0, 500, 0);
    state.vx = 400;
    const before = { ...state };
    expect(resolveWallCollisions(state, walls, grid, DEFAULT_HANDLING, DT)).toBeNull();
    expect(state).toEqual(before);
  });

  it('stops the car passing through a wall', () => {
    const { state } = hitWall(90, 600);
    expect(state.y).toBeGreaterThanOrEqual(CAR_COLLISION_RADIUS - 1);
  });

  it('costs almost nothing on a glancing hit and most of your speed on a square one', () => {
    const graze = hitWall(10, 600);
    const square = hitWall(90, 600);

    expect(graze.speedAfter / graze.speedBefore).toBeGreaterThan(0.85);
    expect(square.speedAfter / square.speedBefore).toBeLessThan(0.35);
  });

  it('charges for a scrape in proportion to how hard you lean on it', () => {
    // Same wall, same speed along it, different amounts of pressure into it.
    const lean = (into: number): number => {
      const c = { ...DEFAULT_HANDLING };
      const { walls, grid } = flatWall();
      const state = createCarState(-900, CAR_COLLISION_RADIUS, 0);
      let lost = 0;
      for (let i = 0; i < 60; i += 1) {
        state.vx = 500;
        state.vy = -into;
        const before = Math.hypot(state.vx, state.vy);
        resolveWallCollisions(state, walls, grid, c, DT);
        lost += before - Math.hypot(state.vx, state.vy);
        state.x += state.vx * DT;
        state.y += state.vy * DT;
      }
      return lost;
    };
    expect(lean(80)).toBeGreaterThan(lean(20) * 2);
    expect(lean(0)).toBeLessThan(1);
  });

  it('does not spin a car that lands on a wall perfectly flat', () => {
    const c = { ...DEFAULT_HANDLING };
    const { walls, grid } = flatWall();
    // Parallel to the barrier, sliding straight sideways into it. Every point of the car touches
    // at once, so there is no lever arm and nothing to spin about.
    const state = createCarState(0, CAR_COLLISION_RADIUS + 1, 0);
    state.vy = -300;
    resolveWallCollisions(state, walls, grid, c, DT);
    expect(Math.abs(state.angularVelocity)).toBeLessThan(0.02);
  });

  it('charges more the squarer the hit, all the way up', () => {
    const kept = [5, 15, 30, 45, 60, 90].map((angle) => hitWall(angle, 600).speedAfter);
    // Never cheaper for being squarer. The top two flatten out because by then there is no speed
    // along the wall left to charge for - everything that is left is the bounce.
    for (let i = 1; i < kept.length; i += 1) expect(kept[i]).toBeLessThanOrEqual(kept[i - 1]);
    expect(kept[2]).toBeLessThan(kept[0] * 0.7);
    expect(kept[5]).toBeLessThan(kept[2] * 0.5);
  });

  it('deflects a glancing hit along the wall rather than reversing it', () => {
    const { state } = hitWall(20, 600);
    // Still travelling the way it was going, and no longer heading into the wall.
    expect(state.vx).toBeGreaterThan(0);
    expect(state.vy).toBeGreaterThanOrEqual(0);
  });

  it('throws a square hit back off the wall', () => {
    const { state, impact } = hitWall(90, 600);
    expect(impact?.severity).toBeGreaterThan(0.95);
    expect(state.vy).toBeGreaterThan(0);
  });

  it('lets the bounce be tuned from sticky to springy', () => {
    // Crash penalty off, so this measures the bounce dial and nothing else.
    const sticky = hitWall(90, 600, { wallRestitution: 0, wallBite: 0 });
    const springy = hitWall(90, 600, { wallRestitution: 0.9, wallBite: 0 });
    expect(sticky.state.vy).toBeLessThan(20);
    expect(springy.state.vy).toBeGreaterThan(500);
  });

  it('reports how square the hit was and what it cost', () => {
    const { impact } = hitWall(45, 600);
    expect(impact).not.toBeNull();
    expect(impact?.severity).toBeGreaterThan(0.6);
    expect(impact?.severity).toBeLessThan(0.8);
    expect(impact?.speedLost).toBeGreaterThan(100);
    expect(impact?.scraping).toBe(false);
  });

  it('calls a shallow contact a scrape and a real one a crash', () => {
    expect(hitWall(8, 600).impact?.scraping).toBe(true);
    expect(hitWall(60, 600).impact?.scraping).toBe(false);
  });

  it('spins the car when a wall is caught off-centre', () => {
    const spun = hitWall(45, 600);
    const straight = hitWall(45, 600, { wallSpin: 0 });
    expect(Math.abs(spun.state.angularVelocity)).toBeGreaterThan(0.8);
    expect(Math.abs(straight.state.angularVelocity)).toBe(0);
  });

  it('lets a car slide along a wall it is leaning on', () => {
    const c = { ...DEFAULT_HANDLING };
    const { walls, grid } = flatWall();
    // Parallel to the wall, pressed gently against it, on the power.
    const state = createCarState(-600, CAR_COLLISION_RADIUS - 1, 0);
    state.vx = 500;
    state.vy = -30;

    for (let i = 0; i < 90; i += 1) {
      stepCar(state, { ...createCarInput(), throttle: 1 }, c, DT);
      resolveWallCollisions(state, walls, grid, c, DT);
    }

    expect(state.x).toBeGreaterThan(-200);
    expect(Math.hypot(state.vx, state.vy)).toBeGreaterThan(300);
    expect(state.y).toBeGreaterThan(0);
  });

  it('straightens the nose out of a scrape rather than letting it dig in', () => {
    // Nosed into the wall and coasting along it: a scrape, not a hit.
    const run = (wallAlign: number): CarState => {
      const c = { ...DEFAULT_HANDLING, wallAlign };
      const { walls, grid } = flatWall();
      const angle = -0.14;
      const state = createCarState(-1500, CAR_COLLISION_RADIUS, angle);
      state.vx = Math.cos(angle) * 500;
      state.vy = Math.sin(angle) * 500;
      for (let i = 0; i < 30; i += 1) {
        stepCar(state, createCarInput(), c, DT);
        resolveWallCollisions(state, walls, grid, c, DT);
      }
      return state;
    };
    // Guidance turns the nose back towards parallel faster than the impacts alone would.
    expect(run(8).heading).toBeGreaterThan(run(0).heading);
  });

  it('lets you lean on a wall through a corner instead of being stopped by it', () => {
    // Along a barrier at speed, holding a steady steer into it - a car being squeezed in a corner.
    const run = (wallAlign: number): number => {
      const c = { ...DEFAULT_HANDLING, wallAlign };
      const { walls, grid } = flatWall();
      const state = createCarState(-1900, CAR_COLLISION_RADIUS, 0);
      state.vx = 520;
      for (let i = 0; i < 120; i += 1) {
        stepCar(state, { ...createCarInput(), throttle: 1, steer: -0.3 }, c, DT);
        resolveWallCollisions(state, walls, grid, c, DT);
      }
      return Math.hypot(state.vx, state.vy);
    };
    expect(run(4)).toBeGreaterThan(run(0) * 1.15);
  });

  it('settles quietly against a wall instead of buzzing off it', () => {
    const c = { ...DEFAULT_HANDLING };
    const { walls, grid } = flatWall();
    const state = createCarState(0, CAR_COLLISION_RADIUS + 2, -Math.PI / 2);
    state.vy = -20;
    for (let i = 0; i < 120; i += 1) {
      resolveWallCollisions(state, walls, grid, c, DT);
      state.x += state.vx * DT;
      state.y += state.vy * DT;
      state.vx *= 0.98;
      state.vy *= 0.98;
    }
    expect(Math.hypot(state.vx, state.vy)).toBeLessThan(20);
    expect(state.y).toBeGreaterThan(CAR_COLLISION_RADIUS - 1);
  });

  it('pushes a car that has ended up behind a barrier back onto the road', () => {
    const c = { ...DEFAULT_HANDLING };
    const { walls, grid } = flatWall();
    const state = createCarState(0, -8, 0);
    resolveWallCollisions(state, walls, grid, c, DT);
    expect(state.y).toBeGreaterThan(0);
  });

  it('is deterministic for identical inputs', () => {
    const run = (): CarState => {
      const c = { ...DEFAULT_HANDLING };
      const { walls, grid } = flatWall();
      const state = createCarState(-800, 300, -0.4);
      for (let i = 0; i < 400; i += 1) {
        stepCar(state, { ...createCarInput(), throttle: 1, steer: i % 120 < 60 ? -1 : 1 }, c, DT);
        resolveWallCollisions(state, walls, grid, c, DT);
      }
      return state;
    };
    expect(run()).toEqual(run());
  });
});

describe('collisions under the fixed timestep', () => {
  /** The same drive, played through the loop at wildly different frame rates. */
  const driveThroughLoop = (frameMs: number, ticks: number): CarState => {
    const c = { ...DEFAULT_HANDLING };
    const { walls, grid } = flatWall();
    const state = createCarState(-900, 400, -0.5);
    const loop = new FixedStepLoop();
    let tick = 0;
    // Keep feeding frames of this length until the simulation has run exactly `ticks` steps. How
    // many frames that takes is the display's business, which is the entire point.
    while (tick < ticks) {
      loop.advance(frameMs, (dt) => {
        if (tick >= ticks) return;
        stepCar(
          state,
          { ...createCarInput(), throttle: 1, steer: tick % 150 < 75 ? -1 : 1 },
          c,
          dt,
        );
        resolveWallCollisions(state, walls, grid, c, dt);
        tick += 1;
      });
    }
    return state;
  };

  it('lands in exactly the same place at 30, 60 and 144 frames a second', () => {
    const slow = driveThroughLoop(1000 / 30, 600);
    const normal = driveThroughLoop(1000 / 60, 600);
    const fast = driveThroughLoop(1000 / 144, 600);
    // Bit-identical, not merely close: the fixed timestep exists so that a handling number means
    // one thing on a laptop and the same thing on a gaming monitor.
    expect(normal).toEqual(slow);
    expect(fast).toEqual(slow);
  });

  it('is unaffected by wildly uneven frame pacing', () => {
    const steady = driveThroughLoop(1000 / 60, 600);
    const stuttering = driveThroughLoop(7.3, 600);
    expect(stuttering).toEqual(steady);
  });
});

describe("driving Cutter's Yard", () => {
  const track = buildTrack(CUTTERS_YARD);
  const grid = buildWallGrid(track);

  it('cannot be driven off the track, however hard you try', () => {
    const c = { ...DEFAULT_HANDLING };
    const state = createCarState(track.start.x, track.start.y, track.start.heading);
    // Full throttle, full lock, held for twenty seconds. Without walls this leaves the circuit in
    // under two.
    for (let i = 0; i < 1200; i += 1) {
      stepCar(state, { ...createCarInput(), throttle: 1, steer: 1 }, c, DT);
      resolveWallCollisions(state, track.walls, grid, c, DT);
      const where = trackPositionOf(track, state.x, state.y);
      expect(Math.abs(where.offset)).toBeLessThan(
        track.samples[where.sampleIndex].halfWidth + CAR_COLLISION_RADIUS + 6,
      );
    }
  });

  it('gets round a lap on the throttle without needing to be rescued', () => {
    const c = { ...DEFAULT_HANDLING };
    const state = createCarState(track.start.x, track.start.y, track.start.heading);
    let travelled = 0;
    let previous = 0;

    // A crude driver: aim at the centreline a little way ahead and steer at it.
    for (let i = 0; i < 60 * 90; i += 1) {
      const where = trackPositionOf(track, state.x, state.y);
      const aheadIndex =
        (where.sampleIndex + Math.round(220 / track.spacing)) % track.samples.length;
      const target = track.samples[aheadIndex];
      const wanted = Math.atan2(target.y - state.y, target.x - state.x);
      const error = Math.atan2(Math.sin(wanted - state.heading), Math.cos(wanted - state.heading));
      stepCar(
        state,
        { ...createCarInput(), throttle: 1, steer: Math.max(-1, Math.min(1, error * 2.5)) },
        c,
        DT,
      );
      resolveWallCollisions(state, track.walls, grid, c, DT);

      const now = trackPositionOf(track, state.x, state.y).distance;
      let delta = now - previous;
      if (delta < -track.length / 2) delta += track.length;
      if (delta > track.length / 2) delta -= track.length;
      travelled += delta;
      previous = now;
      if (travelled >= track.length) break;
    }

    expect(travelled).toBeGreaterThanOrEqual(track.length);
  });
});
