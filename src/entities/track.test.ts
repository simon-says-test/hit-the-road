import { describe, it, expect } from "vitest";
import { generateTrack, pointAt, nearestPoint, wallDistancesAt, createSeededRng } from "./track";
import { ROAD_WIDTH, WALLS } from "../config";

// Deterministic rng so generated-track tests are reproducible.
const seededRng = createSeededRng;

describe("generateTrack", () => {
  const track = generateTrack(seededRng(1));

  it("produces a non-trivial closed loop", () => {
    expect(track.samples.length).toBeGreaterThan(10);
    expect(track.totalLength).toBeGreaterThan(0);
    expect(track.pavedHalfWidth).toBeCloseTo(ROAD_WIDTH / 2);
  });

  it("wraps pointAt back to the start after one full lap", () => {
    const start = pointAt(track, 0);
    const wrapped = pointAt(track, track.totalLength);
    expect(wrapped.x).toBeCloseTo(start.x, 1);
    expect(wrapped.y).toBeCloseTo(start.y, 1);
  });

  it("keeps every sample within the computed bounds", () => {
    for (const sample of track.samples) {
      expect(sample.x).toBeGreaterThanOrEqual(track.bounds.minX);
      expect(sample.x).toBeLessThanOrEqual(track.bounds.maxX);
      expect(sample.y).toBeGreaterThanOrEqual(track.bounds.minY);
      expect(sample.y).toBeLessThanOrEqual(track.bounds.maxY);
    }
  });
});

describe("nearestPoint", () => {
  const track = generateTrack(seededRng(2));

  it("finds ~zero offset and distance exactly on the centerline", () => {
    const sample = track.samples[5];
    const result = nearestPoint(track, sample.x, sample.y);
    expect(result.distance).toBeLessThan(1);
    expect(Math.abs(result.lateralOffset)).toBeLessThan(1);
  });

  it("reports a positive lateral offset to the right of travel direction", () => {
    const sample = track.samples[5];
    const normalRightX = Math.cos(sample.headingRad);
    const normalRightY = Math.sin(sample.headingRad);
    const probeX = sample.x + normalRightX * 15;
    const probeY = sample.y + normalRightY * 15;
    const result = nearestPoint(track, probeX, probeY);
    expect(result.lateralOffset).toBeGreaterThan(10);
  });

  it("reports a negative lateral offset to the left of travel direction", () => {
    const sample = track.samples[5];
    const normalRightX = Math.cos(sample.headingRad);
    const normalRightY = Math.sin(sample.headingRad);
    const probeX = sample.x - normalRightX * 15;
    const probeY = sample.y - normalRightY * 15;
    const result = nearestPoint(track, probeX, probeY);
    expect(result.lateralOffset).toBeLessThan(-10);
  });
});

describe("wallDistancesAt", () => {
  const track = generateTrack(seededRng(3));
  const pavedHalfWidth = track.pavedHalfWidth;

  it("keeps each wall's distance from the centerline within [pavedHalfWidth + minOffset, pavedHalfWidth + maxOffset]", () => {
    for (let s = -5000; s <= 5000; s += 137) {
      const { leftWallDist, rightWallDist } = wallDistancesAt(track, s);
      expect(leftWallDist).toBeGreaterThanOrEqual(pavedHalfWidth + WALLS.minOffset - 1e-6);
      expect(leftWallDist).toBeLessThanOrEqual(pavedHalfWidth + WALLS.maxOffset + 1e-6);
      expect(rightWallDist).toBeGreaterThanOrEqual(pavedHalfWidth + WALLS.minOffset - 1e-6);
      expect(rightWallDist).toBeLessThanOrEqual(pavedHalfWidth + WALLS.maxOffset + 1e-6);
    }
  });

  it("is periodic in arc length (same shape repeats)", () => {
    const periodLeft = (2 * Math.PI) / WALLS.meanderFreqLeft;
    const a = wallDistancesAt(track, 321);
    const b = wallDistancesAt(track, 321 + periodLeft);
    expect(b.leftWallDist).toBeCloseTo(a.leftWallDist, 3);
  });

  it("left and right walls don't move in lockstep (different freq/phase)", () => {
    const a = wallDistancesAt(track, 0);
    const b = wallDistancesAt(track, 400);
    const leftDelta = b.leftWallDist - a.leftWallDist;
    const rightDelta = b.rightWallDist - a.rightWallDist;
    expect(leftDelta).not.toBeCloseTo(rightDelta, 3);
  });
});

describe("nearestPoint with hintS (continuity across the start/finish seam)", () => {
  const track = generateTrack(seededRng(4));

  it("without a hint, s=0 and s=totalLength can both be reported for the same seam point", () => {
    // This is the exact scenario that motivates hintS: the seam is a real
    // ambiguity, not a bug to "fix" away in the unhinted result.
    const start = pointAt(track, 0);
    const q = nearestPoint(track, start.x, start.y);
    expect(q.s === 0 || q.s === track.totalLength || Math.abs(q.s - track.totalLength) < 1e-6).toBe(true);
  });

  it("with a hint near totalLength, resolves a seam point continuously instead of snapping to 0", () => {
    const start = pointAt(track, 0);
    const hint = track.totalLength - 0.001;
    const q = nearestPoint(track, start.x, start.y, hint);
    expect(Math.abs(q.s - hint)).toBeLessThan(track.totalLength / 2);
    expect(q.s).toBeCloseTo(track.totalLength, 1);
  });

  it("tracks forward progress across the seam as a small continuous increase, not a jump", () => {
    let hint = track.totalLength - 5;
    const justBefore = pointAt(track, track.totalLength - 5);
    let s = nearestPoint(track, justBefore.x, justBefore.y, hint).s;
    hint = s;
    const justAfter = pointAt(track, 5);
    s = nearestPoint(track, justAfter.x, justAfter.y, hint).s;
    expect(s).toBeGreaterThan(hint);
    expect(s - hint).toBeLessThan(20);
  });
});
