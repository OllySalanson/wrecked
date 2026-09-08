/**
 * Between rounds.
 *
 * The design's restart budget is under two seconds from the end of one round to driving in the
 * next, and that budget is the reason this screen is shaped the way it is: it holds for a fixed
 * moment, shows who took the round and how close anyone is to ten, and then starts the next round
 * itself. There is no "press to continue" - a scoreboard that waits for a keypress is the thing
 * that ends an evening. A key can only ever make the hold shorter.
 */

import type Phaser from 'phaser';
import { EDGE, IdentityScene, MARGIN } from './IdentityScene';
import { INK, MOTION, SIZE, SPACE } from '../ui/kit/design';
import { ScorePips, bigNumber, enter, hazardBand, label, slam } from '../ui/kit/chrome';
import { SCENE_KEYS } from '../session/navigation';
import { ACTIVE_SEATS, seatAt } from '../session/controls';
import { readSession, transition } from '../session/store';
import {
  abandonSession,
  intermissionProgress,
  skipIntermission,
  tickIntermission,
} from '../session/session';

const WIPE_WIDTH = 860;
const WIPE_HEIGHT = 5;
const ROW_GAP = 84;

export class ScoreboardScene extends IdentityScene {
  private wipe!: Phaser.GameObjects.Graphics;

  constructor() {
    super(SCENE_KEYS.intermission);
  }

  protected compose(): void {
    const session = readSession(this);
    const winnerIndex = session.lastRoundWinner ?? 0;
    const winner = seatAt(winnerIndex);

    this.mount(
      label(this, `Round ${session.roundNumber}`, { size: SIZE.label, tone: 'dimmer' }),
      0,
      -224,
    );

    const claim = this.mount(
      label(this, winner.name, { size: 68, colour: winner.colour }),
      0,
      -166,
    );
    slam(this, claim, { from: 1.22 });

    const band = this.mount(
      hazardBand(this, { width: 420, height: 10, colour: winner.colour, drift: 34 }),
      0,
      -120,
    );
    enter(this, band, { dy: 0, dx: -40, delay: MOTION.stagger });

    const takes = this.mount(
      label(this, 'takes the round', { size: SIZE.subheading, tone: 'dim' }),
      0,
      -84,
    );
    enter(this, takes, { delay: MOTION.stagger });

    this.buildRows(winnerIndex);
    this.buildCountdown();
  }

  /** One row per driver: who they are, how far along they are, and the number itself. */
  private buildRows(winnerIndex: number): void {
    const session = readSession(this);
    const top = 10;

    ACTIVE_SEATS.forEach((seat, index) => {
      const y = top + index * ROW_GAP;
      const score = session.scores[seat.index] ?? 0;
      const isWinner = seat.index === winnerIndex;

      const pips = new ScorePips(this, {
        target: session.target,
        colour: seat.colour,
        pipWidth: 26,
        pipHeight: 34,
        gap: 8,
      });
      pips.render(score);

      const row = this.add.container(0, 0, [
        label(this, seat.tag, { size: SIZE.heading, colour: seat.colour, origin: 0 }).setPosition(
          -470,
          0,
        ),
        label(this, seat.name, { size: SIZE.micro, tone: 'dimmer', origin: 0 }).setPosition(
          -470,
          30,
        ),
        pips.root.setPosition(20, 0),
        bigNumber(this, score, { size: 64, colour: isWinner ? seat.colour : INK.dim }).setPosition(
          440,
          0,
        ),
      ]);

      this.mount(row, 0, y);
      enter(this, row, { dx: -26, dy: 0, delay: MOTION.stagger * (index + 1) });
    });
  }

  /**
   * The hold, drawn as a bar that runs out. Nobody has to be told the next round is coming: they
   * can see how long they have got.
   */
  private buildCountdown(): void {
    this.mount(label(this, 'Next round', { size: SIZE.label, tone: 'dim' }), 0, 226);

    const track = this.add.graphics();
    track.fillStyle(INK.rule, 1);
    track.fillRect(-WIPE_WIDTH / 2, 0, WIPE_WIDTH, WIPE_HEIGHT);
    this.mount(track, 0, 258);

    this.wipe = this.add.graphics();
    this.mount(this.wipe, 0, 258);

    this.mount(
      label(this, 'Enter · go now      Esc · stop', {
        size: SIZE.micro,
        tone: 'dimmer',
        origin: 1,
      }),
      EDGE.right - MARGIN,
      EDGE.bottom - MARGIN + SPACE.tight,
    );
  }

  update(): void {
    super.update();

    // The clock is run from here rather than from a Phaser timer so the hold, the wipe and the
    // handover cannot drift apart, and off `rawDelta` so the hold is real time rather than
    // Phaser's smoothed estimate of it. `transition` records every tick and hands over only when
    // the phase actually changes.
    transition(this, tickIntermission(readSession(this), this.game.loop.rawDelta));

    const remaining = 1 - intermissionProgress(readSession(this));
    this.wipe.clear();
    this.wipe.fillStyle(INK.hazard, 1);
    this.wipe.fillRect(-WIPE_WIDTH / 2, 0, WIPE_WIDTH * Math.max(remaining, 0), WIPE_HEIGHT);
  }

  protected onConfirm(): void {
    transition(this, skipIntermission(readSession(this)));
  }

  /** Quitting has to be possible from here too, or the only way out is to play another round. */
  protected onBack(): void {
    transition(this, abandonSession(readSession(this)));
  }
}
