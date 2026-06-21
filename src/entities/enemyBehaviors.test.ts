import { describe, it, expect } from "vitest";
import { computeTargetHeading, turnTowardHeading, curvatureSpeedFactor, EnemyAiInput } from "./enemyBehaviors";
import { ENEMY_ARCHETYPES, ENEMY_AI } from "../config";

function input(overrides: Partial<EnemyAiInput> = {}): EnemyAiInput {
  return {
    heading: 0,
    lookaheadHeadingDeg: 0,
    toPlayerHeadingDeg: 0,
    distanceToPlayer: 1000,
    archetype: ENEMY_ARCHETYPES.chaser,
    ...overrides,
  };
}

describe("computeTargetHeading", () => {
  it("follows the track lookahead when the player is far away (chasesPlayer archetype)", () => {
    const target = computeTargetHeading(
      input({ archetype: ENEMY_ARCHETYPES.chaser, lookaheadHeadingDeg: 10, toPlayerHeadingDeg: 90, distanceToPlayer: 10000 })
    );
    expect(target).toBeCloseTo(10, 0);
  });

  it("blends strongly toward the player when close (chasesPlayer archetype)", () => {
    const target = computeTargetHeading(
      input({ archetype: ENEMY_ARCHETYPES.chaser, lookaheadHeadingDeg: 0, toPlayerHeadingDeg: 90, distanceToPlayer: 10 })
    );
    expect(target).toBeGreaterThan(30);
  });

  it("bomber also chases (chasesPlayer: true)", () => {
    const target = computeTargetHeading(
      input({ archetype: ENEMY_ARCHETYPES.bomber, lookaheadHeadingDeg: 0, toPlayerHeadingDeg: 90, distanceToPlayer: 10 })
    );
    expect(target).toBeGreaterThan(0);
  });

  it("shooter steers away from the player when too close, otherwise just follows the track", () => {
    const close = computeTargetHeading(
      input({ archetype: ENEMY_ARCHETYPES.shooter, lookaheadHeadingDeg: 0, toPlayerHeadingDeg: 90, distanceToPlayer: 10 })
    );
    const far = computeTargetHeading(
      input({ archetype: ENEMY_ARCHETYPES.shooter, lookaheadHeadingDeg: 5, toPlayerHeadingDeg: 90, distanceToPlayer: 1000 })
    );
    expect(close).toBeLessThan(0); // pulled toward -90 (away from player)
    expect(far).toBeCloseTo(5, 0); // unaffected, just the track target
  });

  it("heavy ignores the player entirely (no chase, no distance-keeping)", () => {
    const target = computeTargetHeading(
      input({ archetype: ENEMY_ARCHETYPES.heavy, lookaheadHeadingDeg: 15, toPlayerHeadingDeg: 90, distanceToPlayer: 10 })
    );
    expect(target).toBeCloseTo(15, 0);
  });

  it("ignores a rival outside the avoidance radius", () => {
    const target = computeTargetHeading(
      input({
        archetype: ENEMY_ARCHETYPES.heavy,
        lookaheadHeadingDeg: 0,
        awayFromNearestRivalDeg: 90,
        nearestRivalDist: ENEMY_AI.avoidanceRadius + 50,
      })
    );
    expect(target).toBeCloseTo(0, 0);
  });

  it("a passive (high-avoidanceWeight) archetype steers hard away from a close rival", () => {
    const target = computeTargetHeading(
      input({
        archetype: ENEMY_ARCHETYPES.shooter,
        lookaheadHeadingDeg: 0,
        awayFromNearestRivalDeg: 90,
        nearestRivalDist: 20,
      })
    );
    expect(target).toBeGreaterThan(40);
  });

  it("heavy barely avoids a close rival, consistent with its low avoidanceWeight", () => {
    const target = computeTargetHeading(
      input({
        archetype: ENEMY_ARCHETYPES.heavy,
        lookaheadHeadingDeg: 0,
        awayFromNearestRivalDeg: 90,
        nearestRivalDist: 20,
      })
    );
    expect(target).toBeGreaterThan(0);
    expect(target).toBeLessThan(10);
  });

  it("an aggressive (chasing) archetype only weakly avoids a close rival", () => {
    const chasing = computeTargetHeading(
      input({ archetype: ENEMY_ARCHETYPES.chaser, lookaheadHeadingDeg: 0, toPlayerHeadingDeg: 90, distanceToPlayer: 10 })
    );
    const withRival = computeTargetHeading(
      input({
        archetype: ENEMY_ARCHETYPES.chaser,
        lookaheadHeadingDeg: 0,
        toPlayerHeadingDeg: 90,
        distanceToPlayer: 10,
        awayFromNearestRivalDeg: -90,
        nearestRivalDist: 20,
      })
    );
    expect(withRival).toBeLessThan(chasing); // pulled down somewhat by avoidance
    expect(withRival).toBeGreaterThan(0); // but still net-positive (toward the player)
  });
});

describe("computeTargetHeading: pinned against a canyon wall", () => {
  // Regression test for a real bug: a car pinned against a wall with a
  // chase/avoid pull aimed back into the wall it's already stuck against
  // had no way back onto the road — and if that pull kept moving (the
  // player driving past/around it), the car would visibly spin in place
  // chasing a target it could never reach. `atWall` should override the
  // chase/avoid blending entirely, not just weight it down.
  it("ignores a chase pull toward the player and returns the track heading instead", () => {
    const target = computeTargetHeading(
      input({ archetype: ENEMY_ARCHETYPES.chaser, lookaheadHeadingDeg: 10, toPlayerHeadingDeg: 170, distanceToPlayer: 10, atWall: true })
    );
    expect(target).toBeCloseTo(10, 0);
  });

  it("ignores a nearest-rival avoidance pull as well", () => {
    const target = computeTargetHeading(
      input({
        archetype: ENEMY_ARCHETYPES.shooter,
        lookaheadHeadingDeg: -20,
        awayFromNearestRivalDeg: 150,
        nearestRivalDist: 20,
        atWall: true,
      })
    );
    expect(target).toBeCloseTo(-20, 0);
  });
});

describe("turnTowardHeading", () => {
  it("moves toward the target by at most maxDeltaDeg", () => {
    expect(turnTowardHeading(0, 100, 10)).toBe(10);
  });

  it("snaps exactly to the target if within range", () => {
    expect(turnTowardHeading(0, 5, 10)).toBe(5);
  });

  it("turns via the shortest rotational direction", () => {
    expect(turnTowardHeading(170, -170, 10)).toBeCloseTo(180, 5);
  });

  it("is a no-op once already at the target", () => {
    expect(turnTowardHeading(50, 50, 10)).toBe(50);
  });
});

describe("curvatureSpeedFactor", () => {
  it("is 1 (full speed) heading straight toward the lookahead target", () => {
    expect(curvatureSpeedFactor(0, 0)).toBeCloseTo(1);
  });

  it("drops toward minSpeedFactor for a sharp upcoming bend", () => {
    const factor = curvatureSpeedFactor(0, ENEMY_AI.curvatureSlowdown.maxAngleDeg);
    expect(factor).toBeCloseTo(ENEMY_AI.curvatureSlowdown.minSpeedFactor, 2);
  });

  it("never drops below minSpeedFactor even for an extreme angle", () => {
    expect(curvatureSpeedFactor(0, 179)).toBeCloseTo(ENEMY_AI.curvatureSlowdown.minSpeedFactor, 2);
  });
});
