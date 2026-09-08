/**
 * The lineup: who is playing, what colour they are, and exactly which keys are theirs.
 *
 * This screen exists because sharing a keyboard is confusing and nothing else in the game will ever
 * explain it. Its whole job is that two people can sit down, look once, and know which half of the
 * keyboard is theirs - so the colour, the car and the keys are shown together rather than described.
 *
 * Slots three and four are drawn as reserved rather than left out. They are gamepad seats and they
 * are coming; showing the space they will occupy is cheaper than rebuilding this layout around them
 * later, and it tells a player at a glance that the game is not finished at two.
 */

import type Phaser from 'phaser';
import { EDGE, IdentityScene, MARGIN } from './IdentityScene';
import { INK, MOTION, SIZE, SPACE } from '../ui/kit/design';
import { actionPrompt, enter, keycap, label, slab } from '../ui/kit/chrome';
import { drawCarBody } from '../ui/kit/carShape';
import { SCENE_KEYS } from '../session/navigation';
import { ACTIVE_SEATS, BOOST_COMBO, SEATS, type Seat } from '../session/controls';
import { readSession, transition } from '../session/store';
import { backToTitle, startRound } from '../session/session';

/** Two cards plus the gap fill the margins exactly, so every edge on the screen lines up. */
const CARD_WIDTH = 554;
const CARD_HEIGHT = 300;
const CARD_GAP = 44;
const CARD_Y = -30;
const HEAD_HEIGHT = 46;

export class LineupScene extends IdentityScene {
  constructor() {
    super(SCENE_KEYS.lineup);
  }

  protected compose(): void {
    const session = readSession(this);
    this.header('The grid');

    this.mount(
      label(this, `First to ${session.target}`, {
        size: SIZE.label,
        colour: INK.hazard,
        origin: 1,
      }),
      EDGE.right - MARGIN,
      EDGE.top + MARGIN,
    );

    const instruction = this.mount(
      label(this, 'Take a side of the keyboard', { size: SIZE.heading, tone: 'text' }),
      0,
      -212,
    );
    enter(this, instruction, { dy: -14 });

    ACTIVE_SEATS.forEach((seat, index) => {
      const x = (index - (ACTIVE_SEATS.length - 1) / 2) * (CARD_WIDTH + CARD_GAP);
      const card = this.buildCard(seat);
      this.mount(card, x, CARD_Y);
      enter(this, card, { dy: 26, delay: MOTION.stagger * (index + 1), duration: MOTION.settle });
    });

    this.buildBoostStrip();
    this.buildReservedSeats();

    this.footer(
      actionPrompt(this, 'ENTER', 'Start the race', { pulse: true }),
      actionPrompt(this, 'ESC', 'Back', { colour: INK.dim, size: SIZE.label }),
    );
  }

  /** One driver: their colour, their car, and their four keys drawn as keys. */
  private buildCard(seat: Seat): Phaser.GameObjects.Container {
    const children: Phaser.GameObjects.GameObject[] = [];
    const halfW = CARD_WIDTH / 2;
    const halfH = CARD_HEIGHT / 2;

    children.push(
      slab(this, {
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        fill: INK.slab,
        border: INK.rule,
      }),
    );

    // The head is a solid block of the driver's colour. Nothing else on the screen is, so the
    // association between a person and a colour is made before anything has been read.
    const head = this.add.graphics();
    head.fillStyle(seat.colour, 1);
    head.fillRect(-halfW, -halfH, CARD_WIDTH, HEAD_HEIGHT);
    children.push(head);

    children.push(
      label(this, seat.name, { size: SIZE.subheading, colour: INK.asphalt, origin: 0 }).setPosition(
        -halfW + SPACE.base,
        -halfH + HEAD_HEIGHT / 2,
      ),
      label(this, seat.tag, { size: SIZE.subheading, colour: INK.asphalt, origin: 1 }).setPosition(
        halfW - SPACE.base,
        -halfH + HEAD_HEIGHT / 2,
      ),
    );

    // The car, in the driver's colour, at the size it is drawn in the race.
    const carGraphics = this.add.graphics();
    drawCarBody(carGraphics, { colour: seat.colour, scale: 1.8 });
    const car = this.add.container(-177, 12, [carGraphics]);
    children.push(car);
    children.push(
      label(this, seat.cluster, { size: SIZE.micro, tone: 'dimmer' }).setPosition(-177, 118),
    );

    const divider = this.add.graphics();
    divider.fillStyle(INK.rule, 1);
    divider.fillRect(
      -77,
      -halfH + HEAD_HEIGHT + SPACE.base,
      1,
      CARD_HEIGHT - HEAD_HEIGHT - SPACE.wide,
    );
    children.push(divider);

    children.push(...this.buildKeyRows(seat));

    return this.add.container(0, 0, children);
  }

  /** Accelerate, brake and steer, each as the key it actually is. */
  private buildKeyRows(seat: Seat): Phaser.GameObjects.GameObject[] {
    const caps = seat.caps;
    if (!caps) return [];

    const capSize = 44;
    const firstCapX = -20;
    const labelX = 14;
    const rows: { glyphs: string[]; text: string; y: number }[] = [
      { glyphs: [caps.accelerate], text: 'Accelerate', y: -46 },
      { glyphs: [caps.brake], text: 'Brake / reverse', y: 16 },
      { glyphs: [caps.left, caps.right], text: 'Steer', y: 78 },
    ];

    const objects: Phaser.GameObjects.GameObject[] = [];
    for (const row of rows) {
      row.glyphs.forEach((glyph, index) => {
        objects.push(
          keycap(this, { glyph, colour: seat.colour, size: capSize }).setPosition(
            firstCapX + index * (capSize + 8),
            row.y,
          ),
        );
      });
      const x = labelX + (row.glyphs.length - 1) * (capSize + 8);
      objects.push(
        label(this, row.text, { size: SIZE.body, tone: 'text', origin: 0 }).setPosition(x, row.y),
      );
    }
    return objects;
  }

  /**
   * Boost has no button, on purpose - the captain chose the original's combo. That is exactly the
   * kind of thing nobody discovers on their own, so it is stated once, on the way in, for both
   * drivers at once.
   */
  private buildBoostStrip(): void {
    const width = CARD_WIDTH * 2 + CARD_GAP;
    const strip = this.add.container(0, 0, [
      slab(this, {
        width,
        height: 46,
        fill: INK.slabRaised,
        fillAlpha: 0.9,
        border: INK.rule,
        edge: INK.hazard,
        edgeWidth: 5,
      }),
      label(this, 'Boost', { size: SIZE.label, colour: INK.hazard, origin: 0 }).setPosition(
        -width / 2 + SPACE.base,
        0,
      ),
      label(this, BOOST_COMBO, { size: SIZE.body, tone: 'text', origin: 0 }).setPosition(
        -width / 2 + 96,
        0,
      ),
      label(this, 'Both drivers, same combo', {
        size: SIZE.micro,
        tone: 'dimmer',
        origin: 1,
      }).setPosition(width / 2 - SPACE.base, 0),
    ]);

    this.mount(strip, 0, 162);
    enter(this, strip, { delay: MOTION.stagger * 3 });
  }

  /** The seats that exist in the design but not yet in the build. */
  private buildReservedSeats(): void {
    const reserved = SEATS.filter((seat) => seat.kind === 'gamepad-later');

    reserved.forEach((seat, index) => {
      const x = (index - (reserved.length - 1) / 2) * (CARD_WIDTH + CARD_GAP);
      const width = CARD_WIDTH;
      const strip = this.add.container(0, 0, [
        slab(this, {
          width,
          height: 50,
          fill: INK.asphalt,
          fillAlpha: 0.55,
          border: INK.rule,
          borderWidth: 1,
          edge: seat.colour,
          edgeWidth: 4,
        }),
        label(this, seat.name, { size: SIZE.label, tone: 'dimmer', origin: 0 }).setPosition(
          -width / 2 + SPACE.base,
          0,
        ),
        label(this, `${seat.cluster} - later`, {
          size: SIZE.micro,
          tone: 'dimmer',
          origin: 1,
        }).setPosition(width / 2 - SPACE.base, 0),
      ]);
      this.mount(strip, x, 228);
      // These seats are not available yet, so they arrive knocked back and stay there.
      enter(this, strip, { delay: MOTION.stagger * (4 + index), toAlpha: 0.62 });
    });
  }

  protected onConfirm(): void {
    transition(this, startRound(readSession(this)));
  }

  protected onBack(): void {
    transition(this, backToTitle(readSession(this)));
  }
}
