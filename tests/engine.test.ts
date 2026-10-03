import assert from "node:assert/strict";
import test from "node:test";
import {
  bindSkin,
  computePose,
  createPetState,
  deformStrokes,
  distance,
  gaitFoot,
  getRestBones,
  invalidateSkin,
  getGroundLevel,
  renderPet,
  setPetAction,
  solveIK,
  transformByBone,
  updatePet,
  type PetAction,
  type PetDrawing,
  type PetEnvironment,
  type PetPose,
  type Point,
} from "../src/engine/index.ts";

const drawing = (): PetDrawing => ({
  id: "ink-cat",
  name: "Mochi",
  strokes: [
    {
      id: "body",
      color: "#292625",
      width: 0.012,
      points: [
        { x: 0.2, y: 0.4 },
        { x: 0.5, y: 0.35 },
        { x: 0.8, y: 0.4 },
        { x: 0.7, y: 0.7 },
      ],
    },
    {
      id: "leg",
      color: "#292625",
      width: 0.012,
      points: [
        { x: 0.35, y: 0.57, pressure: 0.1 },
        { x: 0.33, y: 0.72, pressure: 0.7 },
        { x: 0.38, y: 0.89, pressure: 0 },
      ],
    },
  ],
  rig: {
    body: { x: 0.5, y: 0.52 },
    head: { x: 0.73, y: 0.39 },
    legs: [
      {
        id: "left",
        joints: [
          { id: "hip-l", x: 0.35, y: 0.57 },
          { id: "knee-l", x: 0.3, y: 0.73 },
          { id: "foot-l", x: 0.38, y: 0.89 },
        ],
      },
      {
        id: "right",
        joints: [
          { id: "hip-r", x: 0.64, y: 0.57 },
          { id: "foot-r", x: 0.66, y: 0.89 },
        ],
      },
    ],
    tail: [
      { id: "tail-root", x: 0.25, y: 0.51 },
      { id: "tail-mid", x: 0.12, y: 0.48 },
      { id: "tail-tip", x: 0.07, y: 0.31 },
    ],
  },
});
const environment: PetEnvironment = {
  width: 1000,
  height: 600,
  groundY: 460,
  speed: 45,
  autonomous: false,
};
const close = (actual: number, expected: number, tolerance = 1e-6): void =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} ≈ ${expected} (±${tolerance})`,
  );
const restPose = (pet: PetDrawing): PetPose => ({
  bones: getRestBones(pet).map((bone) => ({
    ...bone,
    restStart: bone.start,
    restEnd: bone.end,
  })),
  legs: pet.rig.legs.map((leg) => leg.joints),
  body: pet.rig.body,
  head: pet.rig.head,
  tail: pet.rig.tail ?? [],
  movement: 0,
});
function advance(
  state: ReturnType<typeof createPetState>,
  seconds: number,
  env = environment,
): void {
  for (let i = 0; i < Math.round(seconds * 60); i++)
    updatePet(state, 1 / 60, env);
}
function assertLengths(rest: Point[], solved: Point[], tolerance = 1e-6): void {
  assert.equal(solved.length, rest.length);
  for (let i = 1; i < rest.length; i++)
    close(
      distance(rest[i - 1], rest[i]),
      distance(solved[i - 1], solved[i]),
      tolerance,
    );
}

test("analytic IK reaches a reachable target without stretching either bone", () => {
  const rest = [
    { x: 0, y: 0 },
    { x: 0.4, y: 0.6 },
    { x: 0, y: 1.2 },
  ];
  const root = { x: 0.2, y: 0.1 },
    target = { x: 0.4, y: 1 };
  const solved = solveIK(rest, root, target);
  assert.deepEqual(solved[0], root);
  close(distance(solved.at(-1)!, target), 0);
  assertLengths(rest, solved);
  assert.ok(solved[1].x > root.x, "authored knee bend is preserved");
});

test("four-joint FABRIK reaches the goal while preserving all bone lengths", () => {
  const rest = [
    { x: 0, y: 0 },
    { x: 0.2, y: 0.3 },
    { x: -0.1, y: 0.6 },
    { x: 0, y: 0.9 },
  ];
  const root = { x: 0.1, y: 0.2 },
    target = { x: 0.35, y: 0.85 };
  const solved = solveIK(rest, root, target);
  assert.deepEqual(solved[0], root);
  assertLengths(rest, solved);
  close(distance(solved.at(-1)!, target), 0, 1e-4);
});

test("an unreachable target extends the chain instead of stretching it", () => {
  const rest = [
    { x: 0, y: 0 },
    { x: 0, y: 0.3 },
    { x: 0.1, y: 0.6 },
  ];
  const solved = solveIK(rest, { x: 0, y: 0 }, { x: 4, y: 3 });
  assertLengths(rest, solved);
  assert.ok(distance(solved.at(-1)!, { x: 4, y: 3 }) > 4);
});

test("a straight four-joint chain can bend toward an interior target", () => {
  const rest = [
    { x: 0, y: 0 },
    { x: 0, y: 0.3 },
    { x: 0, y: 0.6 },
    { x: 0, y: 0.9 },
  ];
  const solved = solveIK(rest, rest[0], { x: 0, y: 0.5 });
  assertLengths(rest, solved);
  close(distance(solved.at(-1)!, { x: 0, y: 0.5 }), 0, 1e-4);
});

test("empty, single-joint, and collapsed chains remain finite", () => {
  assert.deepEqual(solveIK([], { x: 1, y: 2 }, { x: 3, y: 4 }), []);
  assert.deepEqual(solveIK([{ x: 0, y: 0 }], { x: 1, y: 2 }, { x: 3, y: 4 }), [
    { x: 1, y: 2 },
  ]);
  const solved = solveIK(
    [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ],
    { x: 1, y: 2 },
    { x: 3, y: 4 },
  );
  assert.deepEqual(solved, [
    { x: 1, y: 2 },
    { x: 1, y: 2 },
    { x: 1, y: 2 },
  ]);
});

test("a two-joint leg preserves its one authored segment length", () => {
  const rest = [
    { x: 0, y: 0 },
    { x: 0.1, y: 0.5 },
  ];
  assertLengths(rest, solveIK(rest, { x: 0.1, y: 0.1 }, { x: 0.4, y: 0.4 }));
});

test("rest-pose skinning is identity and preserves pressure/color/width exactly", () => {
  const pet = drawing();
  const deformed = deformStrokes(pet, restPose(pet));
  assert.equal(deformed.length, pet.strokes.length);
  deformed.forEach((stroke, i) => {
    assert.equal(stroke.color, pet.strokes[i].color);
    assert.equal(stroke.width, pet.strokes[i].width);
    stroke.points.forEach((point, j) => {
      const rest = pet.strokes[i].points[j];
      close(point.x, rest.x);
      close(point.y, rest.y);
      assert.equal(point.pressure, rest.pressure);
    });
  });
});

test("weighted skinning binds at most four positive influences that sum to one", () => {
  const skin = bindSkin(drawing());
  for (const stroke of skin.strokes)
    for (const weights of stroke.weights) {
      assert.ok(weights.length >= 1 && weights.length <= 4);
      assert.ok(weights.every((influence) => influence.weight > 0));
      close(
        weights.reduce((sum, influence) => sum + influence.weight, 0),
        1,
      );
    }
});

test("a translated skeleton translates all ink consistently", () => {
  const pet = drawing(),
    pose = restPose(pet);
  pose.bones = pose.bones.map((bone) => ({
    ...bone,
    start: { x: bone.start.x + 0.2, y: bone.start.y - 0.1 },
    end: { x: bone.end.x + 0.2, y: bone.end.y - 0.1 },
  }));
  const strokes = deformStrokes(pet, pose);
  strokes.forEach((stroke, i) =>
    stroke.points.forEach((point, j) => {
      close(point.x, pet.strokes[i].points[j].x + 0.2);
      close(point.y, pet.strokes[i].points[j].y - 0.1);
    }),
  );
});

test("bone rotation rotates nearby ink rather than merely translating it", () => {
  const point = transformByBone(
    { x: 0.5, y: 0.2 },
    {
      id: "body",
      kind: "body",
      restStart: { x: 0, y: 0 },
      restEnd: { x: 1, y: 0 },
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
    },
  );
  close(point.x, -0.2);
  close(point.y, 0.5);
});

test("editing joint coordinates rebinds skin and never modifies original ink", () => {
  const pet = drawing(),
    original = structuredClone(pet.strokes);
  const state = createPetState(pet, { x: 500, y: 460 });
  deformStrokes(pet, computePose(pet, state));
  pet.rig.legs[0].joints[1].x += 0.08;
  const output = deformStrokes(pet, restPose(pet));
  output.forEach((stroke, i) =>
    stroke.points.forEach((point, j) => {
      close(point.x, pet.strokes[i].points[j].x);
      close(point.y, pet.strokes[i].points[j].y);
    }),
  );
  assert.deepEqual(pet.strokes, original);
  invalidateSkin(pet);
});

test("legless and one-legged drawings never acquire synthetic limbs or strokes", () => {
  for (const count of [0, 1]) {
    const pet = drawing();
    pet.rig.legs = pet.rig.legs.slice(0, count);
    delete pet.rig.tail;
    const state = createPetState(pet, { x: 500, y: 460 });
    state.movement = 1;
    const pose = computePose(pet, state, 2);
    assert.equal(pose.legs.length, count);
    assert.equal(pose.tail.length, 0);
    assert.equal(deformStrokes(pet, pose).length, pet.strokes.length);
  }
});

test("foot trajectory is continuous at contact and only lifts during swing", () => {
  close(gaitFoot(0.3, 0.1, 0.1).y, 0);
  assert.ok(gaitFoot(0.82, 0.1, 0.1).y < 0);
  close(
    distance(gaitFoot(0.64 - 1e-7, 0.1, 0.1), gaitFoot(0.64 + 1e-7, 0.1, 0.1)),
    0,
    1e-5,
  );
  close(
    distance(gaitFoot(1 - 1e-7, 0.1, 0.1), gaitFoot(1e-7, 0.1, 0.1)),
    0,
    1e-5,
  );
});

test("same seed and commands produce exactly the same behavior", () => {
  const a = createPetState(drawing(), { x: 500, y: 460 }, 42);
  const b = createPetState(drawing(), { x: 500, y: 460 }, 42);
  advance(a, 60, { ...environment, autonomous: true });
  advance(b, 60, { ...environment, autonomous: true });
  assert.deepEqual(a, b);
});

test("follow accelerates toward the pointer and remains in bounds", () => {
  const state = createPetState(drawing(), { x: 500, y: 460 });
  setPetAction(state, "follow");
  advance(state, 20, { ...environment, pointer: { x: -100, y: 100 } });
  assert.equal(state.currentAction, "follow");
  assert.equal(state.facing, -1);
  assert.ok(state.position.x >= 80 && state.position.x < 150);
  assert.ok(Number.isFinite(state.gaitPhase));
});

test("food and water are approached before consuming, then needs recover", () => {
  for (const [action, resource, need] of [
    ["eat", "food", "hunger"],
    ["drink", "water", "thirst"],
  ] as const) {
    const state = createPetState(drawing(), { x: 500, y: 460 });
    state[need] = 0.9;
    setPetAction(state, action);
    const env = { ...environment, [resource]: { x: 600, y: 460 } };
    advance(state, 1, env);
    assert.ok(state[need] >= 0.9, "need should not recover while walking");
    close(state.actionTime, 0);
    advance(state, 15, env);
    assert.ok(state[need] < 0.1);
  }
});

test("sleep restores energy and petting restores happiness", () => {
  const state = createPetState(drawing(), { x: 500, y: 460 });
  state.energy = 0.15;
  state.happiness = 0.2;
  setPetAction(state, "sleep");
  advance(state, 10);
  assert.ok(state.energy > 0.45);
  assert.ok(state.blends.sleep > 0.99);
  setPetAction(state, "pet");
  advance(state, 3);
  assert.ok(state.happiness > 0.4);
  assert.ok(state.blends.sleep < 0.01);
});

test("invalid and suspended-tab deltas cannot corrupt or teleport state", () => {
  const state = createPetState(drawing(), { x: 500, y: 460 });
  const original = structuredClone(state);
  updatePet(state, NaN, environment);
  updatePet(state, -1, environment);
  updatePet(state, Infinity, environment);
  assert.deepEqual(state, original);
  setPetAction(state, "follow");
  updatePet(state, 3600, { ...environment, pointer: { x: 1000, y: 460 } });
  assert.ok(state.position.x < 520);
  close(state.time, 0.25);
});

test("every action produces finite poses and preserves leg lengths during motion", () => {
  const pet = drawing(),
    source = structuredClone(pet);
  for (const action of [
    "idle",
    "wander",
    "sleep",
    "eat",
    "drink",
    "follow",
    "pet",
  ] as PetAction[]) {
    const state = createPetState(pet, { x: 500, y: 460 });
    setPetAction(state, action, { x: 800, y: 460 });
    advance(state, 2);
    const pose = computePose(pet, state);
    for (const bone of pose.bones)
      for (const point of [bone.start, bone.end])
        assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    pose.legs.forEach((leg, index) =>
      assertLengths(pet.rig.legs[index].joints, leg),
    );
    for (const stroke of deformStrokes(pet, pose))
      for (const point of stroke.points)
        assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
  }
  assert.deepEqual(pet, source);
});

test("reduced motion stops ambient movement while retaining the selected pose", () => {
  const pet = drawing(),
    state = createPetState(pet, { x: 500, y: 460 });
  state.reducedMotion = true;
  assert.deepEqual(computePose(pet, state, 0), computePose(pet, state, 10));
  state.blends.sleep = 1;
  assert.notDeepEqual(computePose(pet, state, 10).body, pet.rig.body);
});

test("canvas rendering restores context state even when drawing fails", () => {
  const pet = drawing(),
    state = createPetState(pet, { x: 500, y: 460 });
  let saved = 0,
    restored = 0;
  const ctx = {
    globalAlpha: 1,
    save: () => {
      saved++;
    },
    restore: () => {
      restored++;
    },
    translate: () => {},
    scale: () => {},
    beginPath: () => {},
    moveTo: () => {},
    quadraticCurveTo: () => {
      throw new Error("render failed");
    },
  } as unknown as CanvasRenderingContext2D;
  assert.throws(
    () => renderPet(ctx, pet, state, 0, { size: 180 }),
    /render failed/,
  );
  assert.equal(saved, 1);
  assert.equal(restored, 1);
});

test("four legs with four joints remain individually connected throughout a full gait cycle", () => {
  const pet = drawing();
  pet.rig.legs = [0.26, 0.39, 0.59, 0.72].map((x, index) => ({
    id: `leg-${index}`,
    joints: [
      { id: `hip-${index}`, x, y: 0.56 },
      { id: `knee-${index}`, x: x - 0.026, y: 0.68 },
      { id: `ankle-${index}`, x: x + 0.018, y: 0.78 },
      { id: `foot-${index}`, x: x + 0.031, y: 0.87 },
    ],
  }));
  // These are real, authored four-legged ink strokes, not lines added by the renderer.
  pet.strokes = pet.rig.legs.map((leg) => ({
    id: `ink-${leg.id}`,
    color: "#242424",
    width: 0.011,
    points: leg.joints.map((point) => ({ x: point.x, y: point.y })),
  }));
  const state = createPetState(pet, { x: 500, y: 460 });
  state.movement = 1;
  let previous: PetPose | undefined;
  for (let frame = 0; frame <= 120; frame++) {
    state.gaitPhase = frame / 120;
    const pose = computePose(pet, state, frame / 60);
    assert.equal(pose.legs.length, 4);
    assert.equal(pose.bones.filter((bone) => bone.kind === "leg").length, 12);
    for (let leg = 0; leg < 4; leg++) {
      assert.equal(pose.legs[leg].length, 4);
      assertLengths(pet.rig.legs[leg].joints, pose.legs[leg]);
      const bones = pose.bones.filter((bone) =>
        bone.id.startsWith(`leg:leg-${leg}:`),
      );
      assert.deepEqual(bones[0].end, bones[1].start);
      assert.deepEqual(bones[1].end, bones[2].start);
      if (previous)
        pose.legs[leg].forEach((joint, index) =>
          assert.ok(
            distance(joint, previous!.legs[leg][index]) < 0.025,
            "no frame-to-frame knee snaps",
          ),
        );
    }
    const ink = deformStrokes(pet, pose);
    assert.equal(ink.length, 4);
    assert.ok(ink.every((stroke) => stroke.points.length === 4));
    previous = pose;
  }
});

test("quadruped default gait moves diagonal pairs together", () => {
  const pet = drawing();
  pet.rig.legs = [0.25, 0.4, 0.6, 0.75].map((x, index) => ({
    id: `pair-${index}`,
    joints: [
      { id: `hip-${index}`, x, y: 0.5 },
      { id: `knee-${index}`, x: x + 0.05, y: 0.7 },
      { id: `foot-${index}`, x, y: 0.85 },
    ],
  }));
  const state = createPetState(pet, { x: 500, y: 460 });
  state.movement = 1;
  state.gaitPhase = 0.82;
  const pose = computePose(pet, state, 0);
  const footDy = pose.legs.map(
    (leg, i) => leg.at(-1)!.y - pet.rig.legs[i].joints.at(-1)!.y,
  );
  close(footDy[0], footDy[3]);
  close(footDy[1], footDy[2]);
  assert.ok(footDy[0] < -0.01 && Math.abs(footDy[1]) < 0.01);
});

test("an autonomous pet finishes its meal after a long walk to the bowl", () => {
  const state = createPetState(drawing(), { x: 200, y: 460 });
  state.hunger = 0.9;
  setPetAction(state, "eat");
  const env = { ...environment, autonomous: true, food: { x: 650, y: 460 } };
  advance(state, 8, env);
  assert.equal(
    state.currentAction,
    "eat",
    "travel time must not cancel a meal",
  );
  advance(state, 17, env);
  assert.ok(state.hunger < 0.15);
});

test("drawing baseline follows actual foot tips instead of unused canvas whitespace", () => {
  const pet = drawing();
  close(getGroundLevel(pet), 0.89);
  pet.rig.legs = [];
  close(getGroundLevel(pet), 0.896);
  pet.strokes = [];
  close(getGroundLevel(pet), pet.rig.body.y);
});
