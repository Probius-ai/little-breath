import type { Point } from "./types";
import { clamp, distance } from "./math";

/**
 * Solve a two- to four-joint chain without stretching bones.
 * Two-segment limbs use analytic IK, preserving the drawing's bend side.
 * Longer chains use FABRIK initialized from the actual authored joint positions.
 */
export function solveIK(
  rest: readonly Point[],
  root: Point,
  target: Point,
  iterations = 24,
): Point[] {
  if (rest.length === 0) return [];
  if (rest.length === 1) return [{ ...root }];
  const lengths = rest.slice(1).map((point, i) => distance(rest[i], point));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total < 1e-8) return rest.map(() => ({ ...root }));
  const offset = { x: root.x - rest[0].x, y: root.y - rest[0].y };
  const points = rest.map((point) => ({
    x: point.x + offset.x,
    y: point.y + offset.y,
  }));
  const dx = target.x - root.x,
    dy = target.y - root.y;
  const reach = Math.hypot(dx, dy);
  const restDirection = {
    x: rest.at(-1)!.x - rest[0].x,
    y: rest.at(-1)!.y - rest[0].y,
  };
  const fallbackAngle = Math.atan2(restDirection.y, restDirection.x || 1e-8);
  const ux = reach > 1e-8 ? dx / reach : Math.cos(fallbackAngle);
  const uy = reach > 1e-8 ? dy / reach : Math.sin(fallbackAngle);

  if (reach >= total - 1e-7 || rest.length === 2) {
    let accumulated = 0;
    return rest.map((_, i) => {
      if (i > 0) accumulated += lengths[i - 1];
      return { x: root.x + ux * accumulated, y: root.y + uy * accumulated };
    });
  }

  if (rest.length === 3 && lengths[0] > 1e-8 && lengths[1] > 1e-8) {
    const [a, b] = lengths;
    const d = clamp(reach, Math.abs(a - b) + 1e-7, a + b - 1e-7);
    const projection = (a * a - b * b + d * d) / (2 * d);
    const height = Math.sqrt(Math.max(0, a * a - projection * projection));
    const cross =
      (rest[1].x - rest[0].x) * restDirection.y -
      (rest[1].y - rest[0].y) * restDirection.x;
    const sign = cross >= 0 ? 1 : -1;
    return [
      { ...root },
      {
        x: root.x + ux * projection + uy * height * sign,
        y: root.y + uy * projection - ux * height * sign,
      },
      { x: root.x + ux * d, y: root.y + uy * d },
    ];
  }

  // A perfectly straight authored chain needs a tiny deterministic bend to avoid
  // FABRIK's collinear singularity when its target is inside its reach.
  const cross = points
    .slice(1, -1)
    .some(
      (point) =>
        Math.abs((point.x - root.x) * uy - (point.y - root.y) * ux) > 1e-6,
    );
  if (!cross) {
    for (let i = 1; i < points.length - 1; i++) {
      const amount =
        Math.sin((i / (points.length - 1)) * Math.PI) * total * 0.08;
      points[i].x += uy * amount;
      points[i].y -= ux * amount;
    }
  }
  const placeAtLength = (
    anchor: Point,
    point: Point,
    length: number,
    index: number,
  ): Point => {
    const d = distance(anchor, point);
    if (d < 1e-9) {
      const angle = fallbackAngle + index * 0.3;
      return {
        x: anchor.x + Math.cos(angle) * length,
        y: anchor.y + Math.sin(angle) * length,
      };
    }
    return {
      x: anchor.x + ((point.x - anchor.x) / d) * length,
      y: anchor.y + ((point.y - anchor.y) / d) * length,
    };
  };
  for (let iteration = 0; iteration < iterations; iteration++) {
    points[points.length - 1] = { ...target };
    for (let i = points.length - 2; i >= 0; i--)
      points[i] = placeAtLength(points[i + 1], points[i], lengths[i], i);
    points[0] = { ...root };
    for (let i = 1; i < points.length; i++)
      points[i] = placeAtLength(points[i - 1], points[i], lengths[i - 1], i);
    if (distance(points[points.length - 1], target) < 1e-5) break;
  }
  return points;
}
