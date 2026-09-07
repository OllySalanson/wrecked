import Phaser from 'phaser';
import { PALETTE } from './theme';
import { FeelLabScene } from './scenes/FeelLabScene';

export function createGameConfig(): Phaser.Types.Core.GameConfig {
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
    scene: [FeelLabScene],
  };
}
