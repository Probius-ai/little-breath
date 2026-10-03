import type { Point } from "./engine/index";
/** Shared walkable meadow bounds for the pet, pointer targets, bowls and resize. */
export function worldBounds(sceneWidth: number) {
  const width = Math.max(1, sceneWidth * 0.78),
    padding = Math.min(65, width * 0.2);
  return {
    width,
    padding,
    minX: padding,
    maxX: Math.max(padding, width - padding),
  };
}
export function clampWorldX(x: number, sceneWidth: number) {
  const b = worldBounds(sceneWidth);
  return Math.min(b.maxX, Math.max(b.minX, x));
}
export function placeResource(
  position: Point,
  sceneWidth: number,
  sceneHeight: number,
  offset = 70,
): Point {
  const b = worldBounds(sceneWidth);
  const desired =
    position.x + offset > b.maxX ? position.x - offset : position.x + offset;
  return { x: clampWorldX(desired, sceneWidth), y: sceneHeight * 0.82 };
}
