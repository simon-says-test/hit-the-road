import Phaser from "phaser";
import { DEPTHS, WeaponId } from "../config";

export type PickupType = "health" | "ammo" | "boost-score" | "boost-speed";

export class Pickup extends Phaser.Physics.Arcade.Image {
  type: PickupType = "health";
  // For ammo pickups, which weapon type
  weaponType?: WeaponId;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(DEPTHS.pickup);
    this.setScale(0.6); // Scale to match other entities
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
