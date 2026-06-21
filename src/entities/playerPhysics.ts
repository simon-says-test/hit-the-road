import { PLAYER_HANDLING, DRIFT, ROUGH_TERRAIN, OIL_SLICK, WALLS } from "../config";

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
  // direction/strength of the velocity-heading bias while oilSlicked is
  // true. Meaningless when oilSlicked is false.
  oilDriftBias?: number;
  // This frame's position relative to the generated track's centerline
  // (see entities/track.ts's nearestPoint/wallDistancesAt) — optional so
  // existing call sites/tests that don't care about the track can omit
  // them and get the unaffected default (always on-road, never at a wall).
  lateralOffset?: number;
  pavedHalfWidth?: number;
  leftWallDist?: number;
  rightWallDist?: number;
}

export interface PlayerDriveState {
  forwardSpeed: number;
  // Degrees, canvas-angle convention (0 = up, positive = clockwise) shared
  // with the rest of the game's angle math.
  headingDeg: number;
  // The car's actual direction of travel, which lags behind headingDeg
  // while drifting/oil-slicked (see DRIFT.slipEase) instead of snapping to
  // it instantly — this is what makes a drift read as a slide rather than
  // just a sharper turn.
  velocityHeadingDeg: number;
}

export interface PlayerDriveResult extends PlayerDriveState {
  vx: number;
  vy: number;
  isOffRoad: boolean;
  drifting: boolean;
  atWall: boolean;
}

export function computeDrive(
  state: PlayerDriveState,
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
    minTurnRateDeg,
    maxTurnRateDeg,
    offroadDrag,
    velocityGripEase,
  } = PLAYER_HANDLING;
  const maxForwardSpeed = maxForwardSpeedOverride ?? PLAYER_HANDLING.maxForwardSpeed;

  let speed = state.forwardSpeed;

  if (input.accelerate) {
    speed += acceleration * dt;
  } else if (input.brake) {
    speed -= (speed > 0 ? brakeDeceleration : reverseAcceleration) * dt;
  } else {
    speed = decayTowardZero(speed, coastFriction * dt);
  }

  const isOffRoad = input.pavedHalfWidth !== undefined && Math.abs(input.lateralOffset ?? 0) > input.pavedHalfWidth;
  if (isOffRoad) {
    speed = decayTowardZero(speed, offroadDrag * dt);
  }
  if (input.onRoughTerrain) {
    speed = decayTowardZero(speed, ROUGH_TERRAIN.dragPerSecond * dt);
  }

  const lateralOffset = input.lateralOffset ?? 0;
  const atWall =
    (input.leftWallDist !== undefined && lateralOffset <= -input.leftWallDist) ||
    (input.rightWallDist !== undefined && lateralOffset >= input.rightWallDist);
  if (atWall) {
    speed = decayTowardZero(speed, WALLS.dragPerSecondPlayer * dt);
  }

  const isSteering = input.left || input.right;
  const drifting = input.drift && isSteering && Math.abs(speed) >= DRIFT.minSpeedToDrift;
  if (drifting) {
    speed = decayTowardZero(speed, DRIFT.speedDrainPerSecond * dt);
  }

  speed = clamp(speed, -maxReverseSpeed, maxForwardSpeed);

  const speedRatio = Math.abs(speed) / maxForwardSpeed;
  let turnRateDeg = lerp(minTurnRateDeg, maxTurnRateDeg, speedRatio);
  if (drifting) turnRateDeg *= DRIFT.turnMultiplier;
  if (input.oilSlicked) turnRateDeg *= OIL_SLICK.controlMultiplier;

  // Steering while reversing turns the car the opposite way relative to
  // heading, the same as backing up a real car — without this, reverse
  // steering would feel mirrored/wrong once the car can actually rotate.
  const reverseFlip = speed < 0 ? -1 : 1;
  const turnDirection = input.left ? -1 : input.right ? 1 : 0;
  const headingDeg = normalizeDeg(state.headingDeg + turnDirection * reverseFlip * turnRateDeg * dt);

  let velocityTargetDeg = headingDeg;
  let slipEase = velocityGripEase;
  if (input.oilSlicked) {
    velocityTargetDeg = headingDeg + (input.oilDriftBias ?? 0) * OIL_SLICK.driftStrengthDeg;
    slipEase = DRIFT.slipEase;
  } else if (drifting) {
    slipEase = DRIFT.slipEase;
  }
  const velocityHeadingDeg = lerpAngleDeg(state.velocityHeadingDeg, velocityTargetDeg, slipEase);

  const velocityHeadingRad = (velocityHeadingDeg * Math.PI) / 180;
  const vx = Math.sin(velocityHeadingRad) * speed;
  const vy = -Math.cos(velocityHeadingRad) * speed;

  return { forwardSpeed: speed, headingDeg, velocityHeadingDeg, vx, vy, isOffRoad, drifting, atWall };
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

function normalizeDeg(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

function lerpAngleDeg(a: number, b: number, t: number): number {
  let diff = (b - a) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return normalizeDeg(a + diff * t);
}
