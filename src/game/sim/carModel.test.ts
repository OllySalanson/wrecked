import { describe, expect, it } from 'vitest';
import { createCarInput, createCarState, steeringScale, stepCar } from './carModel';
import { DEFAULT_HANDLING, type HandlingConstants } from './handling';

const DT = 1 / 60;

function drive(
  ticks: number,
  input: Partial<ReturnType<typeof createCarInput>>,
  overrides: Partial<HandlingConstants> = {},
) {
  const constants: HandlingConstants = { ...DEFAULT_HANDLING, ...overrides };
  const state = createCarState(0, 0, 0);
  let telemetry = stepCar(state, { ...createCarInput(), ...input }, constants, DT);
  for (let i = 1; i < ticks; i += 1) {
    telemetry = stepCar(state, { ...createCarInput(), ...input }, constants, DT);
  }
  return { state, telemetry, constants };
}

describe('stepCar', () => {
  it('accelerates along the direction the car points', () => {
    const { state, telemetry } = drive(60, { throttle: 1 });
    expect(telemetry.forwardSpeed).toBeGreaterThan(200);
    expect(state.x).toBeGreaterThan(0);
    expect(Math.abs(state.y)).toBeLessThan(0.001);
  });

  it('never exceeds the top speed', () => {
    const { telemetry, constants } = drive(600, { throttle: 1 });
    expect(telemetry.forwardSpeed).toBeLessThanOrEqual(constants.maxSpeed + 1e-6);
  });

  it('coasts down when you come off the pedals', () => {
    const constants = { ...DEFAULT_HANDLING };
    const state = createCarState(0, 0, 0);
    for (let i = 0; i < 120; i += 1) {
      stepCar(state, { ...createCarInput(), throttle: 1 }, constants, DT);
    }
    const cruising = Math.hypot(state.vx, state.vy);
    for (let i = 0; i < 60; i += 1) stepCar(state, createCarInput(), constants, DT);
    expect(Math.hypot(state.vx, state.vy)).toBeLessThan(cruising);
  });

  it('brakes to a stop and then reverses', () => {
    const constants = { ...DEFAULT_HANDLING };
    const state = createCarState(0, 0, 0);
    for (let i = 0; i < 120; i += 1) {
      stepCar(state, { ...createCarInput(), throttle: 1 }, constants, DT);
    }
    let telemetry = stepCar(state, { ...createCarInput(), brake: 1 }, constants, DT);
    for (let i = 0; i < 240; i += 1) {
      telemetry = stepCar(state, { ...createCarInput(), brake: 1 }, constants, DT);
    }
    expect(telemetry.forwardSpeed).toBeLessThan(0);
    expect(telemetry.forwardSpeed).toBeGreaterThanOrEqual(-constants.maxReverseSpeed);
  });

  it('cannot turn while stationary', () => {
    const { state } = drive(30, { steer: 1 });
    expect(Math.abs(state.heading)).toBeLessThan(0.001);
  });

  it('turns once it is moving', () => {
    const constants = { ...DEFAULT_HANDLING };
    const state = createCarState(0, 0, 0);
    for (let i = 0; i < 60; i += 1) {
      stepCar(state, { ...createCarInput(), throttle: 1 }, constants, DT);
    }
    for (let i = 0; i < 30; i += 1) {
      stepCar(state, { ...createCarInput(), throttle: 1, steer: 1 }, constants, DT);
    }
    expect(state.heading).toBeGreaterThan(0.2);
  });

  // Regression: the first version of the model split velocity across the OLD heading and
  // recomposed onto the new one, which rigidly dragged the velocity round with the nose. The car
  // turned perfectly and could not slide at all. Driving it is what caught this, so these two
  // tests pin the behaviour down.
  it('turning at speed throws some of the velocity sideways', () => {
    const constants = { ...DEFAULT_HANDLING };
    const state = createCarState(0, 0, 0);
    for (let i = 0; i < 120; i += 1) {
      stepCar(state, { ...createCarInput(), throttle: 1 }, constants, DT);
    }
    let telemetry = stepCar(state, { ...createCarInput(), throttle: 1, steer: 1 }, constants, DT);
    for (let i = 0; i < 40; i += 1) {
      telemetry = stepCar(state, { ...createCarInput(), throttle: 1, steer: 1 }, constants, DT);
    }
    expect(Math.abs(telemetry.lateralSpeed)).toBeGreaterThan(20);
  });

  it('breaks traction when thrown into a hard turn at speed', () => {
    const constants: HandlingConstants = { ...DEFAULT_HANDLING, lateralGrip: 4, slipThreshold: 90 };
    const state = createCarState(0, 0, 0);
    for (let i = 0; i < 150; i += 1) {
      stepCar(state, { ...createCarInput(), throttle: 1 }, constants, DT);
    }
    let slid = false;
    for (let i = 0; i < 60; i += 1) {
      const telemetry = stepCar(
        state,
        { ...createCarInput(), throttle: 1, steer: 1 },
        constants,
        DT,
      );
      if (telemetry.slipping) slid = true;
    }
    expect(slid).toBe(true);
  });

  it('pulls sideways velocity back into line when gripping', () => {
    const constants: HandlingConstants = { ...DEFAULT_HANDLING, slipThreshold: 10_000 };
    const state = createCarState(0, 0, 0);
    state.vy = 100; // entirely sideways for a car pointing along +x
    const telemetry = stepCar(state, createCarInput(), constants, DT);
    expect(Math.abs(telemetry.lateralSpeed)).toBeLessThan(100);
    expect(telemetry.slipping).toBe(false);
  });

  it('reports a slide once sideways speed passes the break-away point', () => {
    const constants: HandlingConstants = { ...DEFAULT_HANDLING, slipThreshold: 50 };
    const state = createCarState(0, 0, 0);
    state.vy = 200;
    const telemetry = stepCar(state, createCarInput(), constants, DT);
    expect(telemetry.slipping).toBe(true);
  });

  it('keeps more sideways speed while sliding than while gripping', () => {
    const base: HandlingConstants = { ...DEFAULT_HANDLING, slipThreshold: 50 };
    const gripping = createCarState(0, 0, 0);
    gripping.vy = 200;
    const grippingResult = stepCar(
      gripping,
      createCarInput(),
      { ...base, slipThreshold: 10_000 },
      DT,
    );

    const sliding = createCarState(0, 0, 0);
    sliding.vy = 200;
    const slidingResult = stepCar(sliding, createCarInput(), base, DT);

    expect(Math.abs(slidingResult.lateralSpeed)).toBeGreaterThan(
      Math.abs(grippingResult.lateralSpeed),
    );
  });

  it('honours the boost cooldown', () => {
    const constants: HandlingConstants = {
      ...DEFAULT_HANDLING,
      boostDurationMs: 100,
      boostCooldownMs: 1000,
    };
    const state = createCarState(0, 0, 0);
    const boostInput = { ...createCarInput(), throttle: 1, boost: true };

    const first = stepCar(state, boostInput, constants, DT);
    expect(first.boosting).toBe(true);

    // Ask again immediately: still inside the boost, so it must not restart.
    for (let i = 0; i < 12; i += 1) stepCar(state, boostInput, constants, DT);
    const duringCooldown = stepCar(state, boostInput, constants, DT);
    expect(duringCooldown.boosting).toBe(false);
    expect(duringCooldown.boostReady).toBe(false);
  });

  it('is deterministic for identical inputs', () => {
    const runOnce = () => {
      const constants = { ...DEFAULT_HANDLING };
      const state = createCarState(0, 0, 0);
      for (let i = 0; i < 300; i += 1) {
        const input = { ...createCarInput(), throttle: 1, steer: i % 90 < 45 ? 1 : -1 };
        stepCar(state, input, constants, DT);
      }
      return state;
    };
    expect(runOnce()).toEqual(runOnce());
  });
});

describe('steeringScale', () => {
  it('is zero when stopped and full at the cut-in speed', () => {
    expect(steeringScale(0, DEFAULT_HANDLING)).toBe(0);
    expect(steeringScale(DEFAULT_HANDLING.steerFullSpeed, DEFAULT_HANDLING)).toBeCloseTo(1, 5);
  });

  it('washes out towards top speed', () => {
    const atFalloff = steeringScale(DEFAULT_HANDLING.steerFalloffStart, DEFAULT_HANDLING);
    const flatOut = steeringScale(DEFAULT_HANDLING.maxSpeed, DEFAULT_HANDLING);
    expect(flatOut).toBeLessThan(atFalloff);
    expect(flatOut).toBeCloseTo(1 - DEFAULT_HANDLING.steerFalloffAmount, 5);
  });
});
