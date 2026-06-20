import { describe, it, expect } from "vitest";
import { computeDrive } from "./playerPhysics";
import { PLAYER_HANDLING, ROAD_X, ROAD_WIDTH, DRIFT } from "../config";

const ON_ROAD_X = ROAD_X + ROAD_WIDTH / 2;
const NO_INPUT = { accelerate: false, brake: false, left: false, right: false, drift: false };

describe("computeDrive", () => {
  it("accelerates forward while the accelerate input is held", () => {
    const { forwardSpeed } = computeDrive(0, ON_ROAD_X, { ...NO_INPUT, accelerate: true }, 1);
    expect(forwardSpeed).toBeCloseTo(PLAYER_HANDLING.acceleration);
  });

  it("clamps forward speed to the configured max", () => {
    const { forwardSpeed } = computeDrive(
      PLAYER_HANDLING.maxForwardSpeed,
      ON_ROAD_X,
      { ...NO_INPUT, accelerate: true },
      1
    );
    expect(forwardSpeed).toBe(PLAYER_HANDLING.maxForwardSpeed);
  });

  it("brakes toward zero when moving forward, then reverses past zero", () => {
    const braking = computeDrive(100, ON_ROAD_X, { ...NO_INPUT, brake: true }, 0.1);
    expect(braking.forwardSpeed).toBeCloseTo(100 - PLAYER_HANDLING.brakeDeceleration * 0.1);

    const reversing = computeDrive(0, ON_ROAD_X, { ...NO_INPUT, brake: true }, 0.1);
    expect(reversing.forwardSpeed).toBeCloseTo(-PLAYER_HANDLING.reverseAcceleration * 0.1);
  });

  it("clamps reverse speed to the configured max", () => {
    const { forwardSpeed } = computeDrive(
      -PLAYER_HANDLING.maxReverseSpeed,
      ON_ROAD_X,
      { ...NO_INPUT, brake: true },
      1
    );
    expect(forwardSpeed).toBe(-PLAYER_HANDLING.maxReverseSpeed);
  });

  it("coasts toward zero with no input, from both directions", () => {
    const fromForward = computeDrive(50, ON_ROAD_X, NO_INPUT, 1);
    expect(fromForward.forwardSpeed).toBe(Math.max(0, 50 - PLAYER_HANDLING.coastFriction));

    const fromReverse = computeDrive(-50, ON_ROAD_X, NO_INPUT, 1);
    expect(fromReverse.forwardSpeed).toBe(Math.min(0, -50 + PLAYER_HANDLING.coastFriction));
  });

  it("applies extra drag while off the paved road", () => {
    const offRoadX = ROAD_X - 10;
    const onRoad = computeDrive(100, ON_ROAD_X, NO_INPUT, 0.1);
    const offRoad = computeDrive(100, offRoadX, NO_INPUT, 0.1);
    expect(offRoad.forwardSpeed).toBeLessThan(onRoad.forwardSpeed);
  });

  it("scales turn authority with current speed", () => {
    const lowSpeed = computeDrive(0, ON_ROAD_X, { ...NO_INPUT, right: true }, 0);
    const highSpeed = computeDrive(PLAYER_HANDLING.maxForwardSpeed, ON_ROAD_X, { ...NO_INPUT, right: true }, 0);
    expect(lowSpeed.lateralVelocity).toBeCloseTo(PLAYER_HANDLING.minTurnSpeed);
    expect(highSpeed.lateralVelocity).toBeCloseTo(PLAYER_HANDLING.maxTurnSpeed);
    expect(highSpeed.lateralVelocity).toBeGreaterThan(lowSpeed.lateralVelocity);
  });

  it("steers left and right symmetrically, and not at all with no steering input", () => {
    const left = computeDrive(0, ON_ROAD_X, { ...NO_INPUT, left: true }, 0);
    const right = computeDrive(0, ON_ROAD_X, { ...NO_INPUT, right: true }, 0);
    const straight = computeDrive(0, ON_ROAD_X, NO_INPUT, 0);
    expect(left.lateralVelocity).toBe(-right.lateralVelocity);
    expect(straight.lateralVelocity).toBe(0);
  });

  it("drift only kicks in while steering above the minimum drift speed", () => {
    const aboveThreshold = DRIFT.minSpeedToDrift + 50;
    const belowThreshold = Math.max(0, DRIFT.minSpeedToDrift - 50);

    const notSteering = computeDrive(aboveThreshold, ON_ROAD_X, { ...NO_INPUT, drift: true }, 0.1);
    expect(notSteering.drifting).toBe(false);

    const tooSlow = computeDrive(belowThreshold, ON_ROAD_X, { ...NO_INPUT, drift: true, right: true }, 0.1);
    expect(tooSlow.drifting).toBe(false);

    const drifting = computeDrive(aboveThreshold, ON_ROAD_X, { ...NO_INPUT, drift: true, right: true }, 0.1);
    expect(drifting.drifting).toBe(true);
  });

  it("drifting sharpens turning but drains extra speed", () => {
    const speed = 300;
    const normal = computeDrive(speed, ON_ROAD_X, { ...NO_INPUT, right: true }, 0.1);
    const drifted = computeDrive(speed, ON_ROAD_X, { ...NO_INPUT, right: true, drift: true }, 0.1);
    expect(drifted.lateralVelocity).toBeGreaterThan(normal.lateralVelocity);
    expect(drifted.forwardSpeed).toBeLessThan(normal.forwardSpeed);
  });

  it("applies extra drag while on rough terrain", () => {
    const normal = computeDrive(100, ON_ROAD_X, NO_INPUT, 0.1);
    const onRough = computeDrive(100, ON_ROAD_X, { ...NO_INPUT, onRoughTerrain: true }, 0.1);
    expect(onRough.forwardSpeed).toBeLessThan(normal.forwardSpeed);
  });

  it("an oil slick reduces steering authority and adds a sustained drift bias", () => {
    const speed = 300;
    const normal = computeDrive(speed, ON_ROAD_X, { ...NO_INPUT, right: true }, 0.1);
    const slicked = computeDrive(speed, ON_ROAD_X, { ...NO_INPUT, right: true, oilSlicked: true, oilDriftBias: 1 }, 0.1);
    // Reduced authority means the drift-biased component differs from normal...
    expect(Math.abs(slicked.lateralVelocity - normal.lateralVelocity)).toBeGreaterThan(0);
    // ...and even with no steering input at all, a slicked car still gets
    // pushed sideways by its drift bias (loss of control), unlike a normal car.
    const noSteerNormal = computeDrive(speed, ON_ROAD_X, NO_INPUT, 0.1);
    const noSteerSlicked = computeDrive(speed, ON_ROAD_X, { ...NO_INPUT, oilSlicked: true, oilDriftBias: 1 }, 0.1);
    expect(noSteerNormal.lateralVelocity).toBe(0);
    expect(noSteerSlicked.lateralVelocity).toBeGreaterThan(0);
    // The bias is a fixed direction, not noise — flipping its sign flips the
    // resulting push, and a zero bias contributes nothing.
    const noSteerOppositeBias = computeDrive(speed, ON_ROAD_X, { ...NO_INPUT, oilSlicked: true, oilDriftBias: -1 }, 0.1);
    expect(noSteerOppositeBias.lateralVelocity).toBeLessThan(0);
    const noSteerZeroBias = computeDrive(speed, ON_ROAD_X, { ...NO_INPUT, oilSlicked: true, oilDriftBias: 0 }, 0.1);
    expect(noSteerZeroBias.lateralVelocity).toBe(0);
  });

  it("a temporary max-speed override allows exceeding the normal cap", () => {
    const boosted = computeDrive(
      PLAYER_HANDLING.maxForwardSpeed,
      ON_ROAD_X,
      { ...NO_INPUT, accelerate: true },
      1,
      PLAYER_HANDLING.maxForwardSpeed + 100
    );
    expect(boosted.forwardSpeed).toBeGreaterThan(PLAYER_HANDLING.maxForwardSpeed);
  });
});
