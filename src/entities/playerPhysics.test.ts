import { describe, it, expect } from "vitest";
import { computeDrive, PlayerDriveInput, PlayerDriveState } from "./playerPhysics";
import { PLAYER_HANDLING, DRIFT, OIL_SLICK } from "../config";

function state(overrides: Partial<PlayerDriveState> = {}): PlayerDriveState {
  return { forwardSpeed: 0, headingDeg: 0, velocityHeadingDeg: 0, ...overrides };
}

function input(overrides: Partial<PlayerDriveInput> = {}): PlayerDriveInput {
  return { accelerate: false, brake: false, left: false, right: false, drift: false, ...overrides };
}

describe("computeDrive: speed", () => {
  it("accelerates forward speed while accelerate is held", () => {
    const result = computeDrive(state(), input({ accelerate: true }), 0.1);
    expect(result.forwardSpeed).toBeGreaterThan(0);
  });

  it("brakes a forward-moving car before reversing", () => {
    const result = computeDrive(state({ forwardSpeed: 50 }), input({ brake: true }), 0.1);
    expect(result.forwardSpeed).toBeLessThan(50);
  });

  it("coasts toward zero with no input", () => {
    const result = computeDrive(state({ forwardSpeed: 100 }), input(), 0.1);
    expect(result.forwardSpeed).toBeLessThan(100);
    expect(result.forwardSpeed).toBeGreaterThan(0);
  });

  it("caps forward speed at a temporary override (speed boost / damage slow)", () => {
    const result = computeDrive(state({ forwardSpeed: 500 }), input({ accelerate: true }), 1, 510);
    expect(result.forwardSpeed).toBeLessThanOrEqual(510);
  });
});

describe("computeDrive: steering changes heading, not lateral position", () => {
  it("turns the heading clockwise (positive) when steering right", () => {
    const result = computeDrive(state({ forwardSpeed: 300 }), input({ right: true }), 0.2);
    expect(result.headingDeg).toBeGreaterThan(0);
  });

  it("turns the heading counter-clockwise (negative) when steering left", () => {
    const result = computeDrive(state({ forwardSpeed: 300 }), input({ left: true }), 0.2);
    expect(result.headingDeg).toBeLessThan(0);
  });

  it("turns faster at high speed than at low speed", () => {
    const slow = computeDrive(state({ forwardSpeed: 30 }), input({ right: true }), 0.1);
    const fast = computeDrive(state({ forwardSpeed: PLAYER_HANDLING.maxForwardSpeed }), input({ right: true }), 0.1);
    expect(fast.headingDeg).toBeGreaterThan(slow.headingDeg);
  });

  it("flips turn direction while reversing, like backing up a real car", () => {
    const result = computeDrive(state({ forwardSpeed: -100 }), input({ right: true }), 0.2);
    expect(result.headingDeg).toBeLessThan(0);
  });
});

describe("computeDrive: drift", () => {
  it("requires steering above the minimum drift speed to engage", () => {
    const tooSlow = computeDrive(state({ forwardSpeed: 10 }), input({ right: true, drift: true }), 0.1);
    expect(tooSlow.drifting).toBe(false);
    const fastEnough = computeDrive(
      state({ forwardSpeed: DRIFT.minSpeedToDrift + 50 }),
      input({ right: true, drift: true }),
      0.1
    );
    expect(fastEnough.drifting).toBe(true);
  });

  it("turns the heading faster while drifting than while gripping", () => {
    const speed = DRIFT.minSpeedToDrift + 100;
    const gripping = computeDrive(state({ forwardSpeed: speed }), input({ right: true }), 0.1);
    const drifting = computeDrive(state({ forwardSpeed: speed }), input({ right: true, drift: true }), 0.1);
    expect(drifting.headingDeg).toBeGreaterThan(gripping.headingDeg);
  });

  it("lets velocity direction lag behind heading while drifting (a slide)", () => {
    const speed = DRIFT.minSpeedToDrift + 100;
    const result = computeDrive(state({ forwardSpeed: speed }), input({ right: true, drift: true }), 0.1);
    expect(result.velocityHeadingDeg).toBeGreaterThan(0);
    expect(result.velocityHeadingDeg).toBeLessThan(result.headingDeg);
  });

  it("snaps velocity direction to heading much faster while gripping (no drift)", () => {
    const speed = DRIFT.minSpeedToDrift + 100;
    const drifting = computeDrive(state({ forwardSpeed: speed }), input({ right: true, drift: true }), 0.1);
    const gripping = computeDrive(state({ forwardSpeed: speed }), input({ right: true }), 0.1);
    const driftCatchUpFraction = drifting.velocityHeadingDeg / drifting.headingDeg;
    const gripCatchUpFraction = gripping.velocityHeadingDeg / gripping.headingDeg;
    expect(gripCatchUpFraction).toBeGreaterThan(driftCatchUpFraction);
  });
});

describe("computeDrive: terrain", () => {
  it("applies extra drag off-road", () => {
    const onRoad = computeDrive(state({ forwardSpeed: 400 }), input({ lateralOffset: 0, pavedHalfWidth: 180 }), 0.1);
    const offRoad = computeDrive(
      state({ forwardSpeed: 400 }),
      input({ lateralOffset: 200, pavedHalfWidth: 180 }),
      0.1
    );
    expect(offRoad.isOffRoad).toBe(true);
    expect(offRoad.forwardSpeed).toBeLessThan(onRoad.forwardSpeed);
  });

  it("applies extra drag on rough terrain", () => {
    const clean = computeDrive(state({ forwardSpeed: 400 }), input(), 0.1);
    const rough = computeDrive(state({ forwardSpeed: 400 }), input({ onRoughTerrain: true }), 0.1);
    expect(rough.forwardSpeed).toBeLessThan(clean.forwardSpeed);
  });

  it("reduces turn authority and biases velocity direction while oil-slicked", () => {
    const result = computeDrive(
      state({ forwardSpeed: 300 }),
      input({ accelerate: true, oilSlicked: true, oilDriftBias: 1 }),
      0.1
    );
    // No steering input, so heading itself doesn't move...
    expect(result.headingDeg).toBe(0);
    // ...but the positive bias should still push velocity direction positive.
    expect(result.velocityHeadingDeg).toBeGreaterThan(0);
  });

  it("pushes the opposite way with a flipped oil-slick bias, and not at all with a zero bias", () => {
    const positive = computeDrive(state({ forwardSpeed: 300 }), input({ oilSlicked: true, oilDriftBias: 1 }), 0.1);
    const negative = computeDrive(state({ forwardSpeed: 300 }), input({ oilSlicked: true, oilDriftBias: -1 }), 0.1);
    const zero = computeDrive(state({ forwardSpeed: 300 }), input({ oilSlicked: true, oilDriftBias: 0 }), 0.1);
    expect(positive.velocityHeadingDeg).toBeGreaterThan(0);
    expect(negative.velocityHeadingDeg).toBeLessThan(0);
    expect(zero.velocityHeadingDeg).toBe(0);
  });

  it("reduces steering turn rate while oil-slicked", () => {
    const speed = 300;
    const normal = computeDrive(state({ forwardSpeed: speed }), input({ right: true }), 0.1);
    const slicked = computeDrive(state({ forwardSpeed: speed }), input({ right: true, oilSlicked: true }), 0.1);
    expect(slicked.headingDeg).toBeLessThan(normal.headingDeg);
    expect(slicked.headingDeg).toBeCloseTo(normal.headingDeg * OIL_SLICK.controlMultiplier, 3);
  });
});

describe("computeDrive: canyon walls", () => {
  it("flags wall contact and applies extra drag beyond the wall distance", () => {
    const clean = computeDrive(state({ forwardSpeed: 400 }), input({ lateralOffset: 0, rightWallDist: 200 }), 0.1);
    const atWall = computeDrive(state({ forwardSpeed: 400 }), input({ lateralOffset: 210, rightWallDist: 200 }), 0.1);
    expect(clean.atWall).toBe(false);
    expect(atWall.atWall).toBe(true);
    expect(atWall.forwardSpeed).toBeLessThan(clean.forwardSpeed);
  });

  it("doesn't flag wall contact on the opposite side", () => {
    const result = computeDrive(
      state({ forwardSpeed: 400 }),
      input({ lateralOffset: -210, rightWallDist: 200, leftWallDist: 250 }),
      0.1
    );
    expect(result.atWall).toBe(false);
  });
});

describe("computeDrive: velocity vector", () => {
  it("derives (vx, vy) from velocity heading and speed, matching the canvas-angle convention", () => {
    const result = computeDrive(state({ forwardSpeed: 100 }), input(), 0.1);
    // headingDeg 0 = straight up = (vx 0, vy negative).
    expect(result.vx).toBeCloseTo(0, 5);
    expect(result.vy).toBeLessThan(0);
  });
});
