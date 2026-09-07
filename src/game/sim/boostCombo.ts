/**
 * The original's boost input, recreated faithfully: tap the brake, then double-tap accelerate.
 *
 * The captain chose "warts and all" on this, knowing it was the most criticised control in the 2012
 * game. So the combo is the default and a plain button is the alternative, not the other way round.
 * Flip `FAITHFUL_BOOST_DEFAULT` (or press F in the lab) to compare them back to back.
 *
 * The detector exposes its state because a combo nobody can see is a combo nobody can learn — the
 * debug overlay draws it live so you can watch the input land.
 */

export interface BoostComboConfig {
  /** Longest a brake press can last and still count as a tap rather than a hold. */
  brakeTapMaxMs: number;
  /** How long after the brake tap the two throttle taps have to arrive. */
  comboWindowMs: number;
}

export const BOOST_COMBO_DEFAULTS: BoostComboConfig = {
  brakeTapMaxMs: 260,
  comboWindowMs: 520,
};

/** True = the original brake-tap-then-double-tap-accelerate combo. False = a dedicated button. */
export const FAITHFUL_BOOST_DEFAULT = true;

export type BoostComboPhase = 'idle' | 'braking' | 'armed';

export class BoostComboDetector {
  private phase: BoostComboPhase = 'idle';
  private timerMs = 0;
  private throttleTaps = 0;
  private lastThrottleDown = false;
  private lastBrakeDown = false;
  private readonly config: BoostComboConfig;

  constructor(config: BoostComboConfig = BOOST_COMBO_DEFAULTS) {
    this.config = config;
  }

  get state(): { phase: BoostComboPhase; throttleTaps: number; msLeft: number } {
    const window = this.phase === 'braking' ? this.config.brakeTapMaxMs : this.config.comboWindowMs;
    return {
      phase: this.phase,
      throttleTaps: this.throttleTaps,
      msLeft: this.phase === 'idle' ? 0 : Math.max(0, window - this.timerMs),
    };
  }

  reset(): void {
    this.phase = 'idle';
    this.timerMs = 0;
    this.throttleTaps = 0;
  }

  /**
   * Feed raw button states once per simulation step. Returns true on the step the combo completes.
   */
  update(throttleDown: boolean, brakeDown: boolean, dtMs: number): boolean {
    const brakePressed = brakeDown && !this.lastBrakeDown;
    const brakeReleased = !brakeDown && this.lastBrakeDown;
    // Rising edges only, so a throttle already held when the combo arms does not count as a tap.
    const throttlePressed = throttleDown && !this.lastThrottleDown;
    this.lastBrakeDown = brakeDown;
    this.lastThrottleDown = throttleDown;

    this.timerMs += dtMs;
    let fired = false;

    switch (this.phase) {
      case 'idle':
        if (brakePressed) {
          this.phase = 'braking';
          this.timerMs = 0;
        }
        break;

      case 'braking':
        if (brakeReleased) {
          // A tap arms the combo; a hold is just braking, so it does not.
          this.phase = this.timerMs <= this.config.brakeTapMaxMs ? 'armed' : 'idle';
          this.timerMs = 0;
          this.throttleTaps = 0;
        } else if (this.timerMs > this.config.brakeTapMaxMs && !brakeDown) {
          this.phase = 'idle';
        }
        break;

      case 'armed':
        if (throttlePressed) {
          this.throttleTaps += 1;
          if (this.throttleTaps >= 2) {
            fired = true;
            this.reset();
            break;
          }
        }
        if (this.timerMs > this.config.comboWindowMs) this.reset();
        // Starting a new brake tap restarts the sequence rather than wasting the input.
        if (brakePressed) {
          this.phase = 'braking';
          this.timerMs = 0;
          this.throttleTaps = 0;
        }
        break;
    }

    return fired;
  }
}
