import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { IntroScene } from "./scenes/IntroScene";
import { GameScene } from "./scenes/GameScene";
import { CANVAS_WIDTH, CANVAS_HEIGHT, MOBILE_CANVAS_WIDTH, MOBILE_CANVAS_HEIGHT } from "./config";
import { isMobileMode } from "./utils/device";

// The only place that picks between the desktop (landscape) and mobile
// (portrait) canvas size — see config.ts's MOBILE_CANVAS_WIDTH/HEIGHT
// comment for why this decision has to live here rather than in config.ts
// itself (isMobileMode() touches window/navigator, which config.ts can't
// depend on without breaking under Vitest's plain-Node test environment).
// Every other consumer that needs the *actual* active size reads
// scene.scale.width/height instead of importing either constant directly.
const mobile = isMobileMode();
const canvasWidth = mobile ? MOBILE_CANVAS_WIDTH : CANVAS_WIDTH;
const canvasHeight = mobile ? MOBILE_CANVAS_HEIGHT : CANVAS_HEIGHT;

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  width: canvasWidth,
  height: canvasHeight,
  backgroundColor: "#3a3a3a",
  // FIT + CENTER_BOTH letterboxes the logical resolution into whatever
  // viewport it's given without distorting gameplay — Phaser auto-
  // transforms pointer.x/y back into this logical space, so screen-anchored
  // UI (joystick, fire button, HUD) never needs manual scale conversion.
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
