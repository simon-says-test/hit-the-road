import Phaser from "phaser";
import { DEPTHS } from "../config";

export type HazardType = "rough" | "oil";

// A terrain patch the player drives over/through, not a one-shot obstacle —
// GameScene no longer despawns these on contact; they scroll off the bottom
// of the screen like any other world prop (see GameScene.updateWorldProps),
// continuing to affect the player every frame they're overlapping it.
export class Hazard extends Phaser.Physics.Arcade.Image {
  type: HazardType = "rough";

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(DEPTHS.hazard);
  }

  spawn(type: HazardType, x: number, y: number, texture: string): void {
    this.type = type;
    this.setTexture(texture);
    this.setPosition(x, y);
    this.setActive(true);
    this.setVisible(true);
  }

  drive(velocityY: number): void {
    this.setVelocityY(velocityY);
  }

  despawn(): void {
    this.setActive(false);
    this.setVisible(false);
    this.setVelocity(0, 0);
  }
}
