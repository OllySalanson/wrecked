/**
 * The title screen: the name, and one way in.
 *
 * There is no menu here because there is nothing else to choose yet - no settings, no modes, no
 * profiles. A list of one item pretending to be a menu would be worse than a keypress.
 */

import { EDGE, IdentityScene, MARGIN } from './IdentityScene';
import { MOTION, SIZE } from '../ui/kit/design';
import { actionPrompt, enter, hazardBand, label } from '../ui/kit/chrome';
import { createWordmark } from '../ui/kit/wordmark';
import { drawCarBody } from '../ui/kit/carShape';
import { SCENE_KEYS } from '../session/navigation';
import { ACTIVE_SEATS } from '../session/controls';
import { readSession, transition } from '../session/store';
import { openLineup } from '../session/session';

const WORDMARK_WIDTH = 660;

export class TitleScene extends IdentityScene {
  constructor() {
    super(SCENE_KEYS.title);
  }

  protected compose(): void {
    const mark = createWordmark(this, WORDMARK_WIDTH);
    this.mount(mark.root, 0, -140);
    // The letters arrive one at a time, from above, fast. It is the only flourish on the screen.
    mark.letters.forEach((letter, index) => {
      enter(this, letter, { dy: -54, delay: index * MOTION.stagger, duration: MOTION.settle });
    });

    const band = hazardBand(this, { width: WORDMARK_WIDTH, height: 18, drift: 26 });
    this.mount(band, 0, -34);
    enter(this, band, { dy: 0, dx: -60, delay: MOTION.stagger * 5, duration: MOTION.settle });

    const tagline = this.mount(
      label(this, 'One screen · one frame · last car in it wins', {
        size: SIZE.subheading,
        tone: 'text',
      }),
      0,
      8,
    );
    enter(this, tagline, { delay: MOTION.stagger * 6 });

    this.drawGrid();

    const start = this.mount(
      actionPrompt(this, 'ENTER', 'Start a race', { pulse: true, size: SIZE.body }),
      0,
      244,
    );
    enter(this, start, { delay: MOTION.stagger * 8 });

    const session = readSession(this);
    this.mount(
      label(this, `${ACTIVE_SEATS.length} players · one keyboard · first to ${session.target}`, {
        size: SIZE.micro,
        tone: 'dimmer',
        origin: 0,
      }),
      EDGE.left + MARGIN,
      EDGE.bottom - MARGIN,
    );
    this.mount(
      label(this, 'F · handling lab', { size: SIZE.micro, tone: 'dimmer', origin: 1 }),
      EDGE.right - MARGIN,
      EDGE.bottom - MARGIN,
    );
  }

  /**
   * The two cars that are actually going to be on the track, in their own colours, sat on a
   * starting line. It says "top-down racer, two players" before a single word has been read.
   */
  private drawGrid(): void {
    const spacing = 208;
    const baseY = 112;
    const halfSpread = (spacing * ACTIVE_SEATS.length) / 2;

    // The line they are sitting on, in hazard tape, so they read as staged rather than floating.
    const startLine = hazardBand(this, {
      width: halfSpread * 2,
      height: 8,
      alpha: 0.5,
    });
    this.mount(startLine, 0, baseY + 58);

    ACTIVE_SEATS.forEach((seat, index) => {
      const x = (index - (ACTIVE_SEATS.length - 1) / 2) * spacing;

      // Speed streaks sit outside the car's own graphics: the car is rotated to point along the
      // track, and streaks rotated with it would trail off the top of the screen.
      const streaks = this.add.graphics();
      const trails = [
        { y: -17, length: 40, alpha: 0.22 },
        { y: 0, length: 58, alpha: 0.16 },
        { y: 17, length: 34, alpha: 0.11 },
      ];
      for (const trail of trails) {
        streaks.fillStyle(seat.colour, trail.alpha);
        streaks.fillRect(-58 - trail.length, trail.y, trail.length, 3);
      }

      const shape = this.add.graphics();
      drawCarBody(shape, { colour: seat.colour, scale: 1.7 });
      // Nose to the right: these are cars leaving a grid, not cars parked facing the reader.
      shape.setAngle(90);

      const car = this.add.container(0, 0, [streaks, shape]);
      this.mount(car, x, baseY);
      enter(this, car, { dx: -46, dy: 0, delay: MOTION.stagger * (7 + index) });

      this.mount(label(this, seat.tag, { size: SIZE.label, colour: seat.colour }), x, baseY + 84);
    });
  }

  protected onConfirm(): void {
    transition(this, openLineup(readSession(this)));
  }

  protected onOtherKey(event: KeyboardEvent): void {
    // The handling lab from the previous work item stays one key away; it is the tuning tool the
    // car is still being built with, not a menu item.
    if (event.code === 'KeyF') this.scene.start(SCENE_KEYS.feelLab);
  }
}
