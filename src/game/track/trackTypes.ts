/**
 * What a SHUNT track *is*.
 *
 * The representation is a **closed centreline of straights and circular arcs, with a width all the
 * way round**. A track is authored as a handful of corner vertices, each carrying the radius it is
 * rounded by and the road half-width there; everything else is derived - the centreline, the two
 * walls, the drivable surface, the start line and the bounds.
 *
 * Why this and not a polygon soup, a tilemap or a bitmap mask:
 *
 * 1. **It gives us a race coordinate for free.** Every point on the track maps to a distance along
 *    the centreline. That single number is what the shared camera needs to know who the backmarker
 *    is, what the eliminator line has to chase, and what a lap counter counts. A polygon soup can
 *    tell you where a wall is; it cannot tell you who is winning.
 * 2. **The picture and the collision are already separate**, which the design report calls the most
 *    important asset-pipeline decision and free if made now. The walls here are line segments the
 *    simulation owns; the drawing is a separate layer built from the same data, so a corner can be
 *    retuned without repainting anything.
 * 3. **A corner really is one number.** Tightening a corner is editing its radius; widening a pinch
 *    is editing its half-width. Tracks, like handling, get tuned by driving, so the authored form
 *    has to be something you can move in one place and re-drive in a second.
 * 4. **The geometry cannot go wrong quietly.** Straights are exactly straight and arcs are exactly
 *    circular, so a corner's radius is a number you can compare against the car's turning circle
 *    rather than a property you measure off a spline afterwards and hope about. A free-form spline
 *    through the same points looks equally plausible and hides a 60-unit apex inside a 100-unit
 *    road, which is a wall lying across the track.
 * 5. **Walls come out consistently wound.** Each wall segment knows which side is drivable, so the
 *    collision response always has a normal to push along even in the pathological cases.
 *
 * What it gives up, honestly: curvature steps at the tangent points, where a real circuit would use
 * a clothoid. A human driver steers through those without noticing - nothing in the car reacts to
 * the centreline - but a racing line for filler bots will eventually want smoothing there.
 *
 * The cost is honest: this representation cannot express a fork, a crossover or an open arena. When
 * SHUNT wants those, a track will need to be a *graph* of these strips rather than one loop. That is
 * a real extension rather than a rewrite, because everything downstream consumes samples and walls.
 */

export interface TrackNode {
  /** Corner vertex: where the two straights either side of this corner would meet. */
  x: number;
  y: number;
  /**
   * Radius the corner is rounded by, world units. This IS the corner: a small number is a hairpin,
   * a large one is a sweeper, and the car's minimum turning circle says which is which. It must
   * exceed `halfWidth`, or the inner wall would have to curve back through itself.
   *
   * Shrunk automatically if the two corners either side of a short straight would otherwise
   * overlap; `buildTrack` reports the radius it actually used.
   */
  radius: number;
  /** Half the road width here, in world units. The car is 30 wide, so 130 is roughly 8 cars. */
  halfWidth: number;
}

export interface TrackDefinition {
  id: string;
  name: string;
  /** One line for the loading screen and for arguing about the layout in a PR. */
  blurb: string;
  /** Control points, in driving order. The loop is always closed from the last back to the first. */
  nodes: readonly TrackNode[];
  /**
   * Which vertex the start/finish line sits on. A vertex whose neighbours are collinear rounds to
   * nothing, so a marker can be dropped anywhere along a straight purely to place the line.
   */
  startNode: number;
  /** Distance between derived centreline samples, world units. Smaller is smoother and slower. */
  sampleSpacing?: number;
}

/** What a corner became once the geometry was solved. Surfaced so authoring mistakes are visible. */
export interface ResolvedCorner {
  nodeIndex: number;
  /** Radius actually used. Below the authored one when a short straight forced the corner in. */
  radius: number;
  /** Turn angle in radians. Zero for a marker vertex on a straight. */
  turn: number;
  /** Signed: negative turns left of travel, positive turns right. */
  direction: number;
  /** Arc length from the start line to the middle of this corner. */
  distance: number;
}

/** One point on the derived centreline. `distance` is the race coordinate. */
export interface CentrelineSample {
  x: number;
  y: number;
  /** Unit tangent, pointing the way the track is driven. */
  tx: number;
  ty: number;
  /** Unit left-hand normal, i.e. the tangent rotated a quarter turn anticlockwise in maths axes. */
  nx: number;
  ny: number;
  halfWidth: number;
  /** Arc length from the start line, world units. */
  distance: number;
}

export type WallSide = 'left' | 'right';

/**
 * A wall is a line segment plus the direction the road is. Storing the inward normal rather than
 * recomputing it means the collision response always has a sane push-out direction, including when
 * a car has somehow ended up on the wrong side of the barrier.
 */
export interface WallSegment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Unit normal pointing at the drivable surface. */
  nx: number;
  ny: number;
  length: number;
  side: WallSide;
  /** Stable index, so broadphase results can be ordered and collisions stay deterministic. */
  index: number;
}

export interface TrackBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface StartPose {
  x: number;
  y: number;
  /** Radians, matching CarState.heading: 0 points along +x. */
  heading: number;
  distance: number;
}

export interface Track {
  definition: TrackDefinition;
  /** Uniformly spaced along arc length, closed: the last sample is adjacent to the first. */
  samples: readonly CentrelineSample[];
  /** Total centreline length - one lap, in world units. */
  length: number;
  /** Arc length between adjacent samples, so `samples[i].distance === i * spacing`. */
  spacing: number;
  /** Left-hand wall points, one per sample. Rendering uses these; collision uses `walls`. */
  left: readonly { x: number; y: number }[];
  right: readonly { x: number; y: number }[];
  walls: readonly WallSegment[];
  corners: readonly ResolvedCorner[];
  bounds: TrackBounds;
  start: StartPose;
}

/** Where a car is, in the track's own terms. This is the coordinate the whole game will race on. */
export interface TrackPosition {
  /** Arc length along the centreline from the start line, 0..track.length. */
  distance: number;
  /** Signed offset from the centreline. Positive is to the left of the driving direction. */
  offset: number;
  /** Index of the nearest centreline sample. */
  sampleIndex: number;
  /** True when the point is between the two walls. */
  onTrack: boolean;
}
