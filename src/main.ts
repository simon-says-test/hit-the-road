import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { IntroScene } from "./scenes/IntroScene";
import { GameScene } from "./scenes/GameScene";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "./config";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  backgroundColor: "#3a3a3a",
  physics: {
    default: "arcade",
    arcade: { debug: false },
  },
  scene: [BootScene, IntroScene, GameScene],
};

new Phaser.Game(config);
