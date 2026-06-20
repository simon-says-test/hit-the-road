import Phaser from "phaser";
import { DEPTHS } from "../config";

export type ProjectileOwner = "player" | "enemy";

export class Projectile extends Phaser.Physics.Arcade.Image {
  damage = 0;
  owner: ProjectileOwner = "player";

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string) {
    super(scene, x, y, texture);
    scene.add.existing(this);
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
  }

  despawn(): void {
    this.setActive(false);
    this.setVisible(false);
    this.setVelocity(0, 0);
  }
}
