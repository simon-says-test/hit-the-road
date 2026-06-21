import Phaser from "phaser";
import { DEPTHS, PROJECTILE_LIFETIME_MS } from "../config";
import { ignoreInUiCamera } from "../utils/cameraLayers";

export type ProjectileOwner = "player" | "enemy";

export class Projectile extends Phaser.Physics.Arcade.Image {
  damage = 0;
  owner: ProjectileOwner = "player";
  // A fixed lifetime after firing, not a canvas-bounds check — the world is
  // now much larger than the camera viewport, so "off the edge of the
  // screen" no longer means anything useful (see PROJECTILE_LIFETIME_MS).
  despawnAt = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    ignoreInUiCamera(scene, this);
    scene.physics.add.existing(this);
    this.setDepth(DEPTHS.projectile);
  }

  fire(x: number, y: number, texture: string, vx: number, vy: number, damage: number, owner: ProjectileOwner): void {
    this.setTexture(texture);
    this.setPosition(x, y);
    this.setActive(true);
    this.setVisible(true);
    this.setVelocity(vx, vy);
    this.damage = damage;
    this.owner = owner;
    this.despawnAt = this.scene.time.now + PROJECTILE_LIFETIME_MS;
  }

  despawn(): void {
    this.setActive(false);
    this.setVisible(false);
    this.setVelocity(0, 0);
  }
}
