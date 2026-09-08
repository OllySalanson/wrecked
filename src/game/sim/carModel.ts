/**
 * The car handling model.
 *
 * Deliberately hand-written rather than handed to Phaser's Arcade Physics (whose bodies are always
 * axis-aligned and cannot rotate) or to Matter.js (a general rigid-body solver models a car as a
 * sliding brick). The feel of this game IS this file, so every constant needs to be a dial we own.
 *
 * The model is the classic top-down arcade one: split velocity into the direction the car is
 * pointing and the direction it is not, accelerate along the first, and fight the second with grip.
 * Drifting is what happens when the car rotates faster than grip can drag its velocity around.
 *
 * There is no Phaser import here on purpose. This module is pure, deterministic and unit-testable,
 * which is what keeps input recording, replay and headless tuning available later.
 */

import type { HandlingConstants } from './handling';

/** Below this, forward speed is treated as stopped, so braking can hand over to reverse. */
const STOPPED_EPSILON = 0.5;

export interface CarState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Radians. 0 points along +x. */
  heading: number;
  angularVelocity: number;
  boostTicksLeft: number;
  boostCooldownTicks: number;
}

export interface CarInput {
  /** 0..1 */
  throttle: number;
  /** 0..1 */
  brake: number;
  /** -1..1, negative is left. */
  steer: number;
  /** Edge-triggered request. The model decides whether it is allowed. */
  boost: boolean;
}

export interface CarTelemetry {
  speed: number;
  /** Along the direction the car is pointing. Negative when reversing. */
  forwardSpeed: number;
  /** Sideways. This is the drift. */
  lateralSpeed: number;
  slipping: boolean;
  boosting: boolean;
  boostReady: boolean;
}

export function createCarState(x = 0, y = 0, heading = -Math.PI / 2): CarState {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    heading,
    angularVelocity: 0,
    boostTicksLeft: 0,
    boostCooldownTicks: 0,
  };
}

export function createCarInput(): CarInput {
  return { throttle: 0, brake: 0, steer: 0, boost: false };
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * How much of the peak turn rate is available at this speed.
 *
 * Two effects, both of which a driver feels immediately: the car cannot turn while it is barely
 * moving, and steering goes vague near top speed so that flat out feels committing.
 */
export function steeringScale(speed: number, c: HandlingConstants): number {
  const cutIn = c.steerFullSpeed > 0 ? clamp(speed / c.steerFullSpeed, 0, 1) : 1;
  const falloffRange = Math.max(1, c.maxSpeed - c.steerFalloffStart);
  const overSpeed = clamp((speed - c.steerFalloffStart) / falloffRange, 0, 1);
  return cutIn * (1 - c.steerFalloffAmount * overSpeed);
}

/** Exponential decay that is correct for any timestep, so dials mean the same at any frame rate. */
function decay(rate: number, dt: number): number {
  return Math.exp(-rate * dt);
}

function normaliseAngle(angle: number): number {
  const wrapped = (angle + Math.PI) % (Math.PI * 2);
  return (wrapped < 0 ? wrapped + Math.PI * 2 : wrapped) - Math.PI;
}

/**
 * Advance one car by one fixed simulation step. Mutates `state` and returns what the driver can
 * feel, which is what the debug overlay reads.
 */
export function stepCar(
  state: CarState,
  input: CarInput,
  c: HandlingConstants,
  dt: number,
): CarTelemetry {
  // --- boost -------------------------------------------------------------------------------
  const boostReady = state.boostTicksLeft <= 0 && state.boostCooldownTicks <= 0;
  if (input.boost && boostReady) {
    state.boostTicksLeft = Math.max(1, Math.round(c.boostDurationMs / 1000 / dt));
    state.boostCooldownTicks =
      state.boostTicksLeft + Math.max(0, Math.round(c.boostCooldownMs / 1000 / dt));
  }
  const boosting = state.boostTicksLeft > 0;
  if (state.boostTicksLeft > 0) state.boostTicksLeft -= 1;
  if (state.boostCooldownTicks > 0) state.boostCooldownTicks -= 1;

  // --- rotation, before anything touches the velocity ---------------------------------------
  // Order matters more than it looks. The car must turn FIRST and the velocity be split up
  // afterwards, because the sideways component is created precisely by the nose moving while the
  // velocity does not. Splitting first and recomposing onto the new heading would rigidly drag
  // the velocity round with the car, and it would never slide at all.
  const speed = Math.hypot(state.vx, state.vy);
  const headingBefore = state.heading;
  const forwardBefore = state.vx * Math.cos(headingBefore) + state.vy * Math.sin(headingBefore);

  const steer = clamp(input.steer, -1, 1);
  if (steer !== 0) {
    // Steering reverses when reversing, the way a real car does.
    const direction = forwardBefore >= 0 ? 1 : -1;
    const target = steer * c.steerRate * steeringScale(speed, c) * direction;
    state.angularVelocity += (target - state.angularVelocity) * (1 - decay(c.steerResponse, dt));
  } else {
    state.angularVelocity *= decay(c.angularDamping, dt);
  }
  state.heading = normaliseAngle(state.heading + state.angularVelocity * dt);

  // --- split the velocity across the new heading --------------------------------------------
  const cos = Math.cos(state.heading);
  const sin = Math.sin(state.heading);
  let forwardSpeed = state.vx * cos + state.vy * sin;
  let lateralSpeed = -state.vx * sin + state.vy * cos;

  // --- along the car -------------------------------------------------------------------------
  const throttle = clamp(input.throttle, 0, 1);
  const brake = clamp(input.brake, 0, 1);

  if (throttle > 0) forwardSpeed += c.engineForce * throttle * dt;
  if (boosting) forwardSpeed += c.boostForce * dt;

  if (brake > 0) {
    if (forwardSpeed > STOPPED_EPSILON) {
      // Braking never drags the car backwards in the same step it stops.
      forwardSpeed = Math.max(0, forwardSpeed - c.brakeForce * brake * dt);
    } else {
      forwardSpeed -= c.reverseForce * brake * dt;
    }
  }

  let dragRate = c.forwardDrag;
  if (throttle === 0 && brake === 0) dragRate += c.rollingResistance;
  forwardSpeed *= decay(dragRate, dt);

  const forwardCap = c.maxSpeed + (boosting ? c.boostSpeedBonus : 0);
  forwardSpeed = clamp(forwardSpeed, -c.maxReverseSpeed, forwardCap);

  // --- across the car ------------------------------------------------------------------------
  // Grip drags the sideways component back into line. Once there is more sideways speed than the
  // tyres can hold, grip collapses and the slide keeps going. That is the whole drift model.
  const slipping = Math.abs(lateralSpeed) > c.slipThreshold;
  const grip = slipping ? c.lateralGrip * c.slideGrip : c.lateralGrip;
  lateralSpeed *= decay(grip, dt);

  // --- recompose and integrate ---------------------------------------------------------------
  state.vx = cos * forwardSpeed - sin * lateralSpeed;
  state.vy = sin * forwardSpeed + cos * lateralSpeed;
  state.x += state.vx * dt;
  state.y += state.vy * dt;

  return {
    speed: Math.hypot(state.vx, state.vy),
    forwardSpeed,
    lateralSpeed,
    slipping,
    boosting,
    boostReady: state.boostTicksLeft <= 0 && state.boostCooldownTicks <= 0,
  };
}
