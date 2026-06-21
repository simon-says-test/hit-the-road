import { describe, it, expect } from "vitest";
import { WeaponController } from "./weapons";
import { WEAPONS, SIDE_GUN_SWEEP } from "../config";

const NO_HANDLING = { steering: false, offRoad: false, drifting: false };

describe("WeaponController", () => {
  it("defaults to rocket selected, with full ammo for every weapon", () => {
    const weapons = new WeaponController();
    expect(weapons.current).toBe("rocket");
    expect(weapons.getState("rocket").ammo).toBe(WEAPONS.rocket.maxAmmo);
    expect(weapons.getState("sideguns").ammo).toBe(WEAPONS.sideguns.maxAmmo);
    expect(weapons.getState("turret").ammo).toBe(WEAPONS.turret.maxAmmo);
  });

  it("select() switches the current weapon", () => {
    const weapons = new WeaponController();
    weapons.select("turret");
    expect(weapons.current).toBe("turret");
  });

  it("firing consumes ammo and enforces cooldown", () => {
    const weapons = new WeaponController();
    const first = weapons.tryFire("rocket");
    expect(first).not.toBeNull();
    expect(weapons.getState("rocket").ammo).toBe(WEAPONS.rocket.maxAmmo - 1);

    const blocked = weapons.tryFire("rocket");
    expect(blocked).toBeNull(); // still on cooldown

    weapons.update(WEAPONS.rocket.fireCooldown, NO_HANDLING);
    const second = weapons.tryFire("rocket");
    expect(second).not.toBeNull();
  });

  it("cannot fire with zero ammo", () => {
    const weapons = new WeaponController();
    for (let i = 0; i < WEAPONS.rocket.maxAmmo; i++) {
      weapons.tryFire("rocket");
      weapons.update(WEAPONS.rocket.fireCooldown, NO_HANDLING);
    }
    expect(weapons.getState("rocket").ammo).toBe(0);
    expect(weapons.tryFire("rocket")).toBeNull();
  });

  it("addAmmo refills but clamps to the weapon's max", () => {
    const weapons = new WeaponController();
    weapons.tryFire("rocket");
    weapons.addAmmo("rocket", 1);
    expect(weapons.getState("rocket").ammo).toBe(WEAPONS.rocket.maxAmmo);
    weapons.addAmmo("rocket", 100);
    expect(weapons.getState("rocket").ammo).toBe(WEAPONS.rocket.maxAmmo);
  });

  it("sideguns sweep angle stays within the configured range", () => {
    const weapons = new WeaponController();
    for (let i = 0; i < 200; i++) {
      weapons.update(50, NO_HANDLING);
      const angle = weapons.getState("sideguns").sweepAngleDeg;
      expect(angle).toBeGreaterThanOrEqual(-SIDE_GUN_SWEEP.maxAngleDeg);
      expect(angle).toBeLessThanOrEqual(SIDE_GUN_SWEEP.maxAngleDeg);
    }
  });

  it("turret instability rises with steering/off-road/drifting", () => {
    const weapons = new WeaponController();
    const baseline = weapons.getState("turret").turretSpreadDeg;
    for (let i = 0; i < 30; i++) weapons.update(50, { steering: true, offRoad: true, drifting: true });
    const agitated = weapons.getState("turret").turretSpreadDeg;
    expect(agitated).toBeGreaterThan(baseline);
  });

  it("turret instability also rises with speed and rough terrain, even without steering", () => {
    const weapons = new WeaponController();
    const baseline = weapons.getState("turret").turretSpreadDeg;
    for (let i = 0; i < 30; i++) weapons.update(50, { ...NO_HANDLING, speedFraction: 1, onRoughTerrain: true });
    expect(weapons.getState("turret").turretSpreadDeg).toBeGreaterThan(baseline);
  });

  it("rocket always fires dead ahead, regardless of speed or rough terrain", () => {
    const weapons = new WeaponController();
    for (let i = 0; i < 30; i++) weapons.update(50, NO_HANDLING);
    expect(weapons.tryFire("rocket")!.angleDeg).toBe(0);

    const shaky = new WeaponController();
    for (let i = 0; i < 30; i++) shaky.update(50, { ...NO_HANDLING, speedFraction: 1, onRoughTerrain: true });
    expect(shaky.tryFire("rocket")!.angleDeg).toBe(0);
  });

  it("side-gun sweep jitters more at speed/on rough terrain, even without steering", () => {
    const baseline = new WeaponController();
    const shaky = new WeaponController();
    // Both start from the same state, so any difference after a few steps
    // is purely from the speed/rough-terrain jitter term, not the shared
    // deterministic auto-sweep both also do.
    for (let i = 0; i < 10; i++) {
      baseline.update(50, NO_HANDLING);
      shaky.update(50, { ...NO_HANDLING, speedFraction: 1, onRoughTerrain: true });
    }
    expect(shaky.getState("sideguns").sweepAngleDeg).not.toBeCloseTo(baseline.getState("sideguns").sweepAngleDeg, 2);
  });
});
