/**
 * The whole circuit, small, in a corner.
 *
 * Not a HUD element for the finished game - SHUNT's whole point is that everybody is already in one
 * frame - but for a lab it earns its place twice over: it is how you learn a track's shape while
 * driving it, and it is the fastest way to see that the derived geometry is actually the loop you
 * authored.
 *
 * Drawn on its own canvas rather than in Phaser so it is not dragged around by the game camera's
 * zoom, and so it sits with the readout and the tuning panel as one piece of DOM furniture.
 */

import { CSS } from '../theme';
import type { Track } from '../track/trackTypes';

const SIZE = 200;
const MARGIN = 10;

export class Minimap {
  readonly root: HTMLElement;

  private readonly base: HTMLCanvasElement;
  private readonly live: HTMLCanvasElement;
  private readonly track: Track;
  private readonly scale: number;
  private readonly offsetX: number;
  private readonly offsetY: number;

  constructor(track: Track) {
    this.track = track;
    const { minX, minY, maxX, maxY } = track.bounds;
    const span = Math.max(maxX - minX, maxY - minY) || 1;
    this.scale = (SIZE - MARGIN * 2) / span;
    this.offsetX =
      MARGIN + (SIZE - MARGIN * 2 - (maxX - minX) * this.scale) / 2 - minX * this.scale;
    this.offsetY =
      MARGIN + (SIZE - MARGIN * 2 - (maxY - minY) * this.scale) / 2 - minY * this.scale;

    this.root = document.createElement('div');
    this.root.className = 'shunt-minimap';

    this.base = this.makeCanvas();
    this.live = this.makeCanvas();
    this.root.append(this.base, this.live);

    const label = document.createElement('span');
    label.className = 'shunt-minimap__label';
    label.textContent = track.definition.name;
    this.root.appendChild(label);

    this.paintTrack();
  }

  destroy(): void {
    this.root.remove();
  }

  toggle(): void {
    this.root.classList.toggle('is-hidden');
  }

  /** Called every rendered frame. Only the car and its heading are redrawn. */
  render(x: number, y: number, heading: number, colour: string): void {
    const context = this.live.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, SIZE, SIZE);

    const px = this.offsetX + x * this.scale;
    const py = this.offsetY + y * this.scale;

    context.save();
    context.translate(px, py);
    context.rotate(heading);
    context.fillStyle = colour;
    context.beginPath();
    context.moveTo(6, 0);
    context.lineTo(-4, 3.6);
    context.lineTo(-4, -3.6);
    context.closePath();
    context.fill();
    context.restore();
  }

  private makeCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const ratio = window.devicePixelRatio || 1;
    canvas.width = SIZE * ratio;
    canvas.height = SIZE * ratio;
    canvas.style.width = `${SIZE}px`;
    canvas.style.height = `${SIZE}px`;
    canvas.getContext('2d')?.scale(ratio, ratio);
    return canvas;
  }

  private paintTrack(): void {
    const context = this.base.getContext('2d');
    if (!context) return;

    const trace = (points: readonly { x: number; y: number }[]): void => {
      context.beginPath();
      for (let i = 0; i < points.length; i += 1) {
        const px = this.offsetX + points[i].x * this.scale;
        const py = this.offsetY + points[i].y * this.scale;
        if (i === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
    };

    // Road first as a thick stroke down the centreline, then the two walls on top of it. Cheaper
    // than filling a ring and, at this size, indistinguishable.
    context.strokeStyle = CSS.line;
    context.lineWidth = Math.max(3, this.track.samples[0].halfWidth * 2 * this.scale);
    context.lineJoin = 'round';
    trace(this.track.samples);
    context.stroke();

    context.lineWidth = 1;
    context.strokeStyle = CSS.hazardDim;
    trace(this.track.left);
    context.stroke();
    trace(this.track.right);
    context.stroke();

    // Start line.
    const start = this.track.samples[0];
    context.strokeStyle = CSS.text;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(
      this.offsetX + (start.x + start.nx * start.halfWidth) * this.scale,
      this.offsetY + (start.y + start.ny * start.halfWidth) * this.scale,
    );
    context.lineTo(
      this.offsetX + (start.x - start.nx * start.halfWidth) * this.scale,
      this.offsetY + (start.y - start.ny * start.halfWidth) * this.scale,
    );
    context.stroke();
  }
}
