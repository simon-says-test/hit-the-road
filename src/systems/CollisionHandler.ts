import Phaser from "phaser";
import { PlayerCar } from "../entities/PlayerCar";
import { EnemyCar } from "../entities/EnemyCar";
import { COLLISION_SHUNT } from "../config";

// Pure damage/physics-resolution math, shared by every way an enemy can
// take a hit (ram, weapon, hazard) — GameScene still owns the *consequences*
// of a kill (sfx, explosion, despawn) since those touch scene-level
// concerns this class has no business depending on.
export class CollisionHandler {
  // Applies a discrete hit to an enemy: damage, then either the post-hit
  // speed-slow debuff (survived) or nothing further (caller handles the
  // kill). Returns true if this hit destroyed the enemy.
  damageEnemy(enemy: EnemyCar, amount: number): boolean {
    const dead = enemy.takeDamage(amount);
    if (!dead) enemy.applyDamageSlow();
    return dead;
  }

  // Ramming an enemy no longer costs the player health directly — it knocks
  // the player's speed around, scaled by the actual relative closing speed
  // of the impact, and damages the enemy by the same impact magnitude (see
  // COLLISION_SHUNT in config.ts). Returns true if the enemy died.
  resolveRamCollision(player: PlayerCar, enemy: EnemyCar): boolean {
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const enemyVelocity = (enemy.body as Phaser.Physics.Arcade.Body).velocity;
    const playerVelocity = (player.body as Phaser.Physics.Arcade.Body).velocity;
    const closingSpeed = -((enemyVelocity.x - playerVelocity.x) * dx + (enemyVelocity.y - playerVelocity.y) * dy) / dist;
    const magnitude = Math.max(COLLISION_SHUNT.minShunt, Math.abs(closingSpeed) * COLLISION_SHUNT.speedFactor);

    // Direction: push the player forward if the enemy caught up from behind
    // (relative to the player's own heading), backward if the player drove
    // into the back of the enemy.
    const headingRad = (player.heading * Math.PI) / 180;
    const forwardDot = dx * Math.sin(headingRad) - dy * Math.cos(headingRad);
    const direction = forwardDot < 0 ? 1 : -1;
    player.applyImpactShunt(direction * magnitude);
    enemy.ramCooldown = COLLISION_SHUNT.ramCooldownMs;

    return this.damageEnemy(enemy, magnitude * COLLISION_SHUNT.ramDamageFactor);
  }
}
