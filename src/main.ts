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
  // FIT + CENTER_BOTH letterboxes the fixed 960x600 logical resolution into
  // whatever viewport it's given (e.g. a taller/narrower phone screen)
  // without distorting gameplay — Phaser auto-transforms pointer.x/y back
  // into this logical space, so screen-anchored UI (joystick, fire button,
  // HUD) never needs manual scale conversion.
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // 2 simultaneous pointers — one thumb on the virtual joystick, a second
  // free to tap/hold elsewhere (turret aim, weapon-sidebar switch) at the
  // same time. Default is 1; without this a second simultaneous touch is
  // silently dropped.
  input: {
    activePointers: 2,
  },
  physics: {
    default: "arcade",
    arcade: { debug: false },
  },
  scene: [BootScene, IntroScene, GameScene],
};

new Phaser.Game(config);
