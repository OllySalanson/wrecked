/**
 * The readout.
 *
 * Its job is to make invisible things visible while tuning: how much of the car's speed is going
 * sideways, whether the tyres have let go, and - because the faithful boost combo is famously
 * obscure - exactly where in the combo your fingers currently are.
 */

import { UNITS_PER_METRE } from '../sim/handling';
import type { CarTelemetry } from '../sim/carModel';
import type { WallImpact } from '../sim/wallCollision';
import type { BoostComboPhase } from '../sim/boostCombo';

export interface OverlayFrame {
  fps: number;
  stepsThisFrame: number;
  ticks: number;
  telemetry: CarTelemetry;
  heading: number;
  angularVelocity: number;
  x: number;
  y: number;
  faithfulBoost: boolean;
  combo: { phase: BoostComboPhase; throttleTaps: number; msLeft: number };
  track: TrackFrame;
}

export interface TrackFrame {
  name: string;
  /** 0..1 round the lap. */
  lapProgress: number;
  lapDistance: number;
  lapLength: number;
  laps: number;
  lastLapSeconds: number;
  bestLapSeconds: number;
  touching: boolean;
  /** Consecutive simulation steps spent in contact with a wall. */
  contactTicks: number;
  /** The last contact that actually cost something, kept on screen so a hit can be read after it. */
  lastHit: WallImpact | null;
}

export class DebugOverlay {
  readonly root: HTMLElement;
  private readonly pre: HTMLElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'shunt-readout';
    this.pre = document.createElement('pre');
    this.root.appendChild(this.pre);
  }

  destroy(): void {
    this.root.remove();
  }

  toggle(): void {
    this.root.classList.toggle('is-hidden');
  }

  render(frame: OverlayFrame): void {
    const { telemetry: t } = frame;
    const metresPerSecond = t.speed / UNITS_PER_METRE;
    const lateralShare = t.speed > 1 ? Math.abs(t.lateralSpeed) / t.speed : 0;

    const rows: [string, string][] = [
      ['fps', frame.fps.toFixed(0)],
      ['sim steps/frame', String(frame.stepsThisFrame)],
      ['tick', String(frame.ticks)],
      ['', ''],
      [
        'speed',
        `${t.speed.toFixed(0)} u/s   ${metresPerSecond.toFixed(1)} m/s   ${(metresPerSecond * 3.6).toFixed(0)} km/h`,
      ],
      ['forward', t.forwardSpeed.toFixed(0)],
      ['sideways', `${t.lateralSpeed.toFixed(0)}  (${(lateralShare * 100).toFixed(0)}% of speed)`],
      ['tyres', t.slipping ? 'SLIDING' : 'gripping'],
      ['', ''],
      ['heading', `${((frame.heading * 180) / Math.PI).toFixed(0)} deg`],
      ['spin', `${frame.angularVelocity.toFixed(2)} rad/s`],
      ['position', `${frame.x.toFixed(0)}, ${frame.y.toFixed(0)}`],
      ['', ''],
      ['boost', describeBoost(t)],
      ['boost input', frame.faithfulBoost ? 'faithful combo' : 'Shift (unfaithful)'],
      ['combo', describeCombo(frame)],
      ['', ''],
      ['track', frame.track.name],
      ['lap', describeLap(frame.track)],
      ['lap times', describeLapTimes(frame.track)],
      ['wall', describeContact(frame.track)],
      ['last hit', describeHit(frame.track.lastHit)],
    ];

    this.pre.textContent = rows
      .map(([label, value]) => (label === '' ? '' : `${label.padEnd(16)}${value}`))
      .join('\n');
  }
}

function describeBoost(t: CarTelemetry): string {
  if (t.boosting) return 'BOOSTING';
  return t.boostReady ? 'ready' : 'cooling down';
}

function describeLap(track: TrackFrame): string {
  const metres = track.lapLength / UNITS_PER_METRE;
  return `${(track.lapProgress * 100).toFixed(0)}%  of ${metres.toFixed(0)} m   (${track.laps} done)`;
}

function describeLapTimes(track: TrackFrame): string {
  const last = track.lastLapSeconds > 0 ? `${track.lastLapSeconds.toFixed(2)}s` : '--';
  const best = track.bestLapSeconds > 0 ? `${track.bestLapSeconds.toFixed(2)}s` : '--';
  return `last ${last}   best ${best}`;
}

function describeContact(track: TrackFrame): string {
  if (!track.touching) return 'clear';
  // Sixty steps a second, so this reads directly as how long you have been leaning on it.
  return `TOUCHING  ${(track.contactTicks / 60).toFixed(2)}s`;
}

/**
 * The one line that says whether a hit was a graze or a disaster. "Square" is the share of the
 * car's speed that was going straight into the wall, which is exactly what the response charges
 * for, so a surprising number here explains a surprising feel.
 */
function describeHit(hit: WallImpact | null): string {
  if (!hit) return '--';
  return `${(hit.severity * 100).toFixed(0)}% square   -${hit.speedLost.toFixed(0)} u/s   ${
    hit.scraping ? 'scrape' : 'CRASH'
  }`;
}

function describeCombo(frame: OverlayFrame): string {
  if (!frame.faithfulBoost) return '-';
  const { phase, throttleTaps, msLeft } = frame.combo;
  switch (phase) {
    case 'idle':
      return 'tap the brake to start';
    case 'braking':
      return `brake down - release within ${msLeft.toFixed(0)}ms`;
    case 'armed':
      return `armed - ${throttleTaps}/2 accelerate taps, ${msLeft.toFixed(0)}ms left`;
  }
}
