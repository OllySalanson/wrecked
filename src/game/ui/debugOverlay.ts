/**
 * The readout.
 *
 * Its job is to make invisible things visible while tuning: how much of the car's speed is going
 * sideways, whether the tyres have let go, and — because the faithful boost combo is famously
 * obscure — exactly where in the combo your fingers currently are.
 */

import { UNITS_PER_METRE } from '../sim/handling';
import type { CarTelemetry } from '../sim/carModel';
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
      ['speed', `${t.speed.toFixed(0)} u/s   ${metresPerSecond.toFixed(1)} m/s   ${(metresPerSecond * 3.6).toFixed(0)} km/h`],
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
