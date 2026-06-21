import Phaser from "phaser";
import { DEPTHS, WeaponId } from "../config";
import { ignoreInUiCamera } from "../utils/cameraLayers";

export type PickupType = "health" | "ammo" | "boost-score" | "boost-speed";

export class Pickup extends Phaser.Physics.Arcade.Image {
  type: PickupType = "health";
  // For ammo pickups, which weapon type
  weaponType?: WeaponId;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    ignoreInUiCamera(scene, this);
    scene.physics.add.existing(this);
    this.setDepth(DEPTHS.pickup);
    // Bigger than the old 0.6 — at car scale, pickups were easy to miss
    // entirely while driving past at speed.
    this.setScale(0.9);
  }

  /**
   * Spawn a pickup at the given position.
   * Used by pool.get() to reset state.
   */
  spawn(type: PickupType, x: number, y: number, texture: string, weaponType?: WeaponId): void {
    this.type = type;
    this.weaponType = weaponType;
    this.setTexture(texture);
    this.setPosition(x, y);
    this.setActive(true);
    this.setVisible(true);
    this.setVelocity(0, 0); // No movement for pickups on loop
  }

  /**
   * Despawn the pickup (return to pool).
   */
  despawn(): void {
    this.setActive(false);
    this.setVisible(false);
    this.setVelocity(0, 0);
  }
}
