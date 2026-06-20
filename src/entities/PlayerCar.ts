import Phaser from "phaser";
import { computeDrive, PlayerDriveInput } from "./playerPhysics";
import { WeaponController, FireResult } from "./weapons";
import { PLAYER_HEALTH, PLAYER_HANDLING, PICKUPS, WeaponId, CAR_SCALE, DEPTHS, DAMAGE_SLOW } from "../config";

export type PlayerInput = PlayerDriveInput;

export class PlayerCar extends Phaser.Physics.Arcade.Image {
  readonly weapons = new WeaponController();

  private forwardSpeed = 0;
  private _health = PLAYER_HEALTH.max;
  private _isOffRoad = false;
  private _drifting = false;
  private speedBoostTimer = 0;
  // Ms remaining of the temporary top-speed cap from a discrete combat hit
  // (see applyDamageSlow) — distinct from off-road drag and the ram shunt,
  // which already have their own speed effects and don't go through this.
  private damageSlowTimer = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);
    this.setDepth(DEPTHS.player);
    this.setScale(CAR_SCALE);
  }

  get speed(): number {
    return this.forwardSpeed;
  }

  get health(): number {
    return this._health;
  }

  get isOffRoad(): boolean {
    return this._isOffRoad;
  }

  get isDrifting(): boolean {
    return this._drifting;
  }

  takeDamage(amount: number): boolean {
    this._health = Math.max(0, this._health - amount);
    return this._health <= 0;
  }

  heal(amount: number): void {
    this._health = Math.min(PLAYER_HEALTH.max, this._health + amount);
  }

  applySpeedBoost(durationMs: number): void {
    this.speedBoostTimer = durationMs;
  }

  // Called by GameScene for discrete combat damage (enemy gunfire landing
  // on the player) — not for off-road drain, which already has its own
  // continuous drag and would compound badly with a one-time multiply
  // applied every single frame. A hit immediately knocks current speed
  // down, then caps top speed for a bit, so getting shot visibly costs you
  // ground even with enemy speed now roughly at parity (see DAMAGE_SLOW).
  applyDamageSlow(): void {
    this.forwardSpeed *= DAMAGE_SLOW.speedMultiplier;
    this.damageSlowTimer = DAMAGE_SLOW.durationMs;
  }

  // Adds a signed delta directly to forwardSpeed (rather than just damping
  // existing speed toward zero) — a ram should still jolt a stationary
  // player. Next frame's normal drive clamp folds the result back into the
  // valid speed range.
  applyImpactShunt(signedAmount: number): void {
    this.forwardSpeed += signedAmount;
  }

  drive(input: PlayerInput, delta: number): number {
    if (this.speedBoostTimer > 0) this.speedBoostTimer -= delta;
    if (this.damageSlowTimer > 0) this.damageSlowTimer -= delta;

    // A damage slow takes priority over a speed boost if both are somehow
    // active at once — being hit should always feel impactful.
    let maxForwardSpeedOverride: number | undefined;
    if (this.damageSlowTimer > 0) {
      maxForwardSpeedOverride = PLAYER_HANDLING.maxForwardSpeed * DAMAGE_SLOW.maxSpeedFactor;
    } else if (this.speedBoostTimer > 0) {
      maxForwardSpeedOverride = PLAYER_HANDLING.maxForwardSpeed + PICKUPS.speedBoostAmount;
    }

    const result = computeDrive(this.forwardSpeed, this.x, input, delta / 1000, maxForwardSpeedOverride);
    this.forwardSpeed = result.forwardSpeed;
    this._isOffRoad = result.isOffRoad;
    this._drifting = result.drifting;
    this.setVelocityX(result.lateralVelocity);

    if (this._isOffRoad) {
      this.takeDamage(PLAYER_HEALTH.offroadDamagePerSecond * (delta / 1000));
    }

    const speedFraction = Math.min(1, Math.abs(this.forwardSpeed) / PLAYER_HANDLING.maxForwardSpeed);
    this.weapons.update(delta, {
      steering: input.left || input.right,
      offRoad: this._isOffRoad,
      drifting: this._drifting,
      speedFraction,
      onRoughTerrain: input.onRoughTerrain ?? false,
    });

    return this.forwardSpeed;
  }

  selectWeapon(weapon: WeaponId): void {
    this.weapons.select(weapon);
  }

  tryFire(turretAimDeg = 0): FireResult | null {
    return this.weapons.tryFire(this.weapons.current, turretAimDeg);
  }
}
