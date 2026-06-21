import { ROAD_WIDTH, TRACK_GEN, WALLS } from "../config";

export interface TrackPoint {
  x: number;
  y: number;
  // Canvas-angle convention shared with the rest of the game (0 = up,
  // positive = clockwise) — same convention PlayerCar's heading and the
  // weapon-aim math already use.
  headingRad: number;
}

interface TrackSample extends TrackPoint {
  s: number;
}

export interface Track {
  samples: TrackSample[];
  totalLength: number;
  pavedHalfWidth: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface TrackQueryResult {
  s: number;
  // Signed distance from the centerline, positive = right of the direction
  // of travel at that point, negative = left.
  lateralOffset: number;
  distance: number;
}

// A small deterministic LCG, exposed so callers can get a reproducible
// track out of generateTrack() — track.test.ts uses it for stable
// assertions, and GameScene wires a URL `?seed=` param through it so an
// E2E test can request the same track across runs.
export function createSeededRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

export interface WallDistances {
  leftWallDist: number;
  rightWallDist: number;
}

interface Vec2 {
  x: number;
  y: number;
}

function catmullRomComponent(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function catmullRomPoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  return {
    x: catmullRomComponent(p0.x, p1.x, p2.x, p3.x, t),
    y: catmullRomComponent(p0.y, p1.y, p2.y, p3.y, t),
  };
}

// Control points placed around a circle with a randomized radius and a
// randomized angle nudge, so the loop twists and narrows/widens instead of
// being a perfect circle. The angle nudge is capped to a fraction of each
// point's own angular segment so points never reorder — an out-of-order
// point would make the closed spline fold back on itself.
function generateControlPoints(rng: () => number): Vec2[] {
  const n = TRACK_GEN.controlPoints;
  const segmentAngle = (Math.PI * 2) / n;
  const points: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const angle = i * segmentAngle + (rng() - 0.5) * segmentAngle * TRACK_GEN.angleJitterFraction;
    const radius = TRACK_GEN.baseRadius * (1 - TRACK_GEN.radiusJitter + rng() * TRACK_GEN.radiusJitter * 2);
    points.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }
  return points;
}

// Dense closed-loop Catmull-Rom sampling through the control points — not
// the final centerline itself, since the spline's own parameter isn't
// evenly spaced by actual distance. resampleByArcLength below fixes that.
function sampleSplineDensely(controlPoints: Vec2[]): Vec2[] {
  const n = controlPoints.length;
  const steps = TRACK_GEN.segmentsPerControlPoint;
  const dense: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = controlPoints[(i - 1 + n) % n];
    const p1 = controlPoints[i];
    const p2 = controlPoints[(i + 1) % n];
    const p3 = controlPoints[(i + 2) % n];
    for (let step = 0; step < steps; step++) {
      dense.push(catmullRomPoint(p0, p1, p2, p3, step / steps));
    }
  }
  return dense;
}

// Canvas-angle convention: a direction vector (dx, dy) corresponds to
// atan2(dx, -dy) — matches GameScene's existing turret-aim math.
function headingBetween(from: Vec2, to: Vec2): number {
  return Math.atan2(to.x - from.x, -(to.y - from.y));
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

// Resamples the densely-sampled spline at fixed arc-length intervals
// (TRACK_GEN.sampleSpacing) so every consumer (wall rendering, AI
// lookahead, lap progress) can treat `s` as a uniform physical distance
// along the loop rather than an uneven spline parameter.
function resampleByArcLength(dense: Vec2[]): { samples: TrackSample[]; totalLength: number } {
  const cumulative: number[] = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1];
    const b = dense[i % dense.length];
    cumulative.push(cumulative[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const totalLength = cumulative[dense.length];

  const samples: TrackSample[] = [];
  let denseIndex = 0;
  for (let s = 0; s < totalLength; s += TRACK_GEN.sampleSpacing) {
    while (denseIndex < dense.length - 1 && cumulative[denseIndex + 1] < s) denseIndex++;
    const segStart = cumulative[denseIndex];
    const segEnd = cumulative[denseIndex + 1];
    const t = segEnd > segStart ? (s - segStart) / (segEnd - segStart) : 0;
    const a = dense[denseIndex];
    const b = dense[(denseIndex + 1) % dense.length];
    samples.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, headingRad: 0, s });
  }

  // Heading at each sample faces the next one (wrapping for the last
  // sample back to the first) — computed after all positions exist.
  for (let i = 0; i < samples.length; i++) {
    const next = samples[(i + 1) % samples.length];
    samples[i].headingRad = headingBetween(samples[i], next);
  }

  return { samples, totalLength };
}

function computeBounds(samples: TrackSample[], margin: number): Track["bounds"] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of samples) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX: minX - margin, minY: minY - margin, maxX: maxX + margin, maxY: maxY + margin };
}

// Generates one closed-loop track. `rng` is injectable (defaults to
// Math.random) so tests can pass a deterministic source instead.
export function generateTrack(rng: () => number = Math.random): Track {
  const controlPoints = generateControlPoints(rng);
  const dense = sampleSplineDensely(controlPoints);
  const { samples, totalLength } = resampleByArcLength(dense);
  const margin = ROAD_WIDTH / 2 + WALLS.maxOffset;
  return {
    samples,
    totalLength,
    pavedHalfWidth: ROAD_WIDTH / 2,
    bounds: computeBounds(samples, margin),
  };
}

function normalizeS(s: number, totalLength: number): number {
  const r = s % totalLength;
  return r < 0 ? r + totalLength : r;
}

// Wrapping interpolation along the centerline at an arbitrary arc-length
// position — used for spawn placement, lap-progress lookups, and AI
// lookahead targets (a point some distance ahead of a car's own progress).
export function pointAt(track: Track, s: number): TrackPoint {
  const { samples, totalLength } = track;
  const n = samples.length;
  const spacing = totalLength / n;
  const indexFloat = normalizeS(s, totalLength) / spacing;
  const index = Math.floor(indexFloat) % n;
  const nextIndex = (index + 1) % n;
  const t = indexFloat - Math.floor(indexFloat);
  const a = samples[index];
  const b = samples[nextIndex];
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    headingRad: lerpAngle(a.headingRad, b.headingRad, t),
  };
}

// Finds the closest point on the track's centerline polyline to (x, y),
// returning that point's arc-length position plus the signed lateral
// offset of (x, y) from it. A plain linear scan over samples (a few hundred
// for a typical track) is fast enough for a handful of cars per frame, so
// there's no need for spatial indexing.
//
// `hintS`, if given, makes the returned `s` *continuous* with a previous
// call's result instead of always normalized into [0, totalLength) — pass
// the previous frame's own returned `s` back in as the next frame's hint.
// This matters specifically right at the start/finish line: s=0 and
// s=totalLength are the same physical point, so the raw nearest-segment
// search can (and, in practice, does — even a sub-pixel move can flip it)
// resolve to either representation from one call to the next. Without a
// hint, that flip looks identical to "the car just completed/un-completed
// a lap" to anything tracking lap count from a jump in `s`. With a hint,
// the result is shifted by whichever multiple of totalLength keeps it
// within half a lap of the hint, so a car sitting still (or barely moving)
// near the seam reports a continuously drifting `s`, never a phantom lap.
export function nearestPoint(track: Track, x: number, y: number, hintS?: number): TrackQueryResult {
  const { samples, totalLength } = track;
  const n = samples.length;
  const spacing = totalLength / n;

  let nearestIndex = 0;
  let nearestDistSq = Infinity;
  for (let i = 0; i < n; i++) {
    const dx = samples[i].x - x;
    const dy = samples[i].y - y;
    const distSq = dx * dx + dy * dy;
    if (distSq < nearestDistSq) {
      nearestDistSq = distSq;
      nearestIndex = i;
    }
  }

  // The closest point on the *polyline* may sit on either segment
  // adjacent to the closest sample, not at the sample itself — check both.
  let best: TrackQueryResult = { s: nearestIndex * spacing, lateralOffset: 0, distance: Math.sqrt(nearestDistSq) };
  let bestSegDistSq = Infinity;
  for (const segOffset of [-1, 0]) {
    const i = (nearestIndex + segOffset + n) % n;
    const a = samples[i];
    const b = samples[(i + 1) % n];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lenSq = abx * abx + aby * aby || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (y - a.y) * aby) / lenSq));
    const px = a.x + abx * t;
    const py = a.y + aby * t;
    const dx = x - px;
    const dy = y - py;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestSegDistSq) {
      bestSegDistSq = distSq;
      const heading = lerpAngle(a.headingRad, b.headingRad, t);
      const normalRightX = Math.cos(heading);
      const normalRightY = Math.sin(heading);
      best = {
        s: i * spacing + t * spacing,
        lateralOffset: dx * normalRightX + dy * normalRightY,
        distance: Math.sqrt(distSq),
      };
    }
  }

  if (hintS !== undefined) {
    const { totalLength } = track;
    while (best.s - hintS > totalLength / 2) best.s -= totalLength;
    while (hintS - best.s > totalLength / 2) best.s += totalLength;
  }
  return best;
}

// The canyon's wall distance from the centerline meanders by arc-length
// (independent frequency/phase per side, see WALLS in config.ts) so the
// loop narrows/widens asymmetrically rather than both walls mirroring each
// other — same idea the old straight-road version used, just keyed off `s`
// instead of scrolled screen distance.
function wallOffset(s: number, freq: number, phase: number): number {
  const t = (Math.sin(s * freq + phase) + 1) / 2;
  return WALLS.minOffset + t * (WALLS.maxOffset - WALLS.minOffset);
}

export function wallDistancesAt(track: Track, s: number): WallDistances {
  return {
    leftWallDist: track.pavedHalfWidth + wallOffset(s, WALLS.meanderFreqLeft, 0),
    rightWallDist: track.pavedHalfWidth + wallOffset(s, WALLS.meanderFreqRight, WALLS.rightPhaseOffset),
  };
}
