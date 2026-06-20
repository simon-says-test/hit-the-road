import Phaser from "phaser";
import { computeLateralVelocity, smoothLateralVelocity } from "./enemyBehaviors";
import { EnemyArchetypeConfig, CAR_SCALE, ENEMY_AI, DEPTHS, ROUGH_TERRAIN, OIL_SLICK, COLLISION_SHUNT, DAMAGE_SLOW } from "../config";

export interface NearestRival {
  dx: number;
  dist: number;
}

export class EnemyCar extends Phaser.Physics.Arcade.Image {
  archetype!: EnemyArchetypeConfig;
  health = 0;
  fireTimer = 0;
  ramCooldown = 0;
  // Set by GameScene.updateEnemies() each frame via an explicit overlap
  // check against the hazards group (see Hazard.ts) — driving the terrain
  // effects below from the same per-frame flag/timer pattern PlayerCar uses.
  onRoughTerrainThisFrame = false;
  oilSlickTimer = 0;
  // Rolled once per oil-slick activation (not every frame — see OIL_SLICK
  // in config.ts), held for the duration so the slide reads as a sustained
  // push rather than a vibration.
  oilDriftBias = 0;
  // Ms remaining of a temporary top-speed cap from a discrete combat hit
  // (weapon damage or ram damage that didn't kill it — see applyDamageSlow).
  damageSlowTimer = 0;
  private lateralVelocity = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setScale(CAR_SCALE);
    this.setBounce(0.15);
    this.setDepth(DEPTHS.enemy);
  }

  spawn(archetype: EnemyArchetypeConfig, x: number, y: number): void {
    this.archetype = archetype;
    this.health = archetype.health;
    this.fireTimer = archetype.fireCooldown;
    this.ramCooldown = 0;
    this.lateralVelocity = 0;
    this.onRoughTerrainThisFrame = false;
    this.oilSlickTimer = 0;
    this.oilDriftBias = 0;
    this.damageSlowTimer = 0;
    this.setTexture(archetype.texture);
    this.setPosition(x, y);
    this.setActive(true);
    this.setVisible(true);
    this.setTint(archetype.tint);
  }

  takeDamage(amount: number): boolean {
    this.health -= amount;
    return this.health <= 0;
  }

  // Called by GameScene whenever a discrete hit (weapon or ram damage)
  // didn't kill it — with enemy/player top speed now roughly at parity,
  // this is what actually opens a gap when you land a hit, rather than a
  // built-in speed edge baked into the archetype.
  applyDamageSlow(): void {
    this.damageSlowTimer = DAMAGE_SLOW.durationMs;
  }

  drive(baseApproachSpeed: number, forwardSpeed: number, playerX: number, delta: number, rival?: NearestRival): void {
    if (this.damageSlowTimer > 0) {
      this.damageSlowTimer = Math.max(0, this.damageSlowTimer - delta);
    }

    // For a brief window right after ramming the player, ignore normal AI
    // and actively move away instead. Without this, an enemy that survives
    // a ram (chasing faster than the player can pull away) just gets driven
    // straight back into contact next frame, fighting the physics collider's
    // separation every step — which is what made the bounce-apart feel
    // inconsistent rather than reliable.
    if (this.ramCooldown > 0) {
      this.ramCooldown = Math.max(0, this.ramCooldown - delta);
      if (this.archetype.approachFrom === "behind") {
        this.setVelocity(this.lateralVelocity * 0.3, COLLISION_SHUNT.recoilSpeed);
      } else {
        const awaySign = Math.sign(this.x - playerX) || 1;
        this.setVelocity(awaySign * COLLISION_SHUNT.recoilSpeed, 0);
      }
      if (this.archetype.fireCooldown > 0) {
        this.fireTimer -= delta;
      }
      return;
    }

    const target = computeLateralVelocity({
      enemyX: this.x,
      playerX,
      archetype: this.archetype,
      nearestRivalDx: rival?.dx,
      nearestRivalDist: rival?.dist,
    });
    this.lateralVelocity = smoothLateralVelocity(this.lateralVelocity, target, ENEMY_AI.steeringSmoothing);

    // Rough terrain doesn't give enemies an accel/drag model the way it
    // does the player — simplest equivalent is just scaling down their own
    // approach speed while they're on a patch, the same "slows down" result.
    const terrainMultiplier = this.onRoughTerrainThisFrame ? ROUGH_TERRAIN.enemySpeedMultiplier : 1;
    const damageSlowMultiplier = this.damageSlowTimer > 0 ? DAMAGE_SLOW.maxSpeedFactor : 1;
    const ownSpeed = baseApproachSpeed * this.archetype.speedMultiplier * terrainMultiplier * damageSlowMultiplier;
    // Relative closing speed in the player's reference frame, for both
    // "behind" (chasing from the rear) and "side" (merged in near the
    // player's own y) archetypes alike: own speed below the player's
    // forward speed means it falls back, above means it pulls ahead.
    const velocityY = forwardSpeed - ownSpeed;

    let lateralWithDrift = this.lateralVelocity;
    if (this.oilSlickTimer > 0) {
      this.oilSlickTimer = Math.max(0, this.oilSlickTimer - delta);
      // Applied on top of (not folded into) the smoothed steering value, so
      // it reads as a sudden loss of control rather than a steering target
      // that smoothing would otherwise ease away.
      lateralWithDrift += this.oilDriftBias * OIL_SLICK.enemyDriftStrength;
    }
    this.setVelocity(lateralWithDrift, velocityY);

    if (this.archetype.fireCooldown > 0) {
      this.fireTimer -= delta;
    }
  }

  canFire(): boolean {
    return this.archetype.fireCooldown > 0 && this.fireTimer <= 0;
  }

  resetFireTimer(): void {
    this.fireTimer = this.archetype.fireCooldown;
  }

  despawn(): void {
    this.setActive(false);
    this.setVisible(false);
    this.setVelocity(0, 0);
  }
}
