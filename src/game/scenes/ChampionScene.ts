/**
 * The end of a session: somebody got to ten.
 *
 * This is the one screen in the flow that is allowed to wait. Everything between rounds runs itself
 * out on a clock because the restart has to be fast; this is not a restart, it is the end of the
 * evening's argument, and it should sit there until somebody decides what happens next.
 *
 * The winner's colour takes over the screen - including the hazard rails, which are struck in it
 * rather than in the usual yellow. It is the only time anything but the eliminator gets to own the
 * whole frame.
 */

import { IdentityScene } from './IdentityScene';
import { INK, MOTION, SIZE, SPACE } from '../ui/kit/design';
import {
  ScorePips,
  actionPrompt,
  bigNumber,
  enter,
  hazardBand,
  label,
  slam,
} from '../ui/kit/chrome';
import { drawCarBody } from '../ui/kit/carShape';
import { SCENE_KEYS } from '../session/navigation';
import { ACTIVE_SEATS, seatAt } from '../session/controls';
import { readSession, transition } from '../session/store';
import { backToTitle, rematch } from '../session/session';

const ROW_GAP = 76;

export class ChampionScene extends IdentityScene {
  protected accent(): number {
    const session = readSession(this);
    return seatAt(session.championIndex ?? 0).colour;
  }

  constructor() {
    super(SCENE_KEYS.champion);
  }

  protected compose(): void {
    const session = readSession(this);
    const champion = seatAt(session.championIndex ?? 0);

    this.mount(label(this, 'Session over', { size: SIZE.label, tone: 'dimmer' }), 0, -244);

    const banner = this.mount(
      hazardBand(this, { width: 980, height: 12, colour: champion.colour, drift: 40 }),
      0,
      -212,
    );
    enter(this, banner, { dy: 0, dx: -80, duration: MOTION.settle });

    const name = this.mount(
      label(this, champion.name, { size: 92, colour: champion.colour }),
      0,
      -150,
    );
    slam(this, name, { from: 1.3 });

    const takes = this.mount(
      label(this, `Wins the session, first to ${session.target}`, {
        size: SIZE.subheading,
        tone: 'dim',
      }),
      0,
      -92,
    );
    enter(this, takes, { delay: MOTION.stagger * 2 });

    this.buildWinnerCar(champion.colour);
    this.buildFinalScores();

    this.mount(
      label(this, `${session.roundNumber} rounds`, { size: SIZE.micro, tone: 'dimmer' }),
      0,
      232,
    );

    this.footer(
      actionPrompt(this, 'ENTER', 'Race again', { pulse: true, colour: champion.colour }),
      actionPrompt(this, 'ESC', 'Back to the title', { colour: INK.dim, size: SIZE.label }),
    );
  }

  /** The winner's own car, big, pointing forward. The prize is being the one still on the screen. */
  private buildWinnerCar(colour: number): void {
    const graphics = this.add.graphics();
    drawCarBody(graphics, { colour, scale: 1.9 });
    const car = this.add.container(0, 0, [graphics]);
    graphics.setAngle(90);
    this.mount(car, 0, -24);
    enter(this, car, { dx: -50, dy: 0, delay: MOTION.stagger * 3 });
  }

  private buildFinalScores(): void {
    const session = readSession(this);

    ACTIVE_SEATS.forEach((seat, index) => {
      const y = 62 + index * ROW_GAP;
      const score = session.scores[seat.index] ?? 0;
      const isChampion = seat.index === session.championIndex;

      const pips = new ScorePips(this, {
        target: session.target,
        colour: seat.colour,
        pipWidth: 22,
        pipHeight: 28,
        gap: 7,
      });
      pips.render(score);

      const row = this.add.container(0, 0, [
        label(this, seat.tag, {
          size: SIZE.subheading,
          colour: seat.colour,
          origin: 0,
        }).setPosition(-430, 0),
        pips.root.setPosition(20, 0),
        bigNumber(this, score, {
          size: 48,
          colour: isChampion ? seat.colour : INK.dim,
        }).setPosition(410, 0),
      ]);
      this.mount(row, 0, y);
      // The loser's row is legible but stands down; only the champion's is at full strength.
      enter(this, row, {
        dx: -22,
        delay: MOTION.stagger * (4 + index),
        toAlpha: isChampion ? 1 : 0.72,
      });
    });

    this.mount(
      label(this, 'Final', { size: SIZE.micro, tone: 'dimmer', origin: 0 }),
      -430,
      62 - SPACE.wide,
    );
  }

  protected onConfirm(): void {
    transition(this, rematch(readSession(this)));
  }

  protected onBack(): void {
    transition(this, backToTitle(readSession(this)));
  }
}
