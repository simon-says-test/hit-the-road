import Phaser from "phaser";
import { DEPTHS } from "../config";

export type PickupType = "health" | "ammo" | "boost-score" | "boost-speed";

export class Pickup extends Phaser.Physics.Arcade.Image {
  type: PickupType = "health";

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(DEPTHS.pickup);
  }

  spawn(type: PickupType, x: number, y: number, texture: string): void {
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
