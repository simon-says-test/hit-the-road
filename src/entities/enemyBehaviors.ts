import { EnemyArchetypeConfig, ENEMY_AI } from "../config";

export interface EnemyAiInput {
  enemyX: number;
  playerX: number;
  archetype: EnemyArchetypeConfig;
  // Closest other enemy currently on screen, if any — used to steer away
  // from traffic. dx is signed (other.x - enemyX); dist is full 2D distance,
  // since two cars can share an x but be far apart in y (not actually close).
  nearestRivalDx?: number;
  nearestRivalDist?: number;
}

const SHOOTER_PREFERRED_GAP_X = 90;
const SHOOTER_DRIFT_FACTOR = 0.4;

export function computeLateralVelocity(input: EnemyAiInput): number {
  const { enemyX, playerX, archetype, nearestRivalDx, nearestRivalDist } = input;
  const dx = playerX - enemyX;

  let base: number;
  if (archetype.chasesPlayer) {
    base = Math.sign(dx) * archetype.lateralSpeed;
  } else if (archetype.keepsDistance) {
    if (Math.abs(dx) < SHOOTER_PREFERRED_GAP_X) {
      base = -Math.sign(dx || 1) * archetype.lateralSpeed;
    } else {
      base = Math.sign(dx) * archetype.lateralSpeed * SHOOTER_DRIFT_FACTOR;
    }
  } else {
    base = 0;
  }

  if (
    nearestRivalDx === undefined ||
    nearestRivalDist === undefined ||
    nearestRivalDist >= ENEMY_AI.avoidanceRadius
  ) {
    return base;
  }

  // Steer away from whichever side the rival is on. Aggressive (ramming)
  // archetypes only weakly blend this in — they're trying to hit the
  // player, not dodge traffic, so a collision with another car is an
  // acceptable side effect rather than something they steer hard to avoid.
  const avoidance = -Math.sign(nearestRivalDx || 1) * archetype.lateralSpeed;
  const weight = archetype.chasesPlayer
    ? ENEMY_AI.aggressiveAvoidanceWeight
    : ENEMY_AI.passiveAvoidanceWeight;
  return base * (1 - weight) + avoidance * weight;
}

// Inertia for enemy steering: nudges the current lateral velocity toward
// the target each frame instead of snapping to it, so cars ease into lane
// changes (including avoidance swerves) rather than flicking sideways like
// a robot — reads more like a car being driven than a script chasing a point.
export function smoothLateralVelocity(current: number, target: number, smoothing: number): number {
  return current + (target - current) * smoothing;
}
