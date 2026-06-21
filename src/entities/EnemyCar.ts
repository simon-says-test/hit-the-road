import Phaser from "phaser";
import { computeTargetHeading, turnTowardHeading, curvatureSpeedFactor } from "./enemyBehaviors";
import { EnemyArchetypeConfig, CAR_SCALE, DEPTHS, COLLISION_SHUNT, DAMAGE_SLOW, WALLS, ROUGH_TERRAIN, OIL_SLICK, ENEMY_AI, wallImpactDamage } from "../config";

export interface NearestRival {
  awayFromNearestRivalDeg: number;
  dist: number;
}

export interface EnemyDriveParams {
  baseApproachSpeed: number;
  rubberBandMultiplier: number;
  playerX: number;
  playerY: number;
  delta: number;
  // Heading toward a point some distance ahead on the track centerline,
  // precomputed by the caller (GameScene, which has the Track) via
  // track.pointAt — see enemyBehaviors.ts for why this module takes the
  // angle rather than the point itself.
  lookaheadHeadingDeg: number;
  // This frame's position relative to the track centerline (see
  // entities/track.ts) — same wall/off-road inputs PlayerCar's drive
  // takes, just resolved into speed effects directly here instead of via
  // computeDrive, since enemies don't have a persistent forwardSpeed to
  // decay toward zero (their speed is recomputed fresh every frame).
  lateralOffset: number;
  pavedHalfWidth: number;
  leftWallDist: number;
  rightWallDist: number;
  rival?: NearestRival;
}

export class EnemyCar extends Phaser.Physics.Arcade.Image {
  archetype!: EnemyArchetypeConfig;
  health = 0;
  fireTimer = 0;
  ramCooldown = 0;
  // Ms remaining of a temporary top-speed cap from a discrete combat hit
  // (weapon damage or ram damage that didn't kill it — see applyDamageSlow).
  damageSlowTimer = 0;
  // Degrees, canvas-angle convention (0 = up, +clockwise) — same convention
  // PlayerCar's heading uses.
  heading = 0;
  // Set by GameScene's per-frame hazard overlap check (see updateRivals) —
  // same per-frame flag/timer pattern PlayerCar uses for the same hazards.
  onRoughTerrainThisFrame = false;
  oilSlickTimer = 0;
  // Rolled once per oil-slick activation (not every frame — see OIL_SLICK
  // in config.ts), held for the duration so the veer reads as a sustained
  // loss of control rather than a vibration.
  oilDriftBias = 0;
  // Tracks the previous frame's wall contact so damage is only applied on
  // the rising edge (see drive()'s wall-impact handling), not every frame
  // of continued contact.
  wasAtWall = false;
  // This frame's distance to the player, computed once in drive() (where
  // the player's position is already available) and reused by canFire() —
  // see ENEMY_AI.shooterFireRangePx for why a shooter shouldn't fire at any
  // distance.
  distanceToPlayer = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setScale(CAR_SCALE);
    this.setBounce(0.15);
    this.setDepth(DEPTHS.enemy);
  }

  spawn(archetype: EnemyArchetypeConfig, x: number, y: number, headingDeg: number): void {
    this.archetype = archetype;
    this.health = archetype.health;
    this.fireTimer = archetype.fireCooldown;
    this.ramCooldown = 0;
    this.damageSlowTimer = 0;
    this.onRoughTerrainThisFrame = false;
    this.oilSlickTimer = 0;
    this.oilDriftBias = 0;
    this.wasAtWall = false;
    this.distanceToPlayer = 0;
    this.heading = headingDeg;
    this.setTexture(archetype.texture);
    this.setPosition(x, y);
    this.setRotation((headingDeg * Math.PI) / 180);
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

  // Returns true if this frame's wall damage destroyed the car (caller is
  // responsible for the usual kill effects/cleanup, same as a weapon/ram
  // kill — see GameScene.updateRivals).
  drive(params: EnemyDriveParams): boolean {
    const { baseApproachSpeed, rubberBandMultiplier, playerX, playerY, delta, lookaheadHeadingDeg, lateralOffset, leftWallDist, rightWallDist, rival } =
      params;
    const dtSeconds = delta / 1000;
    if (this.damageSlowTimer > 0) {
      this.damageSlowTimer = Math.max(0, this.damageSlowTimer - delta);
    }
    if (this.oilSlickTimer > 0) {
      this.oilSlickTimer = Math.max(0, this.oilSlickTimer - delta);
    }

    // For a brief window right after ramming the player, ignore normal AI
    // and actively move away instead, along the real player→enemy vector —
    // without this, an enemy that survives a ram just gets driven straight
    // back into contact next frame, fighting the physics collider's
    // separation every step (see Collision shunt in high-level-design.md).
    if (this.ramCooldown > 0) {
      this.ramCooldown = Math.max(0, this.ramCooldown - delta);
      const dx = this.x - playerX;
      const dy = this.y - playerY;
      const dist = Math.max(1, Math.hypot(dx, dy));
      this.setVelocity((dx / dist) * COLLISION_SHUNT.recoilSpeed, (dy / dist) * COLLISION_SHUNT.recoilSpeed);
      this.heading = (Math.atan2(dx, -dy) * 180) / Math.PI;
      this.setRotation((this.heading * Math.PI) / 180);
      if (this.archetype.fireCooldown > 0) this.fireTimer -= delta;
      return false;
    }

    const toPlayerHeadingDeg = (Math.atan2(playerX - this.x, -(playerY - this.y)) * 180) / Math.PI;
    const distanceToPlayer = Math.hypot(playerX - this.x, playerY - this.y);
    this.distanceToPlayer = distanceToPlayer;

    const hitLeftWall = lateralOffset <= -leftWallDist;
    const hitRightWall = lateralOffset >= rightWallDist;
    const atWall = hitLeftWall || hitRightWall;

    const targetHeadingDeg = computeTargetHeading({
      heading: this.heading,
      lookaheadHeadingDeg,
      toPlayerHeadingDeg,
      distanceToPlayer,
      archetype: this.archetype,
      awayFromNearestRivalDeg: rival?.awayFromNearestRivalDeg,
      nearestRivalDist: rival?.dist,
      atWall,
    });
    const oilSlicked = this.oilSlickTimer > 0;
    const turnRateDeg = this.archetype.maxTurnRateDeg * (oilSlicked ? OIL_SLICK.controlMultiplier : 1);
    this.heading = turnTowardHeading(this.heading, targetHeadingDeg, turnRateDeg * dtSeconds);

    const wallMultiplier = atWall ? WALLS.enemySpeedMultiplier : 1;
    const damageSlowMultiplier = this.damageSlowTimer > 0 ? DAMAGE_SLOW.maxSpeedFactor : 1;
    const roughTerrainMultiplier = this.onRoughTerrainThisFrame ? ROUGH_TERRAIN.enemySpeedMultiplier : 1;
    const curveFactor = curvatureSpeedFactor(this.heading, lookaheadHeadingDeg);
    // Computed without wallMultiplier folded in — used below as the
    // "speed at impact" for one-time wall damage, so a wall hit is judged
    // by how fast the car was actually trying to go, not by the post-hit
    // speed the wall penalty has already reduced it to.
    const ownSpeedBeforeWall =
      baseApproachSpeed * this.archetype.speedMultiplier * rubberBandMultiplier * damageSlowMultiplier * roughTerrainMultiplier * curveFactor;
    const ownSpeed = ownSpeedBeforeWall * wallMultiplier;

    const headingRad = (this.heading * Math.PI) / 180;
    // Oil drift biases actual travel direction away from heading (a fixed
    // veer, not accumulated every frame) rather than the heading itself —
    // mirrors PlayerCar's velocityHeadingDeg model (see playerPhysics.ts).
    // Folding the bias into this.heading directly, as a prior version did,
    // added a constant offset every single frame for the ~1.4s the effect
    // lasts, which compounds into a continuous spin (a tight circle) rather
    // than a one-time veer.
    const velocityHeadingRad = oilSlicked ? headingRad + (this.oilDriftBias * OIL_SLICK.enemyDriftStrengthDeg * Math.PI) / 180 : headingRad;
    this.setVelocity(Math.sin(velocityHeadingRad) * ownSpeed, -Math.cos(velocityHeadingRad) * ownSpeed);
    this.setRotation(headingRad);

    if (this.archetype.fireCooldown > 0) {
      this.fireTimer -= delta;
    }

    // One-time damage on the frame contact begins, scaled by impact speed
    // (see wallImpactDamage in config.ts) — not per second of continued
    // contact, so scraping along a wall while finding your way back to the
    // road doesn't melt your health, only the initial hit does.
    let dead = false;
    if (atWall && !this.wasAtWall) {
      dead = this.takeDamage(wallImpactDamage(ownSpeedBeforeWall, WALLS.maxImpactDamageEnemy, baseApproachSpeed));
    }
    this.wasAtWall = atWall;
    return dead;
  }

  canFire(): boolean {
    return this.archetype.fireCooldown > 0 && this.fireTimer <= 0 && this.distanceToPlayer <= ENEMY_AI.shooterFireRangePx;
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
