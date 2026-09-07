import { describe, expect, it } from 'vitest';
import { BOOST_COMBO_DEFAULTS, BoostComboDetector } from './boostCombo';

const STEP_MS = 1000 / 60;

/** Runs the detector for a span of time with fixed button states; returns true if boost fired. */
function hold(
  detector: BoostComboDetector,
  ms: number,
  throttle: boolean,
  brake: boolean,
): boolean {
  let fired = false;
  for (let elapsed = 0; elapsed < ms; elapsed += STEP_MS) {
    if (detector.update(throttle, brake, STEP_MS)) fired = true;
  }
  return fired;
}

describe('BoostComboDetector', () => {
  it('fires on brake tap then two accelerate taps', () => {
    const detector = new BoostComboDetector();
    expect(hold(detector, 100, false, true)).toBe(false); // brake tap
    expect(hold(detector, 50, false, false)).toBe(false); // release
    expect(hold(detector, 50, true, false)).toBe(false); // tap 1
    expect(hold(detector, 50, false, false)).toBe(false);
    expect(hold(detector, 50, true, false)).toBe(true); // tap 2 completes it
  });

  it('does not fire when the brake is held rather than tapped', () => {
    const detector = new BoostComboDetector();
    hold(detector, BOOST_COMBO_DEFAULTS.brakeTapMaxMs + 200, false, true);
    hold(detector, 50, false, false);
    hold(detector, 50, true, false);
    hold(detector, 50, false, false);
    expect(hold(detector, 50, true, false)).toBe(false);
  });

  it('does not fire on a single accelerate tap', () => {
    const detector = new BoostComboDetector();
    hold(detector, 100, false, true);
    hold(detector, 50, false, false);
    expect(hold(detector, 100, true, false)).toBe(false);
  });

  it('expires if the accelerate taps arrive too late', () => {
    const detector = new BoostComboDetector();
    hold(detector, 100, false, true);
    hold(detector, BOOST_COMBO_DEFAULTS.comboWindowMs + 120, false, false);
    hold(detector, 40, true, false);
    hold(detector, 40, false, false);
    expect(hold(detector, 40, true, false)).toBe(false);
  });

  it('ignores a throttle already held when the combo arms', () => {
    const detector = new BoostComboDetector();
    // Throttle down the whole time, as it would be mid-race.
    hold(detector, 100, true, true);
    hold(detector, 40, true, false);
    // Only one genuine release-and-press follows, so this must not be enough.
    hold(detector, 40, false, false);
    expect(hold(detector, 40, true, false)).toBe(false);
  });

  it('reports its progress so the readout can show it', () => {
    const detector = new BoostComboDetector();
    expect(detector.state.phase).toBe('idle');
    hold(detector, 60, false, true);
    expect(detector.state.phase).toBe('braking');
    hold(detector, 40, false, false);
    expect(detector.state.phase).toBe('armed');
    hold(detector, 40, true, false);
    expect(detector.state.throttleTaps).toBe(1);
  });

  it('restarts cleanly when a new brake tap arrives mid-combo', () => {
    const detector = new BoostComboDetector();
    hold(detector, 80, false, true);
    hold(detector, 40, false, false);
    hold(detector, 40, true, false);
    hold(detector, 40, false, true); // new brake press restarts
    expect(detector.state.phase).toBe('braking');
    expect(detector.state.throttleTaps).toBe(0);
  });
});
