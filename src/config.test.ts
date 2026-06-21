import { describe, it, expect } from "vitest";
import { wallImpactDamage, WALLS, nextCrateIntervalMs, CRATE_SPAWN } from "./config";

describe("wallImpactDamage", () => {
  it("deals no damage at or below the minimum impact speed", () => {
    expect(wallImpactDamage(WALLS.minImpactSpeed, 20, 600)).toBe(0);
    expect(wallImpactDamage(WALLS.minImpactSpeed - 50, 20, 600)).toBe(0);
  });

  it("scales linearly between the minimum impact speed and max speed", () => {
    const maxDamage = 20;
    const maxSpeed = 600;
    const midSpeed = (WALLS.minImpactSpeed + maxSpeed) / 2;
    const damage = wallImpactDamage(midSpeed, maxDamage, maxSpeed);
    expect(damage).toBeCloseTo(maxDamage / 2, 3);
  });

  it("caps at maxDamage for an impact at or beyond max speed", () => {
    expect(wallImpactDamage(600, 20, 600)).toBeCloseTo(20, 5);
    expect(wallImpactDamage(900, 20, 600)).toBe(20);
  });
});

describe("nextCrateIntervalMs", () => {
  it("stays within intervalMs +/- intervalJitterMs across the rng's full range", () => {
    expect(nextCrateIntervalMs(() => 0)).toBe(CRATE_SPAWN.intervalMs - CRATE_SPAWN.intervalJitterMs);
    expect(nextCrateIntervalMs(() => 1)).toBe(CRATE_SPAWN.intervalMs + CRATE_SPAWN.intervalJitterMs);
    expect(nextCrateIntervalMs(() => 0.5)).toBe(CRATE_SPAWN.intervalMs);
  });
});
