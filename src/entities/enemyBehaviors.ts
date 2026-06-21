import { normalizeDeg, lerpAngleDeg, clamp01 } from "../utils/angle";
import { EnemyArchetypeConfig, ENEMY_AI } from "../config";

export interface EnemyAiInput {
  // Current heading (deg, canvas-angle convention: 0 = up, +clockwise).
  heading: number;
  // Heading toward a point some distance ahead on the track centerline —
  // the baseline "stay on the road" target every archetype steers toward
  // by default (see ENEMY_AI.lookaheadDistPx). Computed by the caller
  // (EnemyCar/GameScene, which has the Track) via plain atan2 — this module
  // stays Phaser/track-free by taking the angle, not the point.
  lookaheadHeadingDeg: number;
  // Heading directly toward the player's actual position, and the
  // straight-line distance to it — used by chasesPlayer/keepsDistance
  // archetypes to blend a pull toward (or away from) the player into the
  // track-following baseline.
  toPlayerHeadingDeg: number;
  distanceToPlayer: number;
  archetype: EnemyArchetypeConfig;
  // Heading directly away from whichever other rival is currently closest,
  // and that rival's distance — omitted entirely (not just far away) when
  // there's no other rival on the track at all (e.g. unit tests, or the
  // last rival standing).
  awayFromNearestRivalDeg?: number;
  nearestRivalDist?: number;
  // True while the car is pinned against a canyon wall (see WALLS in
  // config.ts) — escaping back onto the road overrides chase/avoid pulls
  // entirely rather than blending with them. Without this, a car wedged
  // against a wall with a chase or avoidance pull aimed back into the wall
  // (e.g. the player parked just inside it, or another rival blocking the
  // only way off) has no path back to the road and can get stuck there
  // indefinitely — or, if the pull keeps moving (an aggressor circling a
  // stuck car), spin in place chasing a target it can never reach.
  atWall?: boolean;
}



// Blends the track-following baseline with an archetype-specific pull
// toward/away from the player, then with a push away from the nearest
// rival — the 2D, track-aware equivalent of the old computeLateralVelocity,
// which only ever had to blend a lateral target with avoidance on a fixed
// lane. Returns a target heading; the caller rate-limits the car's actual
// heading toward it (see EnemyCar.drive), which is what gives steering its
// inertia now (a turn-rate cap, not an exponential smoothing factor).
export function computeTargetHeading(input: EnemyAiInput): number {
  const { archetype, lookaheadHeadingDeg, toPlayerHeadingDeg, distanceToPlayer } = input;
  if (input.atWall) return lookaheadHeadingDeg;

  let target = lookaheadHeadingDeg;

  if (archetype.chasesPlayer) {
    const proximity = clamp01(1 - distanceToPlayer / ENEMY_AI.chaseRange);
    target = lerpAngleDeg(target, toPlayerHeadingDeg, ENEMY_AI.chaseWeight * proximity);
  } else if (archetype.keepsDistance && distanceToPlayer < ENEMY_AI.shooterPreferredGapPx) {
    const awayFromPlayerDeg = normalizeDeg(toPlayerHeadingDeg + 180);
    target = lerpAngleDeg(target, awayFromPlayerDeg, ENEMY_AI.shooterAvoidWeight);
  }

  if (
    input.awayFromNearestRivalDeg !== undefined &&
    input.nearestRivalDist !== undefined &&
    input.nearestRivalDist < ENEMY_AI.avoidanceRadius
  ) {
    target = lerpAngleDeg(target, input.awayFromNearestRivalDeg, archetype.avoidanceWeight);
  }

  return target;
}

// Turns `current` toward `target` by at most `maxDeltaDeg`, via the
// shortest rotational direction — the rate-limited-turn equivalent of
// PlayerCar's own steering, which is what makes a rival's steering inertia
// consistent with the player's rather than a separate smoothing model.
export function turnTowardHeading(current: number, target: number, maxDeltaDeg: number): number {
  let diff = (target - current) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  const delta = Math.max(-maxDeltaDeg, Math.min(maxDeltaDeg, diff));
  return normalizeDeg(current + delta);
}

// Speed factor in [minSpeedFactor, 1], scaled by how sharp the upcoming
// bend is (the heading difference between a rival's current heading and
// its own track-lookahead target) — lets AI slow down for corners instead
// of taking every bend at a flat-out speed no turn rate could follow.
export function curvatureSpeedFactor(headingDeg: number, lookaheadHeadingDeg: number): number {
  let diff = (lookaheadHeadingDeg - headingDeg) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  const { maxAngleDeg, minSpeedFactor } = ENEMY_AI.curvatureSlowdown;
  const severity = clamp01(Math.abs(diff) / maxAngleDeg);
  return 1 - severity * (1 - minSpeedFactor);
}
