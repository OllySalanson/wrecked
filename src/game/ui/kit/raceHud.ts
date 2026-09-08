/**
 * The score furniture that sits over a race.
 *
 * It lives in the kit rather than in a scene because it is the piece that has to survive contact
 * with the actual game: the round lifecycle work drops it over the track, and it must already look
 * like the menus that lead into it. A scoreboard invented separately at that point is how a game
 * ends up with two visual identities.
 *
 * Everything is anchored to the top edge of the design box and pushed to the corners. The middle of
 * the screen belongs to the cars.
 */

import type Phaser from 'phaser';
import { INK, SIZE } from './design';
import { ScorePips, bigNumber, label } from './chrome';
import type { Seat } from '../../session/controls';
import type { SessionState } from '../../session/session';

export interface RaceHudOptions {
  seats: readonly Seat[];
  target: number;
  /** Half-width of the design box the HUD is laid out in. */
  halfWidth: number;
  /** Y of the top of the design box. */
  top: number;
  margin: number;
}

interface SeatWidgets {
  readonly seat: Seat;
  readonly score: Phaser.GameObjects.Text;
  readonly pips: ScorePips;
}

export class RaceHud {
  readonly root: Phaser.GameObjects.Container;

  private readonly widgets: SeatWidgets[] = [];
  private readonly round: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, { seats, target, halfWidth, top, margin }: RaceHudOptions) {
    const children: Phaser.GameObjects.GameObject[] = [];
    const rowY = top + margin - 18;

    seats.forEach((seat, index) => {
      // Seat 0 hugs the left edge, seat 1 the right; four seats will pair up the same way.
      const onLeft = index % 2 === 0;
      const edgeX = onLeft ? -halfWidth + margin : halfWidth - margin;
      const direction = onLeft ? 1 : -1;

      const tag = label(scene, seat.tag, {
        size: SIZE.subheading,
        colour: seat.colour,
        origin: onLeft ? 0 : 1,
      }).setPosition(edgeX, rowY);

      const score = bigNumber(scene, 0, { size: 46, colour: INK.text });
      score.setOrigin(onLeft ? 0 : 1, 0.5).setPosition(edgeX + direction * 54, rowY + 2);

      const pips = new ScorePips(scene, {
        target,
        colour: seat.colour,
        pipWidth: 13,
        pipHeight: 18,
        gap: 5,
      });
      pips.root.setPosition(edgeX + direction * (pips.width / 2), rowY + 34);

      children.push(tag, score, pips.root);
      this.widgets.push({ seat, score, pips });
    });

    const roundCaption = label(scene, 'Round', { size: SIZE.micro, tone: 'dimmer' }).setPosition(
      0,
      rowY - 12,
    );
    this.round = bigNumber(scene, 1, { size: 40, colour: INK.hazard }).setPosition(0, rowY + 22);
    children.push(roundCaption, this.round);

    this.root = scene.add.container(0, 0, children);
  }

  render(state: SessionState): void {
    this.round.setText(String(Math.max(state.roundNumber, 1)));
    for (const widget of this.widgets) {
      const score = state.scores[widget.seat.index] ?? 0;
      widget.score.setText(String(score));
      widget.pips.render(score);
    }
  }
}
