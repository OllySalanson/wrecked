import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from './fixedStep';

describe('FixedStepLoop', () => {
  it('runs one step per 16.67ms at 60 Hz', () => {
    const loop = new FixedStepLoop({ stepHz: 60 });
    let steps = 0;
    for (let i = 0; i < 60; i += 1) steps += loop.advance(1000 / 60, () => undefined);
    expect(steps).toBe(60);
  });

  it('runs the same number of steps regardless of frame pacing', () => {
    const slow = new FixedStepLoop({ stepHz: 60 });
    const fast = new FixedStepLoop({ stepHz: 60 });
    let slowSteps = 0;
    let fastSteps = 0;
    for (let i = 0; i < 30; i += 1) slowSteps += slow.advance(1000 / 30, () => undefined);
    for (let i = 0; i < 120; i += 1) fastSteps += fast.advance(1000 / 120, () => undefined);
    expect(slowSteps).toBe(60);
    expect(fastSteps).toBe(60);
  });

  it('clamps a long stall instead of bursting catch-up steps', () => {
    const loop = new FixedStepLoop({ stepHz: 60, maxFrameMs: 250 });
    const steps = loop.advance(10_000, () => undefined);
    expect(steps).toBe(15);
  });

  it('exposes an interpolation alpha between 0 and 1', () => {
    const loop = new FixedStepLoop({ stepHz: 60 });
    loop.advance(1000 / 60 / 2, () => undefined);
    expect(loop.alpha).toBeGreaterThan(0);
    expect(loop.alpha).toBeLessThan(1);
  });

  it('passes a constant dt to the simulation', () => {
    const loop = new FixedStepLoop({ stepHz: 50 });
    const seen: number[] = [];
    loop.advance(100, (dt) => seen.push(dt));
    expect(seen).toEqual([0.02, 0.02, 0.02, 0.02, 0.02]);
  });

  it('counts ticks so replays can be lined up later', () => {
    const loop = new FixedStepLoop({ stepHz: 60 });
    loop.advance(1000, () => undefined);
    expect(loop.ticksElapsed).toBe(15);
    loop.reset();
    expect(loop.ticksElapsed).toBe(0);
  });
});
