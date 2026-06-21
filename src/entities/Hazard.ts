import Phaser from "phaser";
import { DEPTHS } from "../config";
import { ignoreInUiCamera } from "../utils/cameraLayers";

// "rough"/"oil" are continuous patches a car drives over (no despawn on
// contact, keeps affecting whoever's overlapping every frame). "obstacle"
// is the odd one out — a one-time bump (flat damage + speed penalty) that
// despawns itself the first time anything hits it, since it's a discrete
// object you clip, not ground you linger on (see GameScene's hazard-contact
// handling for where that distinction is actually applied).
export type HazardType = "rough" | "oil" | "obstacle";

export class Hazard extends Phaser.Physics.Arcade.Image {
  type: HazardType = "rough";

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    ignoreInUiCamera(scene, this);
    scene.physics.add.existing(this);
    this.setDepth(DEPTHS.hazard);
  }

  // Hazards are placed once around the generated loop at race start and
  // stay fixed for the whole race — no scrolling/velocity to set up, unlike
  // the old endless-runner model's spawn-and-drift-down pattern.
  spawn(type: HazardType, x: number, y: number, texture: string): void {
    this.type = type;
    this.setTexture(texture);
    this.setPosition(x, y);
    this.setActive(true);
    this.setVisible(true);
  }

  despawn(): void {
    this.setActive(false);
    this.setVisible(false);
  }
}
