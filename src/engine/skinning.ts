import type {
  Bone,
  PetDrawing,
  PetPose,
  Point,
  PosedBone,
  Stroke,
} from "./types";
import { clamp, closestOnSegment, distance } from "./math";
import { getRestBones } from "./pose";

interface Influence {
  bone: number;
  weight: number;
}
interface BoundStroke {
  source: Stroke;
  weights: Influence[][];
}
export interface SkinBinding {
  bones: Bone[];
  strokes: BoundStroke[];
}
interface CachedSkin {
  signature: string;
  drawingStrokes: Stroke[];
  skin: SkinBinding;
}
const cache = new WeakMap<PetDrawing, CachedSkin>();

function signature(drawing: PetDrawing, bones: Bone[]): string {
  // Rig dragging changes this small fingerprint. Ink is immutable after a stroke
  // is completed; length and endpoints also catch the in-progress drawing path.
  return (
    bones
      .map(
        (bone) =>
          `${bone.id}/${bone.start.x}/${bone.start.y}/${bone.end.x}/${bone.end.y}`,
      )
      .join("|") +
    ":" +
    drawing.strokes
      .map(
        (stroke) =>
          `${stroke.id}/${stroke.points.length}/${stroke.points[0]?.x}/${stroke.points[0]?.y}/${stroke.points.at(-1)?.x}/${stroke.points.at(-1)?.y}`,
      )
      .join("|")
  );
}

function bindPoint(point: Point, bones: Bone[]): Influence[] {
  const candidates = bones
    .map((bone, index) => {
      const nearest = closestOnSegment(point, bone.start, bone.end);
      let d = distance(point, nearest);
      // Keep torso ink attached to the body near a hip. Without this falloff a
      // knee can pull an unrelated ear just because it shares the same x value.
      if (bone.kind === "leg" && bone.root && point.y < bone.root.y - 0.025)
        d += (bone.root.y - point.y) * 1.75;
      const radius =
        bone.kind === "body" ? 0.041 : bone.kind === "head" ? 0.028 : 0.016;
      const weight = 1 / Math.pow(d + radius, 3.2);
      return { bone: index, weight };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4);
  const sum = candidates.reduce(
    (total, influence) => total + influence.weight,
    0,
  );
  return candidates.map((influence) => ({
    bone: influence.bone,
    weight: influence.weight / sum,
  }));
}

/** Bind every authored ink point to up to four nearby bones. */
export function bindSkin(drawing: PetDrawing): SkinBinding {
  const bones = getRestBones(drawing);
  return {
    bones,
    strokes: drawing.strokes.map((source) => ({
      source,
      weights: source.points.map((point) => bindPoint(point, bones)),
    })),
  };
}

/** Call after modifying interior ink points in place. Immutable edits need no explicit invalidation. */
export function invalidateSkin(drawing: PetDrawing): void {
  cache.delete(drawing);
}

function getSkin(drawing: PetDrawing): SkinBinding {
  const bones = getRestBones(drawing);
  const key = signature(drawing, bones);
  const cached = cache.get(drawing);
  const sameStrokeObjects = cached?.skin.strokes.every(
    (stroke, index) => stroke.source === drawing.strokes[index],
  );
  if (
    cached &&
    cached.drawingStrokes === drawing.strokes &&
    cached.signature === key &&
    sameStrokeObjects
  )
    return cached.skin;
  const skin = bindSkin(drawing);
  cache.set(drawing, { signature: key, drawingStrokes: drawing.strokes, skin });
  return skin;
}

/** A rigid bone transform, plus the very small authored stretch of the torso. */
export function transformByBone(point: Point, bone: PosedBone): Point {
  const rx = bone.restEnd.x - bone.restStart.x,
    ry = bone.restEnd.y - bone.restStart.y;
  const px = bone.end.x - bone.start.x,
    py = bone.end.y - bone.start.y;
  const restLength = Math.hypot(rx, ry),
    posedLength = Math.hypot(px, py);
  if (restLength < 1e-8 || posedLength < 1e-8)
    return {
      x: point.x + bone.start.x - bone.restStart.x,
      y: point.y + bone.start.y - bone.restStart.y,
    };
  const ux = rx / restLength,
    uy = ry / restLength;
  const vx = px / posedLength,
    vy = py / posedLength;
  const x = point.x - bone.restStart.x,
    y = point.y - bone.restStart.y;
  const along = (x * ux + y * uy) * clamp(posedLength / restLength, 0.65, 1.5);
  const perpendicular = -x * uy + y * ux;
  return {
    x: bone.start.x + vx * along - vy * perpendicular,
    y: bone.start.y + vy * along + vx * perpendicular,
  };
}

/** Weighted linear-blend skinning; never adds strokes, limbs, faces or decoration. */
export function deformStrokes(
  drawing: PetDrawing,
  pose: PetPose,
  binding?: SkinBinding,
): Stroke[] {
  const skin = binding ?? getSkin(drawing);
  const posedById = new Map(pose.bones.map((bone) => [bone.id, bone]));
  const transforms = skin.bones.map((bone) => posedById.get(bone.id));
  return skin.strokes.map(({ source, weights }) => ({
    ...source,
    points: source.points.map((point, i) => {
      let x = 0,
        y = 0;
      for (const influence of weights[i] ?? []) {
        const bone = transforms[influence.bone];
        const transformed = bone ? transformByBone(point, bone) : point;
        x += transformed.x * influence.weight;
        y += transformed.y * influence.weight;
      }
      return { ...point, x, y };
    }),
  }));
}
