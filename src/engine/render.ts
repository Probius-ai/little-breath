import type {
  PetDrawing,
  PetPose,
  PetState,
  Point,
  RenderPetOptions,
  Stroke,
} from "./types";
import { clamp } from "./math";
import { computePose } from "./pose";
import { deformStrokes } from "./skinning";

export function getGroundLevel(drawing: PetDrawing): number {
  const feet = drawing.rig.legs
    .filter((leg) => leg.joints.length >= 2)
    .map((leg) => leg.joints.at(-1)!.y);
  if (feet.length) return Math.max(...feet);
  let bottom = drawing.rig.body.y;
  for (const stroke of drawing.strokes)
    for (const point of stroke.points)
      bottom = Math.max(bottom, point.y + stroke.width / 2);
  return bottom;
}

function strokePath(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  size: number,
  ground: number,
): void {
  const points = stroke.points;
  if (!points.length) return;
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = Math.max(0.35, stroke.width * size);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const map = (point: Point): Point => ({
    x: (point.x - 0.5) * size,
    y: (point.y - ground) * size,
  });
  const first = map(points[0]);
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(first.x, first.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length - 1; i++) {
    const point = map(points[i]),
      next = map(points[i + 1]);
    ctx.quadraticCurveTo(
      point.x,
      point.y,
      (point.x + next.x) / 2,
      (point.y + next.y) / 2,
    );
  }
  const last = map(points[points.length - 1]);
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

function drawRig(
  ctx: CanvasRenderingContext2D,
  pose: PetPose,
  size: number,
  color: string,
  ground: number,
): void {
  const map = (point: Point) => ({
    x: (point.x - 0.5) * size,
    y: (point.y - ground) * size,
  });
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.2;
  for (const bone of pose.bones) {
    const a = map(bone.start),
      b = map(bone.end);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  const joints = [
    pose.body,
    ...(pose.head ? [pose.head] : []),
    ...pose.legs.flat(),
    ...pose.tail,
  ];
  for (const joint of joints) {
    const p = map(joint);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Render only the user's skinned drawing at its world baseline. The caller owns
 * clearing, shadows, environment, speech bubbles and interaction hit testing.
 * Context transforms/styles are restored, including on a rendering exception.
 */
export function renderPet(
  ctx: CanvasRenderingContext2D,
  drawing: PetDrawing,
  state: PetState,
  time = state.time,
  options: RenderPetOptions = { size: 180 },
): PetPose {
  const pose = computePose(drawing, state, time);
  const strokes = deformStrokes(drawing, pose);
  const size = Math.max(1, options.size);
  const ground = getGroundLevel(drawing);
  ctx.save();
  try {
    ctx.globalAlpha *= clamp(options.opacity ?? 1);
    ctx.translate(state.position.x, state.position.y);
    ctx.scale(state.facing, 1);
    for (const stroke of strokes) strokePath(ctx, stroke, size, ground);
    if (options.showRig)
      drawRig(ctx, pose, size, options.rigColor ?? "#459489", ground);
  } finally {
    ctx.restore();
  }
  return pose;
}
