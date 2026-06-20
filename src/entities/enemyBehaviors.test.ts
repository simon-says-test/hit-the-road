import { describe, it, expect } from "vitest";
import { computeLateralVelocity, smoothLateralVelocity } from "./enemyBehaviors";
import { ENEMY_ARCHETYPES, ENEMY_AI } from "../config";

describe("computeLateralVelocity", () => {
  it("chaser steers toward the player", () => {
    const left = computeLateralVelocity({ enemyX: 100, playerX: 200, archetype: ENEMY_ARCHETYPES.chaser });
    const right = computeLateralVelocity({ enemyX: 200, playerX: 100, archetype: ENEMY_ARCHETYPES.chaser });
    expect(left).toBeGreaterThan(0);
    expect(right).toBeLessThan(0);
    expect(Math.abs(left)).toBe(ENEMY_ARCHETYPES.chaser.lateralSpeed);
  });

  it("bomber also chases (chasesPlayer: true)", () => {
    const v = computeLateralVelocity({ enemyX: 100, playerX: 200, archetype: ENEMY_ARCHETYPES.bomber });
    expect(v).toBeGreaterThan(0);
  });

  it("shooter backs away when too close, drifts toward when far", () => {
    const close = computeLateralVelocity({ enemyX: 195, playerX: 200, archetype: ENEMY_ARCHETYPES.shooter });
    const far = computeLateralVelocity({ enemyX: 0, playerX: 200, archetype: ENEMY_ARCHETYPES.shooter });
    expect(close).toBeLessThan(0); // player is to the right, shooter backs left
    expect(far).toBeGreaterThan(0); // player is to the right, shooter drifts right
  });

  it("heavy holds its lane (no chase, no distance-keeping)", () => {
    const v = computeLateralVelocity({ enemyX: 100, playerX: 200, archetype: ENEMY_ARCHETYPES.heavy });
    expect(v).toBe(0);
  });

  it("ignores a rival outside the avoidance radius", () => {
    const withFarRival = computeLateralVelocity({
      enemyX: 100,
      playerX: 200,
      archetype: ENEMY_ARCHETYPES.heavy,
      nearestRivalDx: ENEMY_AI.avoidanceRadius + 50,
      nearestRivalDist: ENEMY_AI.avoidanceRadius + 50,
    });
    expect(withFarRival).toBe(0);
  });

  it("a passive archetype's avoidance pulls it away from a close rival", () => {
    // shooter drifts right when far from the player (player is to the
    // right); a rival close on its right should pull that hard back left.
    const noRival = computeLateralVelocity({ enemyX: 0, playerX: 200, archetype: ENEMY_ARCHETYPES.shooter });
    const withRivalOnRight = computeLateralVelocity({
      enemyX: 0,
      playerX: 200,
      archetype: ENEMY_ARCHETYPES.shooter,
      nearestRivalDx: 20,
      nearestRivalDist: 20,
    });
    expect(withRivalOnRight).toBeLessThan(noRival);
  });

  it("heavy has no lateral speed at all, so it can't avoid a rival either", () => {
    // Consistent with its spec flavor ("doesn't steer at all") — zero
    // lateralSpeed means the avoidance term is also zero, not just the base.
    const v = computeLateralVelocity({
      enemyX: 100,
      playerX: 100,
      archetype: ENEMY_ARCHETYPES.heavy,
      nearestRivalDx: 20,
      nearestRivalDist: 20,
    });
    expect(v).toBe(0);
  });

  it("an aggressive (chasing) archetype only weakly avoids a close rival", () => {
    // chaser wants to chase right (player is to the right); a rival to its
    // right should pull it left, but only a little — the chase pull mostly wins.
    const chasing = computeLateralVelocity({ enemyX: 100, playerX: 200, archetype: ENEMY_ARCHETYPES.chaser });
    const withRival = computeLateralVelocity({
      enemyX: 100,
      playerX: 200,
      archetype: ENEMY_ARCHETYPES.chaser,
      nearestRivalDx: 20,
      nearestRivalDist: 20,
    });
    expect(withRival).toBeGreaterThan(0); // still net-positive (toward player)
    expect(withRival).toBeLessThan(chasing); // but pulled down somewhat by avoidance
  });
});

describe("smoothLateralVelocity", () => {
  it("moves partway from current toward target, not all the way", () => {
    const next = smoothLateralVelocity(0, 100, 0.2);
    expect(next).toBeCloseTo(20);
    expect(next).toBeLessThan(100);
  });

  it("converges to the target over repeated steps", () => {
    let v = 0;
    for (let i = 0; i < 100; i++) v = smoothLateralVelocity(v, 100, 0.2);
    expect(v).toBeCloseTo(100, 1);
  });

  it("is a no-op once already at the target", () => {
    expect(smoothLateralVelocity(50, 50, 0.2)).toBe(50);
  });
});
