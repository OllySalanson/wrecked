/**
 * A round, as far as the presentation layer is concerned.
 *
 * The circuit exists and can be driven in the handling lab, but a round - two cars, the shared
 * camera, the eliminator, a winner - is its own work item and is not built yet. What this screen
 * owns, and hands over when that lands, is the furniture that sits over a race: the round number
 * and both drivers' scores, in the same vocabulary as every menu around it.
 *
 * The two keys that declare a winner are a stand-in and are labelled as one on screen. They exist
 * so the session can be walked end to end today; the round lifecycle work replaces them with the
 * last car left in the frame.
 */

import { EDGE, IdentityScene, MARGIN } from './IdentityScene';
import { INK, MOTION, SIZE, SPACE, STAGE } from '../ui/kit/design';
import { enter, keycap, label, slab } from '../ui/kit/chrome';
import { RaceHud } from '../ui/kit/raceHud';
import { drawCarBody } from '../ui/kit/carShape';
import { SCENE_KEYS } from '../session/navigation';
import { ACTIVE_SEATS } from '../session/controls';
import { readSession, transition } from '../session/store';
import { abandonSession, endRound } from '../session/session';

/** Stand-in only: which key declares which driver the winner of the round. */
const WINNER_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];

export class RoundScene extends IdentityScene {
  private hud!: RaceHud;

  constructor() {
    super(SCENE_KEYS.round);
  }

  protected compose(): void {
    const session = readSession(this);

    this.hud = new RaceHud(this, {
      seats: ACTIVE_SEATS,
      target: session.target,
      halfWidth: STAGE.width / 2,
      top: EDGE.top,
      margin: MARGIN,
    });
    this.stage.add(this.hud.root);
    this.hud.render(session);
    enter(this, this.hud.root, { dy: -18, duration: MOTION.settle });

    this.buildStandIn();
  }

  /**
   * The seam, drawn honestly. Better a panel that says what is missing than a grey box that leaves
   * somebody wondering whether the build is broken.
   */
  private buildStandIn(): void {
    const width = 900;
    const panel = this.add.container(0, 0, [
      slab(this, {
        width,
        height: 230,
        fill: INK.slab,
        fillAlpha: 0.9,
        border: INK.rule,
        edge: INK.hazard,
        edgeWidth: 5,
      }),
      label(this, 'The race lands here', {
        size: SIZE.heading,
        tone: 'text',
      }).setPosition(0, -62),
      label(
        this,
        'The circuit is drivable in the handling lab. Until a round runs, call it yourself',
        {
          size: SIZE.label,
          tone: 'dim',
        },
      ).setPosition(0, -24),
    ]);
    this.mount(panel, 0, 30);
    enter(this, panel, { dy: 18, delay: MOTION.stagger });

    // One key per driver, in their own colour, so the stand-in still reads in the identity.
    const spacing = 220;
    ACTIVE_SEATS.forEach((seat, index) => {
      const x = (index - (ACTIVE_SEATS.length - 1) / 2) * spacing;
      const graphics = this.add.graphics();
      drawCarBody(graphics, { colour: seat.colour, scale: 0.9, shadow: false });
      const car = this.add.container(-46, 0, [graphics]);
      graphics.setAngle(90);

      const row = this.add.container(0, 0, [
        car,
        keycap(this, { glyph: String(index + 1), colour: seat.colour, size: 40 }).setPosition(
          22,
          0,
        ),
        label(this, `${seat.tag} takes it`, {
          size: SIZE.label,
          colour: seat.colour,
        }).setPosition(-12, 38),
      ]);
      this.mount(row, x, 66);
      enter(this, row, { dy: 14, delay: MOTION.stagger * (2 + index) });
    });

    this.mount(
      label(this, 'Esc · abandon the session', { size: SIZE.micro, tone: 'dimmer', origin: 0 }),
      EDGE.left + MARGIN,
      EDGE.bottom - MARGIN + SPACE.tight,
    );
  }

  protected onOtherKey(event: KeyboardEvent): void {
    const winner = WINNER_KEYS.indexOf(event.code);
    if (winner < 0 || winner >= ACTIVE_SEATS.length) return;
    transition(this, endRound(readSession(this), winner));
  }

  protected onBack(): void {
    // Leaving mid-round is a deliberate abandon, so the session is torn down rather than paused.
    transition(this, abandonSession(readSession(this)));
  }
}
