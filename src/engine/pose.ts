import type {
  Bone,
  PetDrawing,
  PetPose,
  PetState,
  Point,
  PosedBone,
} from "./types";
import { TAU, clamp, distance, lerp, rotate, smoothstep } from "./math";
import { solveIK } from "./ik";

/** Synthetic torso/head bones deform existing ink only; they never render new anatomy. */
export function getRestBones(drawing: PetDrawing): Bone[] {
  const { body, head, legs, tail } = drawing.rig;
  const hips = legs
    .filter((leg) => leg.joints.length >= 2)
    .map((leg) => leg.joints[0].x);
  const radius = hips.length
    ? clamp((Math.max(...hips) - Math.min(...hips)) * 0.7, 0.08, 0.22)
    : 0.14;
  const bones: Bone[] = [
    {
      id: "body",
      kind: "body",
      start: { x: body.x - radius, y: body.y },
      end: { x: body.x + radius, y: body.y },
    },
  ];
  if (head)
    bones.push({
      id: "head",
      kind: "head",
      start: { x: head.x - 0.055, y: head.y },
      end: { x: head.x + 0.055, y: head.y },
    });
  for (const leg of legs) {
    for (let i = 1; i < leg.joints.length; i++) {
      bones.push({
        id: `leg:${leg.id}:${i}`,
        kind: "leg",
        start: leg.joints[i - 1],
        end: leg.joints[i],
        root: leg.joints[0],
      });
    }
  }
  for (let i = 1; i < (tail?.length ?? 0); i++) {
    bones.push({
      id: `tail:${i}`,
      kind: "tail",
      start: tail![i - 1],
      end: tail![i],
    });
  }
  return bones;
}

/** The contact/swing foot trajectory is C1-continuous at takeoff and landing. */
export function gaitFoot(phase: number, stride: number, lift: number): Point {
  const p = ((phase % 1) + 1) % 1;
  const stance = 0.64;
  if (p < stance)
    return { x: lerp(stride, -stride, smoothstep(p / stance)), y: 0 };
  const swing = (p - stance) / (1 - stance);
  return {
    x: lerp(-stride, stride, smoothstep(swing)),
    y: -(Math.sin(swing * Math.PI) ** 2) * lift,
  };
}

export function computePose(
  drawing: PetDrawing,
  state: PetState,
  time = state.time,
): PetPose {
  const { body, head, legs, tail } = drawing.rig;
  const motion = state.reducedMotion ? 0 : 1;
  const moving = state.movement * motion;
  const sleep = state.blends.sleep;
  const eat = state.blends.eat;
  const drink = state.blends.drink;
  const pet = state.blends.pet;
  const seedPhase = (state.randomState % 127) / 127;
  const breath =
    Math.sin(time * (sleep > 0.5 ? 1.8 : 2.5) + seedPhase) * motion;
  const bounce = Math.sin(state.gaitPhase * TAU * 2);
  const bodyAngle =
    -0.075 * sleep +
    Math.sin(time * 6) * pet * 0.025 * motion +
    bounce * moving * 0.012;
  const dy =
    sleep * 0.065 - Math.abs(bounce) * moving * 0.014 + breath * 0.0025;
  const bodyTransform = (point: Point): Point => {
    const rotated = rotate(point, bodyAngle, body);
    return {
      x: body.x + (rotated.x - body.x) * (1 + breath * 0.008 + sleep * 0.045),
      y:
        body.y +
        (rotated.y - body.y) * (1 - sleep * 0.14 - breath * 0.006) +
        dy,
    };
  };
  const posedBody = bodyTransform(body);
  const posedHead = head ? bodyTransform(head) : undefined;
  const headAngle =
    -0.13 * sleep +
    (eat + drink) * (0.2 + Math.sin(time * (eat ? 9 : 6)) * 0.075 * motion) +
    pet * (Math.sin(time * 4.2) * 0.065 * motion - 0.08) +
    Math.sin(time * 1.05 + seedPhase) * 0.024 * motion * (1 - sleep);
  const headDrop = (eat + drink) * 0.034;
  const headTransform = (point: Point): Point => {
    const transformed = bodyTransform(point);
    if (!posedHead) return transformed;
    const nodded = rotate(transformed, headAngle, posedHead);
    return { x: nodded.x, y: nodded.y + headDrop };
  };

  const posedLegs = legs.map((leg, index) => {
    if (leg.joints.length < 2) return leg.joints.map(bodyTransform);
    const root = bodyTransform(leg.joints[0]);
    const tip = leg.joints[leg.joints.length - 1];
    const reach = leg.joints
      .slice(1)
      .reduce((total, point, i) => total + distance(leg.joints[i], point), 0);
    // Use authored limb length, so short or tiny limbs are never overdriven.
    const stride = Math.min(0.067, reach * 0.27) * moving;
    const lift = Math.min(0.05, reach * 0.25) * moving;
    const offset =
      leg.phase ?? (legs.length === 4 ? [0, 0.5, 0.5, 0][index] : index * 0.5);
    const step = gaitFoot(state.gaitPhase + offset, stride, lift);
    const tucked = sleep * Math.min(reach * 0.11, 0.025);
    const target = { x: tip.x + step.x + tucked, y: tip.y + step.y };
    return solveIK(leg.joints, root, target);
  });

  const posedTail: Point[] = [];
  if (tail?.length) {
    posedTail.push(bodyTransform(tail[0]));
    for (let i = 1; i < tail.length; i++) {
      const restAngle = Math.atan2(
        tail[i].y - tail[i - 1].y,
        tail[i].x - tail[i - 1].x,
      );
      const restLength = distance(tail[i - 1], tail[i]);
      const amplitude =
        (0.07 + pet * 0.3 + moving * 0.12) * (1 - sleep * 0.8) * motion;
      const wag =
        Math.sin(time * (pet > 0.1 ? 10 : 3.2) - i * 0.65) * amplitude;
      const angle = restAngle + bodyAngle + wag + sleep * 0.18;
      posedTail.push({
        x: posedTail[i - 1].x + Math.cos(angle) * restLength,
        y: posedTail[i - 1].y + Math.sin(angle) * restLength,
      });
    }
  }

  const bones: PosedBone[] = getRestBones(drawing).map((bone) => {
    let start: Point, end: Point;
    if (bone.kind === "head") {
      start = headTransform(bone.start);
      end = headTransform(bone.end);
    } else if (bone.kind === "leg") {
      // IDs may contain colons, so find by the same full key used at construction.
      let matched = false;
      start = bodyTransform(bone.start);
      end = bodyTransform(bone.end);
      for (let i = 0; i < legs.length && !matched; i++) {
        for (let j = 1; j < legs[i].joints.length; j++) {
          if (bone.id === `leg:${legs[i].id}:${j}`) {
            start = posedLegs[i][j - 1];
            end = posedLegs[i][j];
            matched = true;
            break;
          }
        }
      }
    } else if (bone.kind === "tail") {
      const index = Number(bone.id.slice(5));
      start = posedTail[index - 1];
      end = posedTail[index];
    } else {
      start = bodyTransform(bone.start);
      end = bodyTransform(bone.end);
    }
    return { ...bone, restStart: bone.start, restEnd: bone.end, start, end };
  });
  return {
    bones,
    legs: posedLegs,
    body: posedBody,
    head: posedHead ? { ...posedHead, y: posedHead.y + headDrop } : undefined,
    tail: posedTail,
    movement: moving,
  };
}
