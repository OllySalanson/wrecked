/**
 * The handling model's tuning surface.
 *
 * Every number a driver can feel lives here and nowhere else. The simulation reads this object
 * every tick, so the tuning panel can mutate it in place and the change is felt on the next frame
 * with no rebuild. That is the whole point of the feel lab: the car is not designed on paper, it is
 * discovered by driving it and moving these dials.
 *
 * Units: world units and seconds. `UNITS_PER_METRE` fixes the scale so the numbers can be read as
 * real-world speeds when comparing against a memory of the original.
 */

export const UNITS_PER_METRE = 16;

/** Car body size in world units. 30 x 56 is roughly 1.9 m x 3.5 m - a stubby arcade car. */
export const CAR_WIDTH = 30;
export const CAR_LENGTH = 56;

/**
 * The wall block.
 *
 * Kept as its own interface because it is consumed by the collision resolver rather than by the car
 * model, but folded into `HandlingConstants` below on purpose: hitting a wall is handling. There is
 * one object, one panel and one "copy as code" block, and no way to tune the car and the walls out
 * of step with each other.
 */
export interface WallConstants {
  /** How much of a square-on impact comes back at you. 0 sticks, 1 is a snooker ball. */
  wallRestitution: number;
  /**
   * Friction along the face of a wall, as a fraction of how hard the car is pressing into it.
   *
   * Coulomb's rule, and it is doing more work here than it looks. Because the cost scales with the
   * impact rather than being a flat charge per contact, one dial gives a graze that is nearly free,
   * a proper hit that scrubs off half your speed, and a lean on a barrier that costs exactly as
   * much as you are leaning. A flat per-contact charge cannot do all three.
   */
  wallFriction: number;
  /**
   * Extra speed taken off a real crash, on top of the friction, scaled by the square of how square
   * the hit was. Nothing below the scrape threshold pays it. This is the "is a wall a nuisance or a
   * disaster" dial, and it moves independently of how draggy a wall is to scrape along.
   */
  wallBite: number;
  /** How hard an off-centre hit spins the car. This is what turns a clipped nose into a tank-slap. */
  wallSpin: number;
  /** How strongly a scrape pulls the nose parallel to the wall, per second. Makes sliding possible. */
  wallAlign: number;
  /** Below this closing speed a contact stops bouncing and just rests, so a parked car sits still. */
  wallSettleSpeed: number;
}

export interface HandlingConstants extends WallConstants {
  /** Forward acceleration under full throttle, world units per second squared. */
  engineForce: number;
  /** Deceleration under full brake while moving forwards. */
  brakeForce: number;
  /** Acceleration backwards once the car has stopped and brake is still held. */
  reverseForce: number;
  /** Hard cap on forward speed. Raise for a faster game, lower for a twitchier one. */
  maxSpeed: number;
  /** Hard cap on reverse speed. */
  maxReverseSpeed: number;
  /** Always-on speed decay, per second. Governs how far the car coasts. */
  forwardDrag: number;
  /** Extra decay applied only when neither throttle nor brake is held. */
  rollingResistance: number;

  /** Peak turn rate in radians per second, before speed scaling. */
  steerRate: number;
  /** How fast the car reaches its target turn rate. Higher is twitchier turn-in. */
  steerResponse: number;
  /** Below this speed steering fades out, so the car cannot pirouette while stopped. */
  steerFullSpeed: number;
  /** Above this speed steering starts to wash out. */
  steerFalloffStart: number;
  /** Fraction of turn rate lost at max speed. 0 = no washout, 1 = no steering at all up there. */
  steerFalloffAmount: number;
  /** How fast rotation settles once the wheel is released. */
  angularDamping: number;

  /** How hard the tyres resist sliding sideways, per second. This is the grip dial. */
  lateralGrip: number;
  /** Sideways speed at which the tyres break away and the car starts to slide. */
  slipThreshold: number;
  /** Grip multiplier once sliding. Lower means longer, looser drifts. */
  slideGrip: number;

  /** Extra forward acceleration while boosting. */
  boostForce: number;
  /** How far boost lifts the speed cap while it is active. */
  boostSpeedBonus: number;
  /** How long a boost lasts, milliseconds. The original's was about a second. */
  boostDurationMs: number;
  /** Lockout after a boost ends, milliseconds. */
  boostCooldownMs: number;
}

/**
 * The car's collision shape: a capsule down its spine, `CAR_WIDTH / 2` thick.
 *
 * A rotated rectangle would be more literal, and the difference only shows where a wall ends or two
 * walls meet - precisely the places where a rectangle solver has to pick between competing axes and
 * a car parked in a corner buzzes between two answers. The capsule has one closest point, always,
 * so the normal is never ambiguous and the response is never jittery. The visible cost is rounded
 * corners: clip a wall with the very tip of a front wing and the car glances off where a rectangle
 * would have caught. For an arcade racer that reads as forgiving rather than as wrong.
 */
export const CAR_COLLISION_RADIUS = CAR_WIDTH / 2;
export const CAR_SPINE_HALF_LENGTH = (CAR_LENGTH - CAR_WIDTH) / 2;

/**
 * Starting values. These are a considered first guess, not a finished car - see README "The numbers
 * and why" for the reasoning behind each block. Expect to move them.
 */
export const DEFAULT_HANDLING: HandlingConstants = {
  engineForce: 1150,
  brakeForce: 2000,
  reverseForce: 420,
  maxSpeed: 620,
  maxReverseSpeed: 200,
  forwardDrag: 0.35,
  rollingResistance: 0.55,

  steerRate: 3.4,
  steerResponse: 14,
  steerFullSpeed: 110,
  steerFalloffStart: 420,
  steerFalloffAmount: 0.35,
  angularDamping: 6,

  lateralGrip: 14,
  slipThreshold: 90,
  slideGrip: 0.5,

  boostForce: 2400,
  boostSpeedBonus: 140,
  boostDurationMs: 900,
  boostCooldownMs: 2500,

  wallRestitution: 0.3,
  wallFriction: 0.35,
  wallBite: 0.35,
  wallSpin: 0.8,
  wallAlign: 4,
  wallSettleSpeed: 45,
};

export type TuningGroup = 'Power' | 'Steering' | 'Grip' | 'Walls' | 'Boost';

export interface TuningField {
  key: keyof HandlingConstants;
  label: string;
  group: TuningGroup;
  min: number;
  max: number;
  step: number;
  /** One line, plain language: what moving this slider actually changes about the driving. */
  help: string;
}

/** Drives the tuning panel. Order here is the order on screen. */
export const TUNING_FIELDS: readonly TuningField[] = [
  {
    key: 'engineForce',
    label: 'Engine',
    group: 'Power',
    min: 200,
    max: 3000,
    step: 10,
    help: 'How hard it pulls away. Higher feels instant, lower feels heavy.',
  },
  {
    key: 'maxSpeed',
    label: 'Top speed',
    group: 'Power',
    min: 200,
    max: 1200,
    step: 10,
    help: 'Hard ceiling on forward speed.',
  },
  {
    key: 'brakeForce',
    label: 'Brakes',
    group: 'Power',
    min: 200,
    max: 5000,
    step: 25,
    help: 'How fast the brake scrubs speed off.',
  },
  {
    key: 'reverseForce',
    label: 'Reverse push',
    group: 'Power',
    min: 50,
    max: 1500,
    step: 10,
    help: 'How quickly it backs up once stopped with brake held.',
  },
  {
    key: 'maxReverseSpeed',
    label: 'Reverse top speed',
    group: 'Power',
    min: 40,
    max: 600,
    step: 10,
    help: 'Ceiling on reversing.',
  },
  {
    key: 'forwardDrag',
    label: 'Drag',
    group: 'Power',
    min: 0,
    max: 3,
    step: 0.01,
    help: 'Always-on speed bleed. Higher makes the car feel like it is wading.',
  },
  {
    key: 'rollingResistance',
    label: 'Coast-down',
    group: 'Power',
    min: 0,
    max: 4,
    step: 0.01,
    help: 'Extra bleed when you are off both pedals. Higher means it stops itself.',
  },

  {
    key: 'steerRate',
    label: 'Turn rate',
    group: 'Steering',
    min: 0.5,
    max: 8,
    step: 0.05,
    help: 'How sharply it can turn at all. The single biggest steering dial.',
  },
  {
    key: 'steerResponse',
    label: 'Turn-in speed',
    group: 'Steering',
    min: 1,
    max: 40,
    step: 0.5,
    help: 'How quickly it starts turning after you press. High is twitchy, low is floaty.',
  },
  {
    key: 'angularDamping',
    label: 'Straighten-up',
    group: 'Steering',
    min: 0.5,
    max: 25,
    step: 0.1,
    help: 'How fast rotation settles when you let go of the wheel.',
  },
  {
    key: 'steerFullSpeed',
    label: 'Steering cut-in',
    group: 'Steering',
    min: 10,
    max: 400,
    step: 5,
    help: 'Below this speed steering fades out, so it cannot spin on the spot.',
  },
  {
    key: 'steerFalloffStart',
    label: 'Washout starts at',
    group: 'Steering',
    min: 100,
    max: 1200,
    step: 10,
    help: 'Speed at which steering starts going vague.',
  },
  {
    key: 'steerFalloffAmount',
    label: 'Washout amount',
    group: 'Steering',
    min: 0,
    max: 0.9,
    step: 0.01,
    help: 'How much turn rate is lost flat out. Makes top speed feel committing.',
  },

  {
    key: 'lateralGrip',
    label: 'Grip',
    group: 'Grip',
    min: 0.5,
    max: 30,
    step: 0.1,
    help: 'How hard the tyres refuse to slide sideways. The drift dial.',
  },
  {
    key: 'slipThreshold',
    label: 'Break-away point',
    group: 'Grip',
    min: 10,
    max: 500,
    step: 5,
    help: 'How much sideways speed it takes before the back steps out.',
  },
  {
    key: 'slideGrip',
    label: 'Grip while sliding',
    group: 'Grip',
    min: 0.02,
    max: 1,
    step: 0.01,
    help: 'Grip left once sliding. Low means long, holdable drifts.',
  },

  {
    key: 'wallRestitution',
    label: 'Bounce',
    group: 'Walls',
    min: 0,
    max: 1,
    step: 0.01,
    help: 'How much a square hit throws you back. 0 sticks to the wall, 1 is a snooker ball.',
  },
  {
    key: 'wallFriction',
    label: 'Wall drag',
    group: 'Walls',
    min: 0,
    max: 1.5,
    step: 0.01,
    help: 'How much a wall grabs as you slide along it, in proportion to how hard you are pressing.',
  },
  {
    key: 'wallBite',
    label: 'Crash penalty',
    group: 'Walls',
    min: 0,
    max: 1,
    step: 0.01,
    help: 'Extra speed a proper hit costs on top of the drag. Grazes never pay it.',
  },
  {
    key: 'wallSpin',
    label: 'Spin from a hit',
    group: 'Walls',
    min: 0,
    max: 3,
    step: 0.01,
    help: 'How much clipping a wall with a corner of the car whips the back round.',
  },
  {
    key: 'wallAlign',
    label: 'Wall guidance',
    group: 'Walls',
    min: 0,
    max: 14,
    step: 0.1,
    help: 'How hard a scrape straightens you along the wall. High is helpful, too high is on rails.',
  },
  {
    key: 'wallSettleSpeed',
    label: 'Settle below',
    group: 'Walls',
    min: 0,
    max: 200,
    step: 5,
    help: 'Nudges slower than this stop bouncing, so resting against a wall is quiet.',
  },

  {
    key: 'boostForce',
    label: 'Boost shove',
    group: 'Boost',
    min: 200,
    max: 6000,
    step: 50,
    help: 'How hard the boost pushes.',
  },
  {
    key: 'boostSpeedBonus',
    label: 'Boost extra speed',
    group: 'Boost',
    min: 0,
    max: 500,
    step: 10,
    help: 'How far boost lifts the speed ceiling while it is running.',
  },
  {
    key: 'boostDurationMs',
    label: 'Boost length (ms)',
    group: 'Boost',
    min: 100,
    max: 4000,
    step: 50,
    help: 'How long it lasts. The original was about one second.',
  },
  {
    key: 'boostCooldownMs',
    label: 'Boost cooldown (ms)',
    group: 'Boost',
    min: 0,
    max: 10000,
    step: 100,
    help: 'Lockout before you can boost again.',
  },
];

export function cloneHandling(source: HandlingConstants): HandlingConstants {
  return { ...source };
}
