/**
 * Entry point (Dango Order).
 * Creates the Phaser game and registers the scenes.
 *
 * Screen flow: Boot -> Preload -> Title -> Game -> Result
 *                       Title -> How to Play / Meet the Dango / Ranking -> Title
 */
import Phaser from 'phaser';
import { createGameConfig } from './config/game-config';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { TitleScene } from './scenes/TitleScene';
import { HowToScene } from './scenes/HowToScene';
import { MeetScene } from './scenes/MeetScene';
import { RankingScene } from './scenes/RankingScene';
import { GameScene } from './scenes/GameScene';
import { ResultScene } from './scenes/ResultScene';

const bootGame = (): void => {
  const config = createGameConfig();
  config.scene = [
    BootScene,
    PreloadScene,
    TitleScene,
    HowToScene,
    MeetScene,
    RankingScene,
    GameScene,
    ResultScene,
  ];
  new Phaser.Game(config);
};

// Vite module scripts load at the end of body, but guard readyState
// anyway (iOS Safari quirk workaround, same as Dango Drop).
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootGame);
} else {
  bootGame();
}
