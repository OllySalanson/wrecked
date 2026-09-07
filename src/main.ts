import Phaser from 'phaser';
import './style.css';
import { createGameConfig } from './game/gameConfig';

let game: Phaser.Game | undefined = new Phaser.Game(createGameConfig());

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game?.destroy(true);
    game = undefined;
  });
}
