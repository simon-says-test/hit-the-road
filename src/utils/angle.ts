/**
 * Canvas-angle convention: 0° points up (north), positive angles rotate clockwise.
 * This is consistent with Phaser's Math.atan2(x, -y) convention.
 */

/**
 * Normalize an angle to the range [-180, 180).
 * Useful for comparing angles and detecting shortest rotation direction.
 */
export function normalizeDeg(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**
 * Linearly interpolate between two angles (deg), taking the shortest path.
 * @param a Starting angle (deg)
 * @param b Target angle (deg)
 * @param t Interpolation factor [0, 1]
 */
export function lerpAngleDeg(a: number, b: number, t: number): number {
  let diff = (b - a) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return normalizeDeg(a + diff * t);
}

/**
 * Clamp a value to [0, 1].
 */
export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Calculate canvas-angle heading from one world point to another.
 * @param fromX Source x coordinate
 * @param fromY Source y coordinate
 * @param toX Target x coordinate
 * @param toY Target y coordinate
 * @returns Heading in degrees (0 = up/north, +clockwise)
 */
export function angleBetween(fromX: number, fromY: number, toX: number, toY: number): number {
  return (Math.atan2(toX - fromX, -(toY - fromY)) * 180) / Math.PI;
}
