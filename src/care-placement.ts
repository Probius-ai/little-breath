import type { Point } from "./engine/index";
import type { FoodId } from "./growth";
import { clampWorldX } from "./world";

export type CareItem = FoodId | "water";
export interface SceneRect {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface CarePointer {
  pointerId: number;
  item: CareItem;
  start: Point;
  point: Point;
  origin: "tray" | "scene";
  dragging: boolean;
}
export type CareGestureResult =
  | { type: "select"; item: CareItem }
  | { type: "place"; item: CareItem; point: Point }
  | { type: "cancel" };
export const DRAG_THRESHOLD = 8;
const finitePoint = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y);
export function clampPlacement(
  point: Point,
  width: number,
  height: number,
): Point {
  return {
    x: clampWorldX(Number.isFinite(point.x) ? point.x : width * 0.4, width),
    y: Math.max(0, height) * 0.82,
  };
}
/** The exact same projected point is used for the preview and the committed bowl. */
export function projectDrop(client: Point, rect: SceneRect): Point | null {
  if (
    !finitePoint(client) ||
    ![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0
  )
    return null;
  const x = client.x - rect.left,
    y = client.y - rect.top;
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
  return clampPlacement({ x, y }, rect.width, rect.height);
}
/** Input-only state machine. It never places resources or awards care/growth itself. */
export class CareGesture {
  private current: CarePointer | null = null;
  get active(): CarePointer | null {
    return this.current
      ? {
          ...this.current,
          start: { ...this.current.start },
          point: { ...this.current.point },
        }
      : null;
  }
  begin(
    pointerId: number,
    item: CareItem,
    point: Point,
    origin: "tray" | "scene" = "tray",
  ): boolean {
    if (
      this.current ||
      !Number.isFinite(pointerId) ||
      !finitePoint(point) ||
      !["seeds", "berry", "carrot", "water"].includes(item)
    )
      return false;
    this.current = {
      pointerId,
      item,
      start: { ...point },
      point: { ...point },
      origin,
      dragging: origin === "scene",
    };
    return true;
  }
  move(
    pointerId: number,
    point: Point,
    rect: SceneRect,
    blocked = false,
  ): Point | null {
    if (
      !this.current ||
      this.current.pointerId !== pointerId ||
      !finitePoint(point)
    )
      return null;
    this.current.point = { ...point };
    if (
      Math.hypot(
        point.x - this.current.start.x,
        point.y - this.current.start.y,
      ) >= DRAG_THRESHOLD
    )
      this.current.dragging = true;
    return this.current.dragging && !blocked ? projectDrop(point, rect) : null;
  }
  finish(
    pointerId: number,
    point: Point,
    rect: SceneRect,
    blocked = false,
  ): CareGestureResult | null {
    if (!this.current || this.current.pointerId !== pointerId) return null;
    const preview = this.move(pointerId, point, rect, blocked),
      gesture = this.current;
    this.current = null;
    if (!finitePoint(point)) return { type: "cancel" };
    if (!gesture.dragging && gesture.origin === "tray")
      return { type: "select", item: gesture.item };
    return preview
      ? { type: "place", item: gesture.item, point: preview }
      : { type: "cancel" };
  }
  cancel() {
    this.current = null;
  }
}
