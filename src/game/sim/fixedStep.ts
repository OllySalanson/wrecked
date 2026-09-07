/**
 * Fixed-timestep accumulator.
 *
 * The simulation runs at a constant rate no matter what the display is doing. This is cheap to do
 * now and painful to retrofit: it is what keeps deterministic replay, input recording and headless
 * tuning available, and it means a handling constant means the same thing on a 60 Hz laptop and a
 * 144 Hz monitor.
 */

export const DEFAULT_STEP_HZ = 60;

/** Longest real time we will ever try to catch up on in one frame, in milliseconds. */
const MAX_FRAME_MS = 250;

export interface FixedStepLoopOptions {
  stepHz?: number;
  maxFrameMs?: number;
}

export class FixedStepLoop {
  /** Seconds per simulation step. Pass this to the model as `dt`. */
  readonly stepSeconds: number;

  private readonly stepMs: number;
  private readonly maxFrameMs: number;
  private accumulatorMs = 0;
  private tick = 0;

  constructor({ stepHz = DEFAULT_STEP_HZ, maxFrameMs = MAX_FRAME_MS }: FixedStepLoopOptions = {}) {
    this.stepMs = 1000 / stepHz;
    this.stepSeconds = 1 / stepHz;
    this.maxFrameMs = maxFrameMs;
  }

  /** How far between the last two simulation steps the display currently is, 0..1. */
  get alpha(): number {
    return this.accumulatorMs / this.stepMs;
  }

  get ticksElapsed(): number {
    return this.tick;
  }

  /**
   * Feed real elapsed time and run however many whole simulation steps it bought.
   * Returns the number of steps run, which the debug overlay shows so stalls are visible.
   */
  advance(frameMs: number, step: (dt: number, tick: number) => void): number {
    // A long stall (tab in the background, a breakpoint) must not turn into a burst of catch-up
    // steps that makes the car teleport.
    this.accumulatorMs += Math.min(Math.max(frameMs, 0), this.maxFrameMs);

    let steps = 0;
    while (this.accumulatorMs >= this.stepMs) {
      this.accumulatorMs -= this.stepMs;
      this.tick += 1;
      step(this.stepSeconds, this.tick);
      steps += 1;
    }
    return steps;
  }

  reset(): void {
    this.accumulatorMs = 0;
    this.tick = 0;
  }
}
