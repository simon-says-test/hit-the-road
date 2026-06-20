import { PLAYER_HANDLING, ROAD_X, ROAD_WIDTH, DRIFT, ROUGH_TERRAIN, OIL_SLICK } from "../config";

export interface PlayerDriveInput {
  accelerate: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  drift: boolean;
  // Driving over a rough-road/oil-slick terrain hazard (see Hazard.ts) —
  // optional so existing call sites/tests that don't care about terrain
  // can omit them and get the unaffected default.
  onRoughTerrain?: boolean;
  oilSlicked?: boolean;
  // A single value in [-1, 1] rolled once per oil-slick activation (see
  // OIL_SLICK in config.ts for why it's not re-rolled every frame) — the
  // direction/strength of the sideways slide while oilSlicked is true.
  // Meaningless when oilSlicked is false.
  oilDriftBias?: number;
}

export interface PlayerDriveResult {
  forwardSpeed: number;
  lateralVelocity: number;
  isOffRoad: boolean;
  drifting: boolean;
}

export function computeDrive(
  forwardSpeed: number,
  x: number,
  input: PlayerDriveInput,
  dt: number,
  maxForwardSpeedOverride?: number
): PlayerDriveResult {
  const {
    acceleration,
    brakeDeceleration,
    reverseAcceleration,
    coastFriction,
    maxReverseSpeed,
    minTurnSpeed,
    maxTurnSpeed,
    offroadDrag,
  } = PLAYER_HANDLING;
  const maxForwardSpeed = maxForwardSpeedOverride ?? PLAYER_HANDLING.maxForwardSpeed;

  let speed = forwardSpeed;

  if (input.accelerate) {
    speed += acceleration * dt;
  } else if (input.brake) {
    speed -= (speed > 0 ? brakeDeceleration : reverseAcceleration) * dt;
  } else {
    speed = decayTowardZero(speed, coastFriction * dt);
  }

  const isOffRoad = x < ROAD_X || x > ROAD_X + ROAD_WIDTH;
  if (isOffRoad) {
    speed = decayTowardZero(speed, offroadDrag * dt);
  }
  if (input.onRoughTerrain) {
    speed = decayTowardZero(speed, ROUGH_TERRAIN.dragPerSecond * dt);
  }

  const isSteering = input.left || input.right;
  const drifting = input.drift && isSteering && Math.abs(speed) >= DRIFT.minSpeedToDrift;
  if (drifting) {
    speed = decayTowardZero(speed, DRIFT.speedDrainPerSecond * dt);
  }

  speed = clamp(speed, -maxReverseSpeed, maxForwardSpeed);

  const speedRatio = Math.abs(speed) / maxForwardSpeed;
  let turnSpeed = lerp(minTurnSpeed, maxTurnSpeed, speedRatio);
  if (drifting) {
    turnSpeed *= DRIFT.turnMultiplier;
  }
  if (input.oilSlicked) {
    turnSpeed *= OIL_SLICK.controlMultiplier;
  }
  let lateralVelocity = input.left ? -turnSpeed : input.right ? turnSpeed : 0;
  if (input.oilSlicked) {
    lateralVelocity += (input.oilDriftBias ?? 0) * OIL_SLICK.driftStrength;
  }

  return { forwardSpeed: speed, lateralVelocity, isOffRoad, drifting };
}

function decayTowardZero(value: number, amount: number): number {
  if (value > 0) return Math.max(0, value - amount);
  if (value < 0) return Math.min(0, value + amount);
  return 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}
