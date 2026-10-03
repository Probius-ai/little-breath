import type { Point } from "./types";

export const TAU = Math.PI * 2;
export const clamp = (value: number, min = 0, max = 1): number =>
  Math.max(min, Math.min(max, value));
export const lerp = (a: number, b: number, amount: number): number =>
  a + (b - a) * amount;
export const distance = (a: Point, b: Point): number =>
  Math.hypot(a.x - b.x, a.y - b.y);
export const mixPoint = (a: Point, b: Point, amount: number): Point => ({
  x: lerp(a.x, b.x, amount),
  y: lerp(a.y, b.y, amount),
});
export const smoothstep = (value: number): number => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
export const damp = (
  value: number,
  target: number,
  rate: number,
  dt: number,
): number => lerp(value, target, 1 - Math.exp(-rate * dt));
export const isFinitePoint = (point: Point): boolean =>
  Number.isFinite(point.x) && Number.isFinite(point.y);
export function rotate(point: Point, angle: number, origin: Point): Point {
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  const x = point.x - origin.x,
    y = point.y - origin.y;
  return { x: origin.x + x * cos - y * sin, y: origin.y + x * sin + y * cos };
}
export function closestOnSegment(point: Point, a: Point, b: Point): Point {
  const x = b.x - a.x,
    y = b.y - a.y;
  const denominator = x * x + y * y;
  const t =
    denominator > 1e-12
      ? clamp(((point.x - a.x) * x + (point.y - a.y) * y) / denominator)
      : 0;
  return { x: a.x + x * t, y: a.y + y * t };
}
/** Stable string seed, independent of browser or locale. */
export function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++)
    hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash >>> 0 || 1;
}
