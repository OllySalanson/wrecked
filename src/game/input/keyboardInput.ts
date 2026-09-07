/**
 * Keyboard input for the feel lab.
 *
 * One car for now. Two cars on one keyboard is the captain's chosen starting point for the game
 * itself, but that belongs to the local-multiplayer work item, not to the handling spike — a spike
 * with two cars in it is a spike you cannot concentrate on.
 *
 * Both the arrow cluster and WASD drive the same car so either hand position works.
 */

import type { CarInput } from '../sim/carModel';

export interface RawDriverButtons {
  throttleDown: boolean;
  brakeDown: boolean;
  left: boolean;
  right: boolean;
  boostButtonDown: boolean;
}

const THROTTLE_KEYS = ['ArrowUp', 'KeyW'];
const BRAKE_KEYS = ['ArrowDown', 'KeyS'];
const LEFT_KEYS = ['ArrowLeft', 'KeyA'];
const RIGHT_KEYS = ['ArrowRight', 'KeyD'];
/** Only used when the faithful boost combo is switched off. */
const BOOST_KEYS = ['ShiftLeft', 'ShiftRight'];

export class KeyboardDriver {
  private readonly held = new Set<string>();
  private readonly target: Window;

  constructor(target: Window = window) {
    this.target = target;
    this.target.addEventListener('keydown', this.onKeyDown);
    this.target.addEventListener('keyup', this.onKeyUp);
    this.target.addEventListener('blur', this.onBlur);
  }

  destroy(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.held.clear();
  }

  read(): RawDriverButtons {
    return {
      throttleDown: this.anyHeld(THROTTLE_KEYS),
      brakeDown: this.anyHeld(BRAKE_KEYS),
      left: this.anyHeld(LEFT_KEYS),
      right: this.anyHeld(RIGHT_KEYS),
      boostButtonDown: this.anyHeld(BOOST_KEYS),
    };
  }

  private anyHeld(codes: readonly string[]): boolean {
    return codes.some((code) => this.held.has(code));
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (isTypingTarget(event.target)) return;
    this.held.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };

  /** Losing focus mid-corner must not leave the throttle stuck on. */
  private readonly onBlur = (): void => {
    this.held.clear();
  };
}

export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function toCarInput(buttons: RawDriverButtons, boostRequested: boolean): CarInput {
  return {
    throttle: buttons.throttleDown ? 1 : 0,
    brake: buttons.brakeDown ? 1 : 0,
    steer: (buttons.right ? 1 : 0) - (buttons.left ? 1 : 0),
    boost: boostRequested,
  };
}
