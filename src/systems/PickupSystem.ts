import Phaser from "phaser";
import { Pickup, PickupType } from "../entities/Pickup";
import { PlayerCar } from "../entities/PlayerCar";
import { Track, pointAt } from "../entities/track";
import { PICKUPS, HAZARDS, VISUAL_TINTS, WeaponId, nextCrateIntervalMs } from "../config";

const PICKUP_TYPES: PickupType[] = ["health", "ammo", "boost-score", "boost-speed"];
const AMMO_WEAPON_IDS: WeaponId[] = ["rocket", "sideguns", "turret"];
// Standalone crates never roll a boost — those stay a kill-drop flavor
// bonus (see CRATE_SPAWN in config.ts).
const CRATE_TYPES: PickupType[] = ["health", "ammo"];

interface ScoreMultiplierEffect {
  endsAt: number;
  multiplier: number;
}

// Owns the pickup pool: spawning a random drop on enemy kill, the
// independent timed standalone-crate spawn (see CRATE_SPAWN), applying a
// pickup's effect on collection, and the score-multiplier window that
// outlives the pickup object itself.
export class PickupSystem {
  private pickups: Phaser.Physics.Arcade.Group;
  private scoreMultiplier: ScoreMultiplierEffect | null = null;
  private crateTimer: number;

  constructor(private scene: Phaser.Scene, private track: Track, private rng: () => number = Math.random, maxPickups = 20) {
    this.pickups = scene.physics.add.group({ classType: Pickup, maxSize: maxPickups, runChildUpdate: false });
    this.crateTimer = nextCrateIntervalMs(this.rng);
  }

  getGroup(): Phaser.Physics.Arcade.Group {
    return this.pickups;
  }

  // Rolled once per enemy kill, through the same scene-seeded RNG every
  // other roll in this class uses (see GameScene.getSeedFromUrl) so a seeded
  // race gets reproducible drops too.
  spawnOnEnemyDestroy(x: number, y: number): void {
    if (this.rng() > PICKUPS.dropChanceOnKill) return;

    const type = PICKUP_TYPES[Math.floor(this.rng() * PICKUP_TYPES.length)];
    this.spawnPickup(type, x, y);
  }

  // Independent of kills — a health-or-ammo crate spawns down the road on
  // its own infrequent timer (see CRATE_SPAWN), a small trickle of supply so
  // a run isn't entirely dependent on landing kills. Call once per frame.
  private updateCrateSpawn(delta: number): void {
    this.crateTimer -= delta;
    if (this.crateTimer > 0) return;
    // Accumulate the remainder rather than resetting outright, so an
    // unusually large delta can't shorten the next interval.
    this.crateTimer += nextCrateIntervalMs(this.rng);

    const type = CRATE_TYPES[Math.floor(this.rng() * CRATE_TYPES.length)];
    const s = this.rng() * this.track.totalLength;
    const maxLateral = this.track.pavedHalfWidth - HAZARDS.lateralMargin;
    const lateral = (this.rng() * 2 - 1) * maxLateral;
    const point = pointAt(this.track, s);
    const nx = Math.cos(point.headingRad);
    const ny = Math.sin(point.headingRad);
    this.spawnPickup(type, point.x + nx * lateral, point.y + ny * lateral);
  }

  private spawnPickup(type: PickupType, x: number, y: number): void {
    const weaponType = type === "ammo" ? AMMO_WEAPON_IDS[Math.floor(this.rng() * AMMO_WEAPON_IDS.length)] : undefined;
    const texture = type === "boost-score" || type === "boost-speed" ? "pickup-boost" : `pickup-${type}`;

    const pickup = this.pickups.get(x, y, texture) as Pickup | null;
    if (!pickup) return;
    pickup.spawn(type, x, y, texture, weaponType);

    if (type === "health") {
      pickup.setBlendMode(Phaser.BlendModes.ADD);
      pickup.setTint(VISUAL_TINTS.healthPickup);
    } else if (type === "ammo") {
      pickup.setBlendMode(Phaser.BlendModes.NORMAL);
      pickup.setTint(VISUAL_TINTS.ammoPickup);
    } else {
      pickup.setBlendMode(Phaser.BlendModes.ADD);
      pickup.setTint(VISUAL_TINTS.boostPickup);
    }
  }

  handlePickupCollection(player: PlayerCar, pickup: Pickup): void {
    if (!pickup.active) return;
    switch (pickup.type) {
      case "health":
        player.heal(PICKUPS.healthRestore);
        break;
      case "ammo":
        if (pickup.weaponType) player.weapons.addAmmo(pickup.weaponType, PICKUPS.ammoRestore[pickup.weaponType]);
        break;
      case "boost-score":
        this.scoreMultiplier = { endsAt: this.scene.time.now + PICKUPS.scoreMultiplierDurationMs, multiplier: PICKUPS.scoreMultiplier };
        break;
      case "boost-speed":
        player.applySpeedBoost(PICKUPS.speedBoostDurationMs);
        break;
    }
    pickup.despawn();
  }

  // Clears an expired score multiplier and ticks the standalone-crate spawn
  // timer — call once per frame.
  update(delta: number): void {
    if (this.scoreMultiplier && this.scene.time.now >= this.scoreMultiplier.endsAt) {
      this.scoreMultiplier = null;
    }
    this.updateCrateSpawn(delta);
  }

  // 1 if no boost-score effect is active.
  getScoreMultiplier(): number {
    return this.scoreMultiplier?.multiplier ?? 1;
  }
}
