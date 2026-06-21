import Phaser from "phaser";
import { computeDrive, PlayerDriveInput, PlayerDriveState } from "./playerPhysics";
import { WeaponController, FireResult } from "./weapons";
import { PLAYER_HEALTH, PLAYER_HANDLING, PICKUPS, WeaponId, CAR_SCALE, DEPTHS, DAMAGE_SLOW, WALLS, wallImpactDamage } from "../config";
import { ignoreInUiCamera } from "../utils/cameraLayers";

export type PlayerInput = PlayerDriveInput;

export class PlayerCar extends Phaser.Physics.Arcade.Image {
  readonly weapons = new WeaponController();

  private driveState: PlayerDriveState = { forwardSpeed: 0, headingDeg: 0, velocityHeadingDeg: 0 };
  private _health = PLAYER_HEALTH.max;
  private _isOffRoad = false;
  private _drifting = false;
  private speedBoostTimer = 0;
  // Ms remaining of the temporary top-speed cap from a discrete combat hit
  // (see applyDamageSlow) — distinct from off-road drag and the ram shunt,
  // which already have their own speed effects and don't go through this.
  private damageSlowTimer = 0;
  // Tracks the previous frame's wall contact so damage is only applied on
  // the rising edge (see drive()'s wall-impact handling), not every frame
  // of continued contact.
  private _wasAtWall = false;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, headingDeg = 0) {
    super(scene, x, y, texture);
    this.driveState.headingDeg = headingDeg;
    this.driveState.velocityHeadingDeg = headingDeg;
    scene.add.existing(this);
    ignoreInUiCamera(scene, this);
    scene.physics.add.existing(this);
    this.setDepth(DEPTHS.player);
    this.setScale(CAR_SCALE);
    this.setRotation((headingDeg * Math.PI) / 180);
  }

  get speed(): number {
    return this.driveState.forwardSpeed;
  }

  get heading(): number {
    return this.driveState.headingDeg;
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
    this.driveState.forwardSpeed *= DAMAGE_SLOW.speedMultiplier;
    this.damageSlowTimer = DAMAGE_SLOW.durationMs;
  }

  // Adds a signed delta directly to forwardSpeed (rather than just damping
  // existing speed toward zero) — a ram should still jolt a stationary
  // player. Next frame's normal drive clamp folds the result back into the
  // valid speed range.
  applyImpactShunt(signedAmount: number): void {
    this.driveState.forwardSpeed += signedAmount;
  }

  // A one-time multiply applied to current speed on hitting a small
  // discrete obstacle (see OBSTACLES in config.ts) — distinct from
  // applyDamageSlow's temporary top-speed cap, since clipping a rock is a
  // single physical bump, not a debuff that lingers afterward.
  applyObstacleHit(speedPenaltyFactor: number): void {
    this.driveState.forwardSpeed *= speedPenaltyFactor;
  }

  // Returns the new forward speed (used by GameScene for scoring/AI
  // approach-speed comparisons elsewhere). Position is no longer driven via
  // setVelocityX — heading/speed resolve to a full (vx, vy) which the
  // caller applies via setVelocity, since the car can now face/move in any
  // direction around the loop, not just drift sideways on a fixed lane.
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

    // Captured before computeDrive applies this frame's wall drag, so a
    // wall impact is judged by the speed the car was actually carrying into
    // it, not by the post-hit speed the drag has already reduced it to.
    const speedEnteringFrame = Math.abs(this.driveState.forwardSpeed);

    const result = computeDrive(this.driveState, input, delta / 1000, maxForwardSpeedOverride);
    this.driveState = { forwardSpeed: result.forwardSpeed, headingDeg: result.headingDeg, velocityHeadingDeg: result.velocityHeadingDeg };
    this._isOffRoad = result.isOffRoad;
    this._drifting = result.drifting;
    this.setVelocity(result.vx, result.vy);
    this.setRotation((result.headingDeg * Math.PI) / 180);

    if (this._isOffRoad) {
      this.takeDamage(PLAYER_HEALTH.offroadDamagePerSecond * (delta / 1000));
    }
    // One-time damage + speed cut on the frame contact begins, not per
    // second of continued contact — see wallImpactDamage in config.ts. The
    // speed cut applies on top of (not instead of) the wall's own continuous
    // scraping drag, since a real impact happens in the instant of contact.
    if (result.atWall && !this._wasAtWall) {
      this.takeDamage(wallImpactDamage(speedEnteringFrame, WALLS.maxImpactDamagePlayer, PLAYER_HANDLING.maxForwardSpeed));
      this.driveState.forwardSpeed *= WALLS.impactSpeedPenaltyFactor;
      // Re-applied immediately (not left for next frame's drive() to pick
      // up) so the slowdown reads as instant on the frame of impact, the
      // same as applyObstacleHit's one-time speed multiply.
      const velocityHeadingRad = (this.driveState.velocityHeadingDeg * Math.PI) / 180;
      this.setVelocity(Math.sin(velocityHeadingRad) * this.driveState.forwardSpeed, -Math.cos(velocityHeadingRad) * this.driveState.forwardSpeed);
    }
    this._wasAtWall = result.atWall;

    const speedFraction = Math.min(1, Math.abs(this.driveState.forwardSpeed) / PLAYER_HANDLING.maxForwardSpeed);
    this.weapons.update(delta, {
      steering: input.left || input.right,
      offRoad: this._isOffRoad,
      drifting: this._drifting,
      speedFraction,
      onRoughTerrain: input.onRoughTerrain ?? false,
    });

    return this.driveState.forwardSpeed;
  }

  selectWeapon(weapon: WeaponId): void {
    this.weapons.select(weapon);
  }

  tryFire(turretAimDeg = 0): FireResult | null {
    return this.weapons.tryFire(this.weapons.current, turretAimDeg);
  }
}
