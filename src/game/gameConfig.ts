import Phaser from 'phaser';
import { PALETTE } from './theme';
import { FeelLabScene } from './scenes/FeelLabScene';
import { TitleScene } from './scenes/TitleScene';
import { LineupScene } from './scenes/LineupScene';
import { RoundScene } from './scenes/RoundScene';
import { ScoreboardScene } from './scenes/ScoreboardScene';
import { ChampionScene } from './scenes/ChampionScene';

/**
 * `?lab` boots straight into the handling lab instead of the title screen.
 *
 * The lab is the tool the car is still being tuned with, so it has to stay one step away — but it
 * is a workshop, not a mode, and it does not belong in a menu. A query string and a key on the
 * title screen are the whole of its front door.
 */
function startFromLab(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('lab');
}

export function createGameConfig(): Phaser.Types.Core.GameConfig {
  const menu = [TitleScene, LineupScene, RoundScene, ScoreboardScene, ChampionScene];

  return {
    type: Phaser.AUTO,
    parent: 'app',
    backgroundColor: PALETTE.asphalt,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: '100%',
      height: '100%',
    },
    // No physics engine is registered on purpose. Arcade Physics bodies cannot rotate and Matter.js
    // would model the car as a sliding brick; SHUNT owns its handling model in src/game/sim.
    render: {
      antialias: true,
      pixelArt: false,
    },
    // Phaser starts the first scene in the list, so the boot choice is which one leads it.
    scene: startFromLab() ? [FeelLabScene, ...menu] : [...menu, FeelLabScene],
  };
}
