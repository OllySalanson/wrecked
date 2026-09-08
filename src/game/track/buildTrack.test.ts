import { describe, expect, it } from 'vitest';
import { buildTrack, buildWallGrid, lapDelta, poseAt, trackPositionOf } from './buildTrack';
import { CUTTERS_YARD } from './tracks/cuttersYard';
import type { TrackDefinition, WallSegment } from './trackTypes';

const track = buildTrack(CUTTERS_YARD);

/** A square with rounded corners: small enough to reason about by hand. */
const SQUARE: TrackDefinition = {
  id: 'square',
  name: 'Square',
  blurb: 'A test loop.',
  startNode: 0,
  nodes: [
    { x: -600, y: -600, radius: 200, halfWidth: 100 },
    { x: 600, y: -600, radius: 200, halfWidth: 100 },
    { x: 600, y: 600, radius: 200, halfWidth: 100 },
    { x: -600, y: 600, radius: 200, halfWidth: 100 },
  ],
};

function pointToSegment(px: number, py: number, wall: WallSegment): number {
  const dx = wall.bx - wall.ax;
  const dy = wall.by - wall.ay;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq > 0
      ? Math.max(0, Math.min(1, ((px - wall.ax) * dx + (py - wall.ay) * dy) / lengthSq))
      : 0;
  return Math.hypot(px - (wall.ax + dx * t), py - (wall.ay + dy * t));
}

function segmentsCross(a: WallSegment, b: WallSegment): boolean {
  const d1x = a.bx - a.ax;
  const d1y = a.by - a.ay;
  const d2x = b.bx - b.ax;
  const d2y = b.by - b.ay;
  const denominator = d1x * d2y - d1y * d2x;
  if (Math.abs(denominator) < 1e-12) return false;
  const t = ((b.ax - a.ax) * d2y - (b.ay - a.ay) * d2x) / denominator;
  const u = ((b.ax - a.ax) * d1y - (b.ay - a.ay) * d1x) / denominator;
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9;
}

describe('buildTrack', () => {
  it('closes the loop with evenly spaced samples', () => {
    expect(track.samples.length).toBeGreaterThan(100);
    expect(track.length).toBeCloseTo(track.samples.length * track.spacing, 6);
    for (let i = 0; i < track.samples.length; i += 1) {
      expect(track.samples[i].distance).toBeCloseTo(i * track.spacing, 6);
    }
    const first = track.samples[0];
    const last = track.samples[track.samples.length - 1];
    expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeLessThan(track.spacing * 1.5);
  });

  it('puts lap distance zero on the start line', () => {
    expect(track.start.distance).toBe(0);
    const startNode = CUTTERS_YARD.nodes[CUTTERS_YARD.startNode];
    expect(Math.hypot(track.start.x - startNode.x, track.start.y - startNode.y)).toBeLessThan(30);
  });

  it('builds a straight where the authored vertices are collinear', () => {
    const straight = buildTrack({
      ...SQUARE,
      id: 'straight-check',
      nodes: [
        { x: -600, y: 0, radius: 200, halfWidth: 100 },
        { x: 0, y: 0, radius: 200, halfWidth: 100 },
        { x: 600, y: -600, radius: 200, halfWidth: 100 },
        { x: -600, y: -600, radius: 200, halfWidth: 100 },
      ],
    });
    // The marker vertex at the origin rounds to nothing, so samples between it and the previous
    // corner sit exactly on y = 0.
    const onLine = straight.samples.filter((s) => s.x > -300 && s.x < -100 && s.y > -300);
    expect(onLine.length).toBeGreaterThan(5);
    for (const sample of onLine) expect(Math.abs(sample.y)).toBeLessThan(0.5);
  });

  it('honours the authored corner radius', () => {
    const square = buildTrack(SQUARE);
    // Curvature measured over a short span through the middle of a corner.
    const radii = square.samples.map((_, i) => {
      const n = square.samples.length;
      const p = square.samples[(i - 3 + n) % n];
      const c = square.samples[i];
      const q = square.samples[(i + 3) % n];
      const area = Math.abs((c.x - p.x) * (q.y - p.y) - (q.x - p.x) * (c.y - p.y)) / 2;
      if (area < 1e-6) return Infinity;
      return (
        (Math.hypot(c.x - p.x, c.y - p.y) *
          Math.hypot(q.x - c.x, q.y - c.y) *
          Math.hypot(q.x - p.x, q.y - p.y)) /
        (4 * area)
      );
    });
    expect(Math.min(...radii)).toBeGreaterThan(190);
    expect(Math.min(...radii)).toBeLessThan(215);
  });

  it('shrinks corners that would eat more straight than there is', () => {
    // Two 90-degree corners 300 apart, each asking for a 600-unit radius.
    const cramped = buildTrack({
      id: 'cramped',
      name: 'Cramped',
      blurb: '',
      startNode: 0,
      nodes: [
        { x: -800, y: 0, radius: 600, halfWidth: 60 },
        { x: 0, y: 0, radius: 600, halfWidth: 60 },
        { x: 0, y: -300, radius: 600, halfWidth: 60 },
        { x: -800, y: -300, radius: 600, halfWidth: 60 },
      ],
    });
    for (const corner of cramped.corners) expect(corner.radius).toBeLessThan(600);
    // And the result is still a valid closed loop rather than an inside-out one.
    expect(cramped.samples.length).toBeGreaterThan(20);
  });
});

describe("Cutter's Yard geometry", () => {
  it('never lets a wall cut inside the road', () => {
    for (const sample of track.samples) {
      let nearest = Infinity;
      for (const wall of track.walls) {
        nearest = Math.min(nearest, pointToSegment(sample.x, sample.y, wall));
      }
      // Tolerance covers chording the arcs and the slight tilt where the road changes width.
      expect(nearest).toBeGreaterThan(sample.halfWidth - 3);
    }
  });

  it('has no wall crossing another wall', () => {
    let crossings = 0;
    for (let i = 0; i < track.walls.length; i += 1) {
      for (let j = i + 2; j < track.walls.length; j += 1) {
        if (segmentsCross(track.walls[i], track.walls[j])) crossings += 1;
      }
    }
    expect(crossings).toBe(0);
  });

  it('gives every corner a radius the car could physically get round', () => {
    // A corner tighter than the road is half-wide has an inner wall that curves back through
    // itself. This is the authoring mistake worth failing a build over.
    for (const corner of track.corners) {
      const node = CUTTERS_YARD.nodes[corner.nodeIndex];
      expect(corner.radius).toBeGreaterThan(node.halfWidth * 1.2);
    }
  });

  it('points every wall normal back at the road', () => {
    for (const wall of track.walls) {
      const midX = (wall.ax + wall.bx) / 2;
      const midY = (wall.ay + wall.by) / 2;
      const inside = trackPositionOf(track, midX + wall.nx * 20, midY + wall.ny * 20);
      expect(Math.abs(inside.offset)).toBeLessThan(
        Math.abs(trackPositionOf(track, midX - wall.nx * 20, midY - wall.ny * 20).offset),
      );
    }
  });
});

describe('trackPositionOf', () => {
  it('reads zero offset on the centreline and the right sign off it', () => {
    const sample = track.samples[100];
    const middle = trackPositionOf(track, sample.x, sample.y);
    expect(Math.abs(middle.offset)).toBeLessThan(1);
    expect(middle.onTrack).toBe(true);

    const left = trackPositionOf(track, sample.x + sample.nx * 50, sample.y + sample.ny * 50);
    expect(left.offset).toBeGreaterThan(40);
    expect(left.onTrack).toBe(true);

    const beyond = trackPositionOf(
      track,
      sample.x + sample.nx * (sample.halfWidth + 40),
      sample.y + sample.ny * (sample.halfWidth + 40),
    );
    expect(beyond.onTrack).toBe(false);
  });

  it('recovers the lap distance of every sample', () => {
    for (let i = 0; i < track.samples.length; i += 37) {
      const sample = track.samples[i];
      const found = trackPositionOf(track, sample.x, sample.y);
      expect(Math.abs(lapDelta(track, sample.distance, found.distance))).toBeLessThan(
        track.spacing,
      );
    }
  });

  it('moves smoothly rather than stepping between samples', () => {
    const a = track.samples[200];
    const b = track.samples[201];
    const mid = trackPositionOf(track, (a.x + b.x) / 2, (a.y + b.y) / 2);
    expect(mid.distance).toBeGreaterThan(a.distance + track.spacing * 0.2);
    expect(mid.distance).toBeLessThan(b.distance - track.spacing * 0.2);
  });
});

describe('lapDelta', () => {
  it('takes the short way round the seam', () => {
    expect(lapDelta(track, track.length - 100, 50)).toBeCloseTo(150, 6);
    expect(lapDelta(track, 50, track.length - 100)).toBeCloseTo(-150, 6);
  });
});

describe('poseAt', () => {
  it('returns a pose on the centreline for any distance, wrapped', () => {
    const pose = poseAt(track, track.length * 1.25);
    const found = trackPositionOf(track, pose.x, pose.y);
    expect(Math.abs(found.offset)).toBeLessThan(1);
    expect(Math.abs(lapDelta(track, track.length * 0.25, found.distance))).toBeLessThan(
      track.spacing * 2,
    );
  });
});

describe('the wall broadphase', () => {
  it('returns every wall genuinely near a box, in index order', () => {
    const grid = buildWallGrid(track);
    const sample = track.samples[300];
    const box = 120;
    const found = grid.query(sample.x - box, sample.y - box, sample.x + box, sample.y + box);

    for (let i = 1; i < found.length; i += 1) expect(found[i]).toBeGreaterThan(found[i - 1]);

    const expected = track.walls
      .filter(
        (wall) =>
          Math.min(wall.ax, wall.bx) <= sample.x + box &&
          Math.max(wall.ax, wall.bx) >= sample.x - box &&
          Math.min(wall.ay, wall.by) <= sample.y + box &&
          Math.max(wall.ay, wall.by) >= sample.y - box,
      )
      .map((wall) => wall.index);
    for (const index of expected) expect(found).toContain(index);
  });
});
