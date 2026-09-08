/**
 * Uniform-grid broadphase over wall segments.
 *
 * A track is around two thousand segments and every car asks "what might I be touching?" sixty
 * times a second. Testing all of them would work today and stop working at four cars on a longer
 * track, and the fix is cheap enough to just do now.
 *
 * Results come back in ascending segment index, always. Collision response is order-dependent - two
 * walls meeting at a corner do not commute - so a stable order is what keeps the simulation
 * deterministic, which is the property the whole fixed-timestep design exists to protect.
 */

import type { WallSegment } from './trackTypes';

const DEFAULT_CELL_SIZE = 160;

export class SegmentGrid {
  readonly cellSize: number;

  private readonly cells = new Map<number, number[]>();
  private readonly minCellX: number;
  private readonly minCellY: number;
  private readonly maxCellX: number;
  private readonly maxCellY: number;
  private readonly stride: number;

  constructor(segments: readonly WallSegment[], cellSize = DEFAULT_CELL_SIZE) {
    this.cellSize = cellSize;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const s of segments) {
      minX = Math.min(minX, s.ax, s.bx);
      minY = Math.min(minY, s.ay, s.by);
      maxX = Math.max(maxX, s.ax, s.bx);
      maxY = Math.max(maxY, s.ay, s.by);
    }
    if (!Number.isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = 0;
      maxY = 0;
    }

    this.minCellX = Math.floor(minX / cellSize);
    this.minCellY = Math.floor(minY / cellSize);
    this.maxCellX = Math.floor(maxX / cellSize);
    this.maxCellY = Math.floor(maxY / cellSize);
    this.stride = this.maxCellX - this.minCellX + 1;

    for (const s of segments) {
      const x0 = Math.floor(Math.min(s.ax, s.bx) / cellSize);
      const x1 = Math.floor(Math.max(s.ax, s.bx) / cellSize);
      const y0 = Math.floor(Math.min(s.ay, s.by) / cellSize);
      const y1 = Math.floor(Math.max(s.ay, s.by) / cellSize);
      // Segments are short relative to a cell, so bucketing by bounding box rather than walking the
      // line costs at most a few extra cells and keeps this readable.
      for (let cy = y0; cy <= y1; cy += 1) {
        for (let cx = x0; cx <= x1; cx += 1) {
          const key = this.key(cx, cy);
          const bucket = this.cells.get(key);
          if (bucket) bucket.push(s.index);
          else this.cells.set(key, [s.index]);
        }
      }
    }

    // Insertion already walks segments in index order per cell, but be explicit: the guarantee is
    // load-bearing for determinism and should not depend on how the loop above happens to run.
    for (const bucket of this.cells.values()) bucket.sort((a, b) => a - b);
  }

  /** Segment indices whose cells overlap this box, ascending and without duplicates. */
  query(minX: number, minY: number, maxX: number, maxY: number, out: number[] = []): number[] {
    out.length = 0;
    // Clamping to the built extent keeps the flattened cell key collision-free, which is what lets
    // it be a number rather than a string.
    const x0 = Math.max(this.minCellX, Math.floor(minX / this.cellSize));
    const x1 = Math.min(this.maxCellX, Math.floor(maxX / this.cellSize));
    const y0 = Math.max(this.minCellY, Math.floor(minY / this.cellSize));
    const y1 = Math.min(this.maxCellY, Math.floor(maxY / this.cellSize));

    for (let cy = y0; cy <= y1; cy += 1) {
      for (let cx = x0; cx <= x1; cx += 1) {
        const bucket = this.cells.get(this.key(cx, cy));
        if (!bucket) continue;
        for (const index of bucket) out.push(index);
      }
    }

    out.sort((a, b) => a - b);
    let write = 0;
    for (let read = 0; read < out.length; read += 1) {
      if (read === 0 || out[read] !== out[read - 1]) {
        out[write] = out[read];
        write += 1;
      }
    }
    out.length = write;
    return out;
  }

  private key(cx: number, cy: number): number {
    // A single number key is far cheaper than a string one, and the grid is queried every tick.
    return (cy - this.minCellY) * this.stride + (cx - this.minCellX);
  }
}
