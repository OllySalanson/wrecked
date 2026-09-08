/**
 * The base every SHUNT screen is built on.
 *
 * It does three jobs, and they are the three that would otherwise be done slightly differently on
 * every screen: it lays the asphalt, it fits the composition to the window, and it routes the
 * keyboard. Screens subclass it and implement `compose()` in a fixed 1280x720 design box.
 *
 * Composing at a fixed size and scaling to fit - rather than reflowing - is a deliberate call. Two
 * people leaning over one keyboard need the screen to look the same shape every time they see it;
 * a layout that rearranges itself at a breakpoint is a layout they have to read again.
 */

import Phaser from 'phaser';
import { INK, MOTION, SIZE, SPACE, STAGE } from '../ui/kit/design';
import { Backdrop, label, rule } from '../ui/kit/chrome';
import { createWordmark } from '../ui/kit/wordmark';

/** Edges of the design box, in the stage's centre-relative coordinates. */
export const EDGE = {
  left: -STAGE.width / 2,
  right: STAGE.width / 2,
  top: -STAGE.height / 2,
  bottom: STAGE.height / 2,
} as const;

/** Keeps content clear of the hazard rails at the very top and bottom of the screen. */
export const MARGIN = 64;

/** Anything that confirms. Both players share a keyboard, so both ends of it work. */
const CONFIRM_KEYS = ['Enter', 'NumpadEnter', 'Space'];
const BACK_KEYS = ['Escape', 'Backspace'];

/** Scale cap, so the composition does not become a billboard on a very large display. */
const MAX_STAGE_SCALE = 1.7;

export abstract class IdentityScene extends Phaser.Scene {
  /** Everything a screen draws goes in here. Its origin is the centre of the design box. */
  protected stage!: Phaser.GameObjects.Container;
  protected backdrop!: Backdrop;

  create(): void {
    this.backdrop = new Backdrop(this, this.accent());
    this.stage = this.add.container(0, 0);
    this.fit();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.fit);
    this.input.keyboard?.on('keydown', this.handleKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fit);
    });

    this.compose();
  }

  /**
   * `rawDelta`, not the `delta` Phaser hands to `update()` - the same rule the simulation follows,
   * and for the same reason: Phaser substitutes an older smoothed value once a frame overruns its
   * `fps.min` window, and anything measuring real elapsed time off it quietly runs slow. Here that
   * would stretch the between-rounds hold past its budget without anything looking wrong.
   */
  update(): void {
    this.backdrop.update(this.game.loop.rawDelta);
  }

  /** Build the screen. Called once, with `this.stage` ready. */
  protected abstract compose(): void;

  /** The colour the backdrop's hazard rails are struck in. Winner screens override it. */
  protected accent(): number {
    return INK.hazard;
  }

  /** Answered by screens that have something to do. */
  protected onConfirm(): void {}
  protected onBack(): void {}
  protected onOtherKey(event: KeyboardEvent): void {
    void event;
  }

  /** Adds a display object to the stage at a position in design-box coordinates. */
  protected mount<
    T extends Phaser.GameObjects.GameObject & { setPosition(x: number, y: number): T },
  >(object: T, x: number, y: number): T {
    object.setPosition(x, y);
    this.stage.add(object);
    return object;
  }

  /**
   * The running head every screen but the title wears: the mark, a caption, and a rule under both.
   * Returns the y the content below it should start from.
   */
  protected header(caption: string, accent: number = INK.hazard): number {
    const mark = createWordmark(this, 132, {
      extrude: 4,
      colour: INK.text,
      extrudeColour: INK.rule,
    });
    this.mount(mark.root, EDGE.left + MARGIN + 66, EDGE.top + MARGIN);

    this.mount(
      label(this, caption, { size: SIZE.label, tone: 'dim', origin: 0 }),
      EDGE.left + MARGIN + 152,
      EDGE.top + MARGIN,
    );

    const width = STAGE.width - MARGIN * 2;
    this.mount(rule(this, width, accent), EDGE.left + MARGIN, EDGE.top + MARGIN + 28);
    return EDGE.top + MARGIN + 28 + SPACE.wide;
  }

  /** The standard bottom row of key prompts, laid out left to right from the left margin. */
  protected footer(...prompts: Phaser.GameObjects.Container[]): void {
    let x = EDGE.left + MARGIN;
    prompts.forEach((prompt, index) => {
      const width = prompt.getBounds().width;
      this.mount(prompt, x + width / 2, EDGE.bottom - MARGIN + 8);
      x += width + SPACE.wide;
      prompt.setAlpha(index === 0 ? 1 : 0.85);
    });
  }

  private readonly fit = (): void => {
    const { width, height } = this.scale;
    const scale = Math.min(width / STAGE.width, height / STAGE.height, MAX_STAGE_SCALE);
    this.stage.setPosition(width / 2, height / 2);
    this.stage.setScale(scale);
    this.backdrop.layout();
  };

  private readonly handleKey = (event: KeyboardEvent): void => {
    // Auto-repeat from a held key must never walk the session through two screens at once.
    if (event.repeat) return;
    if (CONFIRM_KEYS.includes(event.code)) {
      this.onConfirm();
      return;
    }
    if (BACK_KEYS.includes(event.code)) {
      this.onBack();
      return;
    }
    this.onOtherKey(event);
  };
}

/** Re-exported so screens do not each import the motion tokens separately. */
export { MOTION };
