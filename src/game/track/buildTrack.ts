/**
 * Turning an authored track into something the simulation can drive on.
 *
 * The pipeline is: corner vertices -> straights and arcs -> evenly spaced samples -> two offset
 * walls -> broadphase. Nothing here knows about Phaser; the drawing is built from the same output
 * in `src/game/render/trackRenderer.ts`, which is the split between picture and collision that the
 * design report calls the most important asset decision and free if made now.
 *
 * The geometry is deliberately old-fashioned: tangent lines and circular fillets, the way a circuit
 * is actually surveyed. A spline would be fewer lines of code and would have cost us the one thing
 * worth having here, which is being able to state a corner's radius and check it against the car's
 * turning circle before anybody drives it.
 */

import { SegmentGrid } from './segmentGrid';
import type {
  CentrelineSample,
  ResolvedCorner,
  Track,
  TrackBounds,
  TrackDefinition,
  TrackNode,
  TrackPosition,
  WallSegment,
} from './trackTypes';

const DEFAULT_SAMPLE_SPACING = 12;
/**
 * Most of a straight either side of a corner that the corner is allowed to eat. Two corners facing
 * each other across a short straight would otherwise overlap and turn the road inside out.
 */
const MAX_STRAIGHT_SHARE = 0.48;
/** Below this turn angle a vertex is treated as a straight-line marker rather than a corner. */
const STRAIGHT_EPSILON = 1e-3;

interface DensePoint {
  x: number;
  y: number;
}

interface CornerGeometry {
  node: TrackNode;
  index: number;
  /** Turn angle, radians, always positive. Zero for a marker on a straight. */
  turn: number;
  /** +1 turns right of travel, -1 turns left, 0 for a marker. */
  direction: number;
  radius: number;
  /** Distance back from the vertex to where the arc begins, along the incoming straight. */
  tangentLength: number;
  entryX: number;
  entryY: number;
  exitX: number;
  exitY: number;
  centreX: number;
  centreY: number;
}

export function buildTrack(definition: TrackDefinition): Track {
  const nodes = definition.nodes;
  if (nodes.length < 3) throw new Error(`track ${definition.id} needs at least three nodes`);

  const spacing = definition.sampleSpacing ?? DEFAULT_SAMPLE_SPACING;
  const corners = solveCorners(nodes);
  const { points, cornerDistances } = traceCentreline(corners, spacing);
  const samples = toSamples(points, nodes, corners, spacing);

  // Rotate so sample 0 IS the start line. Everything downstream then gets to assume
  // `distance === index * spacing`, which keeps the race coordinate honest and makes looking a car
  // up by lap distance arithmetic rather than a search.
  const startIndex = nearestSampleTo(samples, nodes[definition.startNode % nodes.length]);
  const ordered = samples.slice(startIndex).concat(samples.slice(0, startIndex));
  for (let i = 0; i < ordered.length; i += 1) ordered[i].distance = i * spacing;
  const length = ordered.length * spacing;

  const left = ordered.map((s) => ({ x: s.x + s.nx * s.halfWidth, y: s.y + s.ny * s.halfWidth }));
  const right = ordered.map((s) => ({ x: s.x - s.nx * s.halfWidth, y: s.y - s.ny * s.halfWidth }));

  const walls: WallSegment[] = [];
  appendWall(walls, left, ordered, 'left');
  appendWall(walls, right, ordered, 'right');

  const startShift = startIndex * spacing;
  const resolved: ResolvedCorner[] = corners
    .filter((corner) => corner.turn > STRAIGHT_EPSILON)
    .map((corner) => ({
      nodeIndex: corner.index,
      radius: corner.radius,
      turn: corner.turn,
      direction: corner.direction,
      distance: wrap(cornerDistances[corner.index] - startShift, length),
    }));

  const first = ordered[0];
  return {
    definition,
    samples: ordered,
    length,
    spacing,
    left,
    right,
    walls,
    corners: resolved,
    bounds: boundsOf(walls),
    start: { x: first.x, y: first.y, heading: Math.atan2(first.ty, first.tx), distance: 0 },
  };
}

/**
 * Where a point sits in the track's own coordinates: how far round the lap, and how far off line.
 *
 * A linear scan over the samples. Four cars against eight hundred samples is a rounding error at
 * 60 Hz, and an exact answer that is obviously correct beats a clever one that is nearly correct
 * when the eliminator line will eventually be deciding who dies by it.
 */
export function trackPositionOf(track: Track, x: number, y: number): TrackPosition {
  const samples = track.samples;
  let best = 0;
  let bestDistanceSq = Infinity;
  for (let i = 0; i < samples.length; i += 1) {
    const dx = x - samples[i].x;
    const dy = y - samples[i].y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      best = i;
    }
  }

  // Refine onto whichever neighbouring segment the point actually falls against, so lap distance
  // moves smoothly rather than stepping by one sample spacing as the car drives.
  const here = samples[best];
  const ahead = samples[(best + 1) % samples.length];
  const behind = samples[(best - 1 + samples.length) % samples.length];
  const forward = projectOnto(here, ahead, x, y);
  const backward = projectOnto(behind, here, x, y);
  const use = forward.distanceSq <= backward.distanceSq ? forward : backward;

  const offset = (x - here.x) * here.nx + (y - here.y) * here.ny;
  return {
    distance: wrap(use.distance, track.length),
    offset,
    sampleIndex: best,
    onTrack: Math.abs(offset) <= here.halfWidth,
  };
}

/** Signed shortest way round the lap from `from` to `to`. Positive means `to` is ahead. */
export function lapDelta(track: Track, from: number, to: number): number {
  const half = track.length / 2;
  let delta = to - from;
  while (delta > half) delta -= track.length;
  while (delta < -half) delta += track.length;
  return delta;
}

/** A pose on the centreline at a lap distance - start grids, respawns, eliminator markers. */
export function poseAt(track: Track, distance: number): { x: number; y: number; heading: number } {
  const index = Math.floor(wrap(distance, track.length) / track.spacing) % track.samples.length;
  const sample = track.samples[index];
  return { x: sample.x, y: sample.y, heading: Math.atan2(sample.ty, sample.tx) };
}

export function buildWallGrid(track: Track): SegmentGrid {
  return new SegmentGrid(track.walls);
}

// --- geometry --------------------------------------------------------------------------------

/**
 * Fit a circular fillet into every vertex, then shrink any pair that would collide.
 *
 * Two corners sharing a short straight is the one way this representation can be authored into
 * nonsense, so it is handled here rather than left to show up as a bent wall later.
 */
function solveCorners(nodes: readonly TrackNode[]): CornerGeometry[] {
  const count = nodes.length;
  const corners: CornerGeometry[] = nodes.map((node, index) => {
    const previous = nodes[(index - 1 + count) % count];
    const next = nodes[(index + 1) % count];
    const incoming = unit(node.x - previous.x, node.y - previous.y);
    const outgoing = unit(next.x - node.x, next.y - node.y);
    const cross = incoming.x * outgoing.y - incoming.y * outgoing.x;
    const dot = incoming.x * outgoing.x + incoming.y * outgoing.y;
    const turn = Math.atan2(Math.abs(cross), dot);

    const base: CornerGeometry = {
      node,
      index,
      turn,
      direction: cross === 0 ? 0 : Math.sign(cross),
      radius: node.radius,
      tangentLength: turn <= STRAIGHT_EPSILON ? 0 : node.radius * Math.tan(turn / 2),
      entryX: node.x,
      entryY: node.y,
      exitX: node.x,
      exitY: node.y,
      centreX: node.x,
      centreY: node.y,
    };
    return base;
  });

  // Shrink whichever corners are too greedy for the straight between them. Both give ground in
  // proportion to what they asked for, so one enormous sweeper cannot starve a small corner.
  for (let i = 0; i < count; i += 1) {
    const a = corners[i];
    const b = corners[(i + 1) % count];
    const span = Math.hypot(b.node.x - a.node.x, b.node.y - a.node.y);
    const wanted = a.tangentLength + b.tangentLength;
    const allowed = span * MAX_STRAIGHT_SHARE * 2;
    if (wanted <= allowed || wanted === 0) continue;
    const scale = allowed / wanted;
    a.tangentLength *= scale;
    b.tangentLength *= scale;
  }

  for (const corner of corners) {
    if (corner.turn <= STRAIGHT_EPSILON) continue;
    corner.radius = corner.tangentLength / Math.tan(corner.turn / 2);

    const previous = nodes[(corner.index - 1 + count) % count];
    const next = nodes[(corner.index + 1) % count];
    const incoming = unit(corner.node.x - previous.x, corner.node.y - previous.y);
    const outgoing = unit(next.x - corner.node.x, next.y - corner.node.y);

    corner.entryX = corner.node.x - incoming.x * corner.tangentLength;
    corner.entryY = corner.node.y - incoming.y * corner.tangentLength;
    corner.exitX = corner.node.x + outgoing.x * corner.tangentLength;
    corner.exitY = corner.node.y + outgoing.y * corner.tangentLength;

    // The centre sits one radius off the entry tangent, on the side the road turns towards.
    corner.centreX = corner.entryX - incoming.y * corner.direction * corner.radius;
    corner.centreY = corner.entryY + incoming.x * corner.direction * corner.radius;
  }

  return corners;
}

/** Walk the solved corners, emitting a dense polyline and noting where each corner sits. */
function traceCentreline(
  corners: readonly CornerGeometry[],
  spacing: number,
): { points: DensePoint[]; cornerDistances: number[] } {
  const points: DensePoint[] = [];
  const cornerDistances: number[] = new Array<number>(corners.length).fill(0);
  // Half a sample spacing keeps the dense polyline finer than the eventual resampling, so arc
  // length is not systematically short-changed by chording.
  const step = spacing / 2;
  let travelled = 0;

  for (let i = 0; i < corners.length; i += 1) {
    const corner = corners[i];
    const next = corners[(i + 1) % corners.length];

    if (corner.turn > STRAIGHT_EPSILON) {
      const sweep = corner.turn;
      const startAngle = Math.atan2(corner.entryY - corner.centreY, corner.entryX - corner.centreX);
      const arcLength = corner.radius * sweep;
      const steps = Math.max(2, Math.ceil(arcLength / step));
      for (let s = 0; s < steps; s += 1) {
        const angle = startAngle + corner.direction * sweep * (s / steps);
        points.push({
          x: corner.centreX + Math.cos(angle) * corner.radius,
          y: corner.centreY + Math.sin(angle) * corner.radius,
        });
      }
      cornerDistances[corner.index] = travelled + arcLength / 2;
      travelled += arcLength;
    } else {
      points.push({ x: corner.node.x, y: corner.node.y });
      cornerDistances[corner.index] = travelled;
    }

    const straightLength = Math.hypot(next.entryY - corner.exitY, next.entryX - corner.exitX);
    const steps = Math.max(1, Math.ceil(straightLength / step));
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      points.push({
        x: corner.exitX + (next.entryX - corner.exitX) * t,
        y: corner.exitY + (next.entryY - corner.exitY) * t,
      });
    }
    travelled += straightLength;
  }

  return { points, cornerDistances };
}

/**
 * Resample the dense polyline at a constant arc length and give every sample its tangent, normal
 * and road width.
 *
 * The step is nudged so a whole number of them closes the loop exactly. Without that, the seam
 * between the last sample and the first is a different length from every other gap, and lap
 * distance quietly stops meaning the same thing everywhere on the track.
 */
function toSamples(
  points: readonly DensePoint[],
  nodes: readonly TrackNode[],
  corners: readonly CornerGeometry[],
  targetSpacing: number,
): CentrelineSample[] {
  const closed = [...points, points[0]];
  let perimeter = 0;
  for (let i = 0; i < closed.length - 1; i += 1) {
    perimeter += Math.hypot(closed[i + 1].x - closed[i].x, closed[i + 1].y - closed[i].y);
  }
  const steps = Math.max(3, Math.round(perimeter / targetSpacing));
  const spacing = perimeter / steps;

  const out: CentrelineSample[] = [];
  let carried = 0;
  for (let i = 0; i < closed.length - 1 && out.length < steps; i += 1) {
    const a = closed[i];
    const b = closed[i + 1];
    const spanLength = Math.hypot(b.x - a.x, b.y - a.y);
    if (spanLength <= 1e-9) continue;
    let along = carried;
    while (along < spanLength && out.length < steps) {
      const t = along / spanLength;
      out.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        tx: 0,
        ty: 0,
        nx: 0,
        ny: 0,
        halfWidth: 0,
        distance: out.length * spacing,
      });
      along += spacing;
    }
    carried = along - spanLength;
  }

  // Central differences, so the tangent at a sample is not biased towards the next one. A biased
  // tangent tilts the wall offsets and shows up as a visible lean through long corners.
  const count = out.length;
  for (let i = 0; i < count; i += 1) {
    const previous = out[(i - 1 + count) % count];
    const next = out[(i + 1) % count];
    const tangent = unit(next.x - previous.x, next.y - previous.y);
    out[i].tx = tangent.x;
    out[i].ty = tangent.y;
    // Left of travel in screen axes, where y points down: the tangent turned a quarter turn.
    out[i].nx = tangent.y;
    out[i].ny = -tangent.x;
  }

  applyWidths(out, nodes, corners);
  return out;
}

/**
 * Widths are authored at vertices and have to become a width at every sample. Each vertex claims
 * the sample nearest to it and the road eases between neighbours with a smoothstep, so a pinch
 * arrives as a squeeze rather than as a step in the wall.
 */
function applyWidths(
  samples: CentrelineSample[],
  nodes: readonly TrackNode[],
  corners: readonly CornerGeometry[],
): void {
  const count = samples.length;
  const anchors = corners.map((corner) => ({
    index: nearestSampleTo(samples, { x: corner.node.x, y: corner.node.y }),
    halfWidth: corner.node.halfWidth,
  }));
  anchors.sort((a, b) => a.index - b.index);

  if (anchors.length === 0) {
    for (const sample of samples) sample.halfWidth = nodes[0].halfWidth;
    return;
  }

  for (let a = 0; a < anchors.length; a += 1) {
    const from = anchors[a];
    const to = anchors[(a + 1) % anchors.length];
    const span = (to.index - from.index + count) % count || count;
    for (let s = 0; s < span; s += 1) {
      const t = s / span;
      const ease = t * t * (3 - 2 * t);
      samples[(from.index + s) % count].halfWidth =
        from.halfWidth + (to.halfWidth - from.halfWidth) * ease;
    }
  }
}

function appendWall(
  out: WallSegment[],
  points: readonly { x: number; y: number }[],
  samples: readonly CentrelineSample[],
  side: 'left' | 'right',
): void {
  const count = points.length;
  for (let i = 0; i < count; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % count];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length <= 1e-9) continue;

    // Perpendicular, then pointed back at the road. Deriving the sign from the centreline rather
    // than from the winding order means a track authored the other way round still works.
    let nx = -dy / length;
    let ny = dx / length;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const sample = samples[i];
    if ((sample.x - midX) * nx + (sample.y - midY) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }

    out.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, nx, ny, length, side, index: out.length });
  }
}

// --- small helpers ---------------------------------------------------------------------------

function projectOnto(
  a: CentrelineSample,
  b: CentrelineSample,
  x: number,
  y: number,
): { distance: number; distanceSq: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq > 0 ? clamp01(((x - a.x) * dx + (y - a.y) * dy) / lengthSq) : 0;
  const px = a.x + dx * t;
  const py = a.y + dy * t;
  return {
    distance: a.distance + Math.hypot(dx, dy) * t,
    distanceSq: (x - px) * (x - px) + (y - py) * (y - py),
  };
}

function nearestSampleTo(
  samples: readonly { x: number; y: number }[],
  point: { x: number; y: number },
): number {
  let best = 0;
  let bestDistanceSq = Infinity;
  for (let i = 0; i < samples.length; i += 1) {
    const dx = point.x - samples[i].x;
    const dy = point.y - samples[i].y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      best = i;
    }
  }
  return best;
}

function boundsOf(walls: readonly WallSegment[]): TrackBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const wall of walls) {
    minX = Math.min(minX, wall.ax, wall.bx);
    minY = Math.min(minY, wall.ay, wall.by);
    maxX = Math.max(maxX, wall.ax, wall.bx);
    maxY = Math.max(maxY, wall.ay, wall.by);
  }
  return { minX, minY, maxX, maxY };
}

function unit(x: number, y: number): { x: number; y: number } {
  const magnitude = Math.hypot(x, y);
  return magnitude > 1e-9 ? { x: x / magnitude, y: y / magnitude } : { x: 1, y: 0 };
}

function wrap(value: number, length: number): number {
  const wrapped = value % length;
  return wrapped < 0 ? wrapped + length : wrapped;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
