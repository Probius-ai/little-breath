/** Independent regressions for the original four-leg/four-joint report.
 * UI button flows and image/network privacy require browser QA; these test the
 * actual engine output, storage/import contract, and history implementation.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  computePose,
  createPetState,
  deformStrokes,
  distance,
  getRestBones,
  renderPet,
  setPetAction,
  updatePet,
  type PetDrawing,
  type PetPose,
  type Point,
  type Stroke,
} from "../src/engine/index.ts";
import {
  createProject,
  createSample,
  History,
  loadProject,
  parseProject,
  saveProject,
  STORAGE_KEY,
  validateProject,
} from "../src/project.ts";
import {
  loadTracingReference,
  drawTracingReference,
  releaseTracingReference,
} from "../src/tracing.ts";
import {
  createGrowth,
  feedGrowth,
  getGrowthStage,
  petGrowth,
  FOOD_OPTIONS,
} from "../src/growth.ts";
import { renderScene } from "../src/scene.ts";
import { createDemoWeather } from "../src/weather.ts";
import { clampWorldX, placeResource, worldBounds } from "../src/world.ts";

const near = (a: number, b: number, tolerance = 1e-7) =>
  assert.ok(
    Math.abs(a - b) <= tolerance,
    `${a} differs from ${b} by more than ${tolerance}`,
  );
const closePoint = (a: Point, b: Point) => {
  near(a.x, b.x);
  near(a.y, b.y);
};
function customPet(jointCounts: number[] = [4, 4, 4, 4]): PetDrawing {
  const legs = jointCounts.map((count, leg) => {
    const x = 0.2 + leg * 0.075;
    return {
      id: `custom:leg:${leg}`,
      joints: Array.from({ length: count }, (_, j) => ({
        id: `leg:${leg}:joint:${j}`,
        x: x + (j % 2 ? 0.026 : -0.015),
        y: 0.51 + (j / (count - 1)) * 0.32,
      })),
    };
  });
  const strokes: Stroke[] = [
    {
      id: "authored-body",
      color: "#2a2725",
      width: 0.014,
      points: [
        { x: 0.12, y: 0.4 },
        { x: 0.54, y: 0.32 },
        { x: 0.85, y: 0.43 },
      ],
    },
    ...legs.map((leg) => ({
      id: `ink:${leg.id}`,
      color: "#485d46",
      width: 0.018,
      points: leg.joints.map(({ x, y }, index) => ({
        x,
        y,
        pressure: index === 0 ? 0 : 0.6,
      })),
    })),
  ];
  return {
    id: "handmade-companion",
    name: "네발이 🐾",
    strokes,
    rig: { body: { x: 0.5, y: 0.43 }, legs },
  };
}
function restPose(pet: PetDrawing): PetPose {
  return {
    bones: getRestBones(pet).map((b) => ({
      ...b,
      restStart: b.start,
      restEnd: b.end,
    })),
    legs: pet.rig.legs.map((l) => l.joints),
    body: pet.rig.body,
    head: pet.rig.head,
    tail: pet.rig.tail ?? [],
    movement: 0,
  };
}
function assertConnected(pet: PetDrawing, pose: PetPose): void {
  assert.equal(pose.legs.length, pet.rig.legs.length);
  assert.equal(
    pose.bones.filter((b) => b.kind === "leg").length,
    pet.rig.legs.reduce((n, l) => n + l.joints.length - 1, 0),
  );
  pet.rig.legs.forEach((leg, li) => {
    const points = pose.legs[li];
    assert.equal(points.length, leg.joints.length);
    for (let j = 1; j < points.length; j++) {
      const bone = pose.bones.find((b) => b.id === `leg:${leg.id}:${j}`);
      assert.ok(bone, `missing segment ${leg.id}:${j}`);
      closePoint(bone.start, points[j - 1]);
      closePoint(bone.end, points[j]);
      near(
        distance(points[j - 1], points[j]),
        distance(leg.joints[j - 1], leg.joints[j]),
      );
      if (j > 1)
        closePoint(
          pose.bones.find((b) => b.id === `leg:${leg.id}:${j - 1}`)!.end,
          bone.start,
        );
    }
  });
}

test("leg count and joints-per-leg are independent over every supported 0–8 × 2–4 combination", () => {
  for (let legCount = 0; legCount <= 8; legCount++)
    for (const joints of [2, 3, 4]) {
      const pet = customPet(Array(legCount).fill(joints));
      const source = structuredClone(pet);
      const state = createPetState(pet, { x: 400, y: 450 });
      state.movement = 1;
      for (const phase of [0, 0.25, 0.5, 0.82, 1]) {
        state.gaitPhase = phase;
        const pose = computePose(pet, state, phase * 2);
        assertConnected(pet, pose);
        assert.equal(pose.legs.length, legCount);
        assert.ok(pose.legs.every((l) => l.length === joints));
        const ink = deformStrokes(pet, pose);
        assert.deepEqual(
          ink.map((s) => [s.id, s.points.length]),
          pet.strokes.map((s) => [s.id, s.points.length]),
        );
        assert.ok(
          ink
            .flatMap((s) => s.points)
            .every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
        );
      }
      assert.deepEqual(
        pet,
        source,
        "rendering must not rewrite authored drawing or rig",
      );
    }
});

test("four-leg creature with mixed 2/4/3/4 joint counts preserves every independent chain", () => {
  const pet = customPet([2, 4, 3, 4]);
  const state = createPetState(pet, { x: 400, y: 450 });
  state.movement = 1;
  for (let frame = 0; frame < 180; frame++) {
    state.gaitPhase = frame / 90;
    assertConnected(pet, computePose(pet, state, frame / 60));
  }
});

test("increasing one chain from three to four joints reconnects topology without changing other legs", () => {
  const pet = customPet([3, 3, 3, 3]);
  const unaffected = structuredClone(pet.rig.legs.slice(1));
  const ink = structuredClone(pet.strokes);
  const state = createPetState(pet, { x: 400, y: 450 });
  state.movement = 1;
  deformStrokes(pet, computePose(pet, state)); // Prime the real skinning cache before editing.
  const leg = pet.rig.legs[0],
    a = leg.joints[1],
    b = leg.joints[2];
  leg.joints.splice(2, 0, {
    id: "inserted-ankle",
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  const pose = computePose(pet, state, 1.2);
  assertConnected(pet, pose);
  assert.deepEqual(
    pose.legs.map((l) => l.length),
    [4, 3, 3, 3],
  );
  assert.deepEqual(pet.rig.legs.slice(1), unaffected);
  assert.deepEqual(pet.strokes, ink);
  deformStrokes(pet, restPose(pet)).forEach((s, i) =>
    s.points.forEach((p, j) => closePoint(p, ink[i].points[j])),
  );
});

test("rendering a custom legless drawing issues exactly its authored paths and no new anatomy", () => {
  const pet = customPet([]);
  const state = createPetState(pet, { x: 400, y: 450 });
  let paths = 0,
    strokes = 0,
    arcs = 0,
    fills = 0;
  const ctx = {
    globalAlpha: 1,
    save() {},
    restore() {},
    translate() {},
    scale() {},
    beginPath() {
      paths++;
    },
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    stroke() {
      strokes++;
    },
    arc() {
      arcs++;
    },
    fill() {
      fills++;
    },
  } as unknown as CanvasRenderingContext2D;
  const pose = renderPet(ctx, pet, state, 0.8, { size: 200, showRig: false });
  assert.deepEqual(pose.legs, []);
  assert.deepEqual(pose.tail, []);
  assert.equal(paths, pet.strokes.length);
  assert.equal(strokes, pet.strokes.length);
  assert.equal(arcs, 0);
  assert.equal(fills, 0);
  pet.strokes = [];
  paths = 0;
  strokes = 0;
  renderPet(ctx, pet, state, 1, { size: 200, showRig: false });
  assert.equal(paths, 0);
  assert.equal(strokes, 0);
});

test("JSON round-trip preserves four legs, all joint IDs, authored ink, name, and zero pen pressure", () => {
  const project = createProject(customPet());
  project.pet.rig.legs.forEach((l, i) => {
    l.phase = [0, 0.5, 0.5, 0][i];
  });
  project.pet.rig.head = { x: 0.72, y: 0.29 };
  project.pet.rig.tail = [
    { id: "tail-root", x: 0.18, y: 0.41 },
    { id: "tail-tip", x: 0.04, y: 0.31 },
  ];
  assert.deepEqual(parseProject(JSON.stringify(project)), project);
});

test("local save/load retains naming, full custom rig, drawing and care counts", () => {
  const values = new Map<string, string>();
  const storage = {
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    getItem: (key: string) => values.get(key) ?? null,
  };
  const project = createProject(customPet([4, 4, 4, 4]));
  project.pet.name = "별이 & <작은 친구>";
  project.care = { meals: 12, drinks: 7, affection: 31 };
  saveProject(project, storage);
  assert.ok(values.has(STORAGE_KEY));
  assert.deepEqual(loadProject(storage), project);
});

test("loading a custom legless drawing never replaces it with sample legs, head, or tail", () => {
  const project = createProject(customPet([]));
  const restored = parseProject(JSON.stringify(project));
  assert.deepEqual(restored.pet, project.pet);
  assert.equal(restored.pet.rig.legs.length, 0);
  assert.equal(restored.pet.rig.head, undefined);
  assert.equal(restored.pet.rig.tail, undefined);
});

test("History undo/redo restores full add/remove snapshots without aliasing or disconnected remnants", () => {
  const history = new History<PetDrawing>();
  const original = customPet([4, 4, 4, 4]);
  let draft = structuredClone(original);
  history.push(draft);
  draft.rig.legs[0].joints.splice(2, 1);
  const afterJointRemoval = structuredClone(draft);
  history.push(draft);
  draft.rig.legs.splice(1, 1);
  draft.name = "새 이름";
  draft.strokes[0].points[0].x = 0.19;
  const afterLegRemoval = structuredClone(draft);
  draft = history.undo(draft)!;
  assert.deepEqual(draft, afterJointRemoval);
  draft = history.undo(draft)!;
  assert.deepEqual(draft, original);
  assertConnected(
    draft,
    computePose(draft, createPetState(draft, { x: 400, y: 450 }), 1),
  );
  draft = history.redo(draft)!;
  assert.deepEqual(draft, afterJointRemoval);
  draft = history.redo(draft)!;
  assert.deepEqual(draft, afterLegRemoval);
  assert.equal(history.redo(draft), null);
});

test("editing after undo discards the old redo branch", () => {
  const history = new History<PetDrawing>();
  const original = customPet();
  history.push(original);
  const edited = structuredClone(original);
  edited.name = "먼저 바꾼 이름";
  const restored = history.undo(edited)!;
  assert.equal(history.canRedo, true);
  history.push(restored);
  restored.name = "다시 바꾼 이름";
  assert.equal(history.canRedo, false);
  assert.equal(history.redo(restored), null);
  assert.equal(history.undo(restored)!.name, original.name);
});

test("duplicate leg identifiers are rejected before their posed bone keys can collide", () => {
  const project = createProject(customPet());
  project.pet.rig.legs[1].id = project.pet.rig.legs[0].id;
  assert.throws(() => validateProject(project));
});

test("duplicate joint identifiers and unsupported chain lengths cannot enter a project", () => {
  const duplicate = createProject(customPet());
  duplicate.pet.rig.legs[1].joints[0].id =
    duplicate.pet.rig.legs[0].joints[0].id;
  assert.throws(() => validateProject(duplicate));
  for (const jointCounts of [[1], [5], Array(9).fill(2)])
    assert.throws(() => validateProject(createProject(customPet(jointCounts))));
});

test("project import strips unknown photo and metadata fields at all coordinate levels", () => {
  const project = createProject(customPet());
  const withPrivateFields = structuredClone(project) as typeof project &
    Record<string, unknown>;
  withPrivateFields.photoUnderlay = "private-photo-data";
  Object.assign(withPrivateFields.pet, { photoData: "private-photo-data" });
  Object.assign(withPrivateFields.pet.rig.body, {
    photoData: "private-photo-data",
  });
  withPrivateFields.pet.rig.head = { x: 0.7, y: 0.3 };
  Object.assign(withPrivateFields.pet.rig.head, {
    photoData: "private-photo-data",
  });
  Object.assign(withPrivateFields.pet.strokes[0].points[0], {
    photoData: "private-photo-data",
  });
  const restored = validateProject(withPrivateFields);
  assert.ok(!JSON.stringify(restored).includes("private-photo-data"));
});

test("corrupt JSON, oversized files, non-finite coordinates and unsupported versions fail closed", () => {
  assert.throws(() => parseProject("{broken"));
  assert.throws(() => parseProject(" ".repeat(8 * 1024 * 1024 + 1)));
  const badPoint = createProject(customPet());
  badPoint.pet.rig.legs[0].joints[0].x = NaN;
  assert.throws(() => validateProject(badPoint));
  const badVersion = { ...createProject(customPet()), version: 2 };
  assert.throws(() => validateProject(badVersion));
});

test("separately authored limb-segment strokes retain shared endpoints after skinning throughout motion", () => {
  const pet = customPet([4, 4, 4, 4]);
  pet.strokes = pet.rig.legs.flatMap((leg) =>
    leg.joints.slice(1).map((joint, index) => ({
      id: `${leg.id}:ink-segment:${index}`,
      color: "#5e7451",
      width: 0.012,
      points: [
        { x: leg.joints[index].x, y: leg.joints[index].y },
        { x: joint.x, y: joint.y },
      ],
    })),
  );
  const state = createPetState(pet, { x: 400, y: 450 });
  state.movement = 1;
  for (let frame = 0; frame <= 120; frame++) {
    state.gaitPhase = frame / 120;
    const output = deformStrokes(pet, computePose(pet, state, frame / 60));
    assert.equal(output.length, 12);
    for (let leg = 0; leg < 4; leg++) {
      closePoint(output[leg * 3].points.at(-1)!, output[leg * 3 + 1].points[0]);
      closePoint(
        output[leg * 3 + 1].points.at(-1)!,
        output[leg * 3 + 2].points[0],
      );
    }
  }
});

test("import rejects markup-bearing and reserved identifiers before editor interpolation", () => {
  const unsafe = [
    "body",
    "head",
    "__proto__",
    "constructor",
    "prototype",
    'bad" autofocus onfocus="bad',
    "bad'",
    "<script>",
    "two words",
  ];
  for (const id of unsafe)
    for (const target of ["pet", "stroke", "leg", "joint", "tail"] as const) {
      const project = createProject(customPet());
      if (target === "pet") project.pet.id = id;
      if (target === "stroke") project.pet.strokes[0].id = id;
      if (target === "leg") project.pet.rig.legs[0].id = id;
      if (target === "joint") project.pet.rig.legs[0].joints[0].id = id;
      if (target === "tail") project.pet.rig.tail = [{ id, x: 0.2, y: 0.3 }];
      assert.throws(
        () => validateProject(project),
        `${target} ID ${id} should be rejected`,
      );
    }
});

test("exact birth dates reject impossible dates and honor leap years without normalization", () => {
  for (const date of [
    "",
    "2026-02-29",
    "2026-04-31",
    "1900-02-29",
    "2026-13-01",
    "2026-1-1",
  ]) {
    const project = createProject(customPet());
    project.birth.mode = "exact";
    project.birth.date = date;
    assert.throws(() => validateProject(project), `invalid birth date ${date}`);
  }
  for (const date of ["2026-02-28", "2000-02-29", "2024-02-29", "2026-12-31"]) {
    const project = createProject(customPet());
    project.birth.mode = "exact";
    project.birth.date = date;
    assert.equal(validateProject(project).birth.date, date);
  }
  const approximate = createProject(customPet());
  approximate.birth.mode = "season";
  approximate.birth.date = "";
  assert.equal(validateProject(approximate).birth.date, "");
});

test("new turtle sample has four genuinely authored limbs with matching rig topology", () => {
  const pet = createSample("turtle");
  assert.equal(pet.rig.legs.length, 4);
  assert.equal(new Set(pet.rig.legs.map((l) => l.id)).size, 4);
  for (const leg of pet.rig.legs) {
    assert.equal(leg.joints.length, 3);
    assert.ok(
      pet.strokes.some(
        (stroke) =>
          stroke.points.length === leg.joints.length &&
          stroke.points.every(
            (p, i) => p.x === leg.joints[i].x && p.y === leg.joints[i].y,
          ),
      ),
      "every limb must have authored ink",
    );
  }
  assert.deepEqual(parseProject(JSON.stringify(createProject(pet))).pet, pet);
  const state = createPetState(pet, { x: 400, y: 450 });
  state.movement = 1;
  for (let frame = 0; frame <= 120; frame++) {
    state.gaitPhase = frame / 120;
    assertConnected(pet, computePose(pet, state, frame / 60));
  }
});

test("invalid pen-pressure data is rejected while zero and maximum pressure survive", () => {
  for (const pressure of [-1, 1.01, NaN, Infinity]) {
    const project = createProject(customPet());
    project.pet.strokes[0].points[0].pressure = pressure;
    assert.throws(() => validateProject(project));
  }
  const project = createProject(customPet());
  project.pet.strokes[0].points[0].pressure = 0;
  project.pet.strokes[0].points[1].pressure = 1;
  const restored = parseProject(JSON.stringify(project));
  assert.equal(restored.pet.strokes[0].points[0].pressure, 0);
  assert.equal(restored.pet.strokes[0].points[1].pressure, 1);
});

test("photo tracing decodes the local File without fetch and keeps the bitmap ephemeral", async () => {
  const originalDecode = Object.getOwnPropertyDescriptor(
    globalThis,
    "createImageBitmap",
  );
  const originalFetch = globalThis.fetch;
  let closed = 0,
    decoded = 0,
    requests = 0;
  const bitmap = {
    width: 640,
    height: 480,
    close() {
      closed++;
    },
  } as ImageBitmap;
  const photo = new File(
    [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
    "local-picture.png",
    {
      type: "image/png",
    },
  );
  Object.defineProperty(globalThis, "createImageBitmap", {
    configurable: true,
    value: async (input: Blob, options: ImageBitmapOptions) => {
      assert.equal(input, photo);
      assert.equal(options.imageOrientation, "from-image");
      decoded++;
      return bitmap;
    },
  });
  globalThis.fetch = async () => {
    requests++;
    throw new Error("Photo tracing may not send a network request");
  };
  try {
    const reference = await loadTracingReference(photo);
    assert.equal(decoded, 1);
    assert.equal(requests, 0);
    assert.equal(reference.bitmap, bitmap);
    assert.equal(reference.fileName, photo.name);
    assert.equal(reference.opacity, 0.3);
    assert.deepEqual(Object.keys(reference).sort(), [
      "bitmap",
      "fileName",
      "offsetX",
      "offsetY",
      "opacity",
      "scale",
    ]);
    releaseTracingReference(reference);
    assert.equal(closed, 1);
    releaseTracingReference(null);
    assert.equal(closed, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDecode)
      Object.defineProperty(globalThis, "createImageBitmap", originalDecode);
    else Reflect.deleteProperty(globalThis, "createImageBitmap");
  }
});

test("photo tracing blocks SVG, empty/oversize inputs and excessive decoded dimensions", async () => {
  const originalDecode = Object.getOwnPropertyDescriptor(
    globalThis,
    "createImageBitmap",
  );
  let decoded = 0,
    closed = 0;
  Object.defineProperty(globalThis, "createImageBitmap", {
    configurable: true,
    value: async () => {
      decoded++;
      return {
        width: 8001,
        height: 100,
        close() {
          closed++;
        },
      };
    },
  });
  try {
    await assert.rejects(
      loadTracingReference(
        new File(["<svg/>"], "vector.svg", { type: "image/svg+xml" }),
      ),
    );
    await assert.rejects(
      loadTracingReference(new File([], "empty.png", { type: "image/png" })),
    );
    await assert.rejects(
      loadTracingReference({
        type: "image/png",
        size: 12 * 1024 * 1024 + 1,
        name: "too-large.png",
      } as File),
    );
    await assert.rejects(
      loadTracingReference(
        new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], "spoofed.png", {
          type: "image/png",
        }),
      ),
    );
    assert.equal(decoded, 0, "rejected formats/files should not be decoded");
    await assert.rejects(
      loadTracingReference(
        new File(
          [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
          "wide.png",
          { type: "image/png" },
        ),
      ),
    );
    assert.equal(decoded, 1);
    assert.equal(closed, 1, "oversize decoded bitmap must be closed");
  } finally {
    if (originalDecode)
      Object.defineProperty(globalThis, "createImageBitmap", originalDecode);
    else Reflect.deleteProperty(globalThis, "createImageBitmap");
  }
});

test("photo underlay drawing preserves aspect ratio, opacity and context state on normal rendering", () => {
  const bitmap = { width: 800, height: 400, close() {} } as ImageBitmap;
  let saved = 0,
    restored = 0;
  const calls: unknown[][] = [];
  const alphaStack: number[] = [];
  const spy = {
    globalAlpha: 1,
    save() {
      saved++;
      alphaStack.push(this.globalAlpha);
    },
    restore() {
      restored++;
      this.globalAlpha = alphaStack.pop()!;
    },
    drawImage(...args: unknown[]) {
      assert.equal(this.globalAlpha, 0.3);
      calls.push(args);
    },
  };
  const ctx = spy as unknown as CanvasRenderingContext2D;
  drawTracingReference(
    ctx,
    {
      bitmap,
      opacity: 0.3,
      scale: 0.8,
      offsetX: 0.1,
      offsetY: -0.1,
      fileName: "local.png",
    },
    600,
    600,
  );
  assert.equal(saved, 1);
  assert.equal(restored, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], bitmap);
  [120, 120, 480, 240].forEach((expected, i) =>
    near(calls[0][i + 1] as number, expected),
  );
  assert.equal(spy.globalAlpha, 1);
});

test("growth, food history and derived stage survive real project JSON and local-storage APIs", () => {
  const project = createProject(customPet());
  const originalPet = structuredClone(project.pet);
  for (let n = 0; n < 18; n++)
    project.growth = feedGrowth(project.growth, FOOD_OPTIONS[n % 3].id);
  project.growth = petGrowth(project.growth);
  assert.deepEqual(project.growth, {
    experience: 109,
    foodCounts: { seeds: 6, berry: 6, carrot: 6 },
  });
  const stage = getGrowthStage(project.growth.experience);
  assert.equal(stage.id, "bloom");
  const imported = parseProject(JSON.stringify(project));
  assert.deepEqual(imported.growth, project.growth);
  const values = new Map<string, string>();
  const storage = {
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    getItem: (key: string) => values.get(key) ?? null,
  };
  saveProject(imported, storage);
  const restored = loadProject(storage)!;
  assert.deepEqual(restored.growth, project.growth);
  assert.deepEqual(getGrowthStage(restored.growth.experience), stage);
  assert.deepEqual(
    restored.pet,
    originalPet,
    "growth scales display but does not stretch saved ink or rig",
  );
});

test("old version-one projects migrate missing growth without losing name, custom rig or care", () => {
  const project = createProject(customPet([4, 4, 4, 4]));
  project.care = { meals: 8, drinks: 7, affection: 6 };
  const legacy = structuredClone(project) as Partial<typeof project>;
  delete legacy.growth;
  const migrated = parseProject(JSON.stringify(legacy));
  assert.deepEqual(migrated.growth, createGrowth());
  assert.deepEqual(migrated.pet, project.pet);
  assert.deepEqual(migrated.care, project.care);
  const migratedAgain = parseProject(JSON.stringify(migrated));
  assert.deepEqual(migratedAgain, migrated);
});

test("malformed explicit growth is rejected instead of silently losing saved progress", () => {
  for (const growth of [
    null,
    false,
    0,
    "",
    { experience: -1, foodCounts: { seeds: 0, berry: 0, carrot: 0 } },
    { experience: 2.5, foodCounts: { seeds: 0, berry: 0, carrot: 0 } },
    { experience: 5, foodCounts: { seeds: 0, berry: 0 } },
    { experience: 5, foodCounts: { seeds: 0, berry: 0, carrot: 1_000_001 } },
  ]) {
    const project = { ...createProject(customPet()), growth };
    assert.throws(
      () => validateProject(project),
      `bad growth ${JSON.stringify(growth)}`,
    );
  }
});

test("years-old care data imports without growth decay or unrequested offline rewards", () => {
  const project = createProject(customPet());
  project.createdAt = "2020-01-01T00:00:00.000Z";
  project.updatedAt = "2020-01-01T00:00:00.000Z";
  project.growth = {
    experience: 140,
    foodCounts: { seeds: 3, berry: 4, carrot: 6 },
  };
  const restored = parseProject(JSON.stringify(project));
  assert.deepEqual(restored.growth, project.growth);
  assert.equal(getGrowthStage(restored.growth.experience).id, "companion");
});

function recordingCanvas() {
  const calls: unknown[][] = [];
  const values: Record<string, unknown> = { globalAlpha: 1 };
  const context = new Proxy(values, {
    get(target, key: string) {
      if (key in target) return target[key];
      if (key === "createLinearGradient" || key === "createRadialGradient")
        return (...args: unknown[]) => {
          calls.push([key, ...args]);
          return {
            addColorStop: (...stops: unknown[]) =>
              calls.push(["addColorStop", ...stops]),
          };
        };
      return (...args: unknown[]) => {
        calls.push([key, ...args]);
      };
    },
    set(target, key: string, value) {
      target[key] = value;
      calls.push(["set", key, typeof value === "object" ? "gradient" : value]);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { context, calls };
}

test("three selected foods reach distinct actual scene drawing paths", () => {
  const pet = customPet([]),
    state = createPetState(pet, { x: 400, y: 450 });
  const weather = createDemoWeather("sunny", "day");
  const expectedFill = {
    seeds: "#7b6447",
    berry: "#9b647f",
    carrot: "#d89758",
  };
  const outputs = FOOD_OPTIONS.map((food) => {
    const { context, calls } = recordingCanvas();
    renderScene(context, {
      width: 900,
      height: 600,
      time: 0,
      pet,
      state,
      weather,
      showRig: false,
      reducedMotion: true,
      food: { x: 600, y: 460, kind: food.id },
    });
    assert.ok(
      calls.some(
        (call) =>
          call[0] === "set" &&
          call[1] === "fillStyle" &&
          call[2] === expectedFill[food.id],
      ),
      `missing ${food.id} authored fill`,
    );
    return JSON.stringify(calls);
  });
  assert.equal(
    new Set(outputs).size,
    3,
    "the canvas commands must differ, not only the food labels",
  );
});

test("saved growth stages change actual scene ink size while retaining authored geometry", () => {
  const pet = customPet([]),
    original = structuredClone(pet),
    state = createPetState(pet, { x: 400, y: 450 });
  const weather = createDemoWeather("sunny", "day");
  const renderAt = (experience: number) => {
    const { context, calls } = recordingCanvas();
    renderScene(context, {
      width: 900,
      height: 600,
      time: 0,
      pet,
      state,
      weather,
      showRig: false,
      reducedMotion: true,
      petScale: getGrowthStage(experience).scale,
    });
    const petStart = calls.findIndex((call) => call[0] === "translate");
    assert.ok(petStart >= 0);
    return calls.slice(petStart);
  };
  const small = renderAt(0),
    grown = renderAt(140);
  assert.deepEqual(small[0], grown[0], "growth retains the same ground anchor");
  const lineWidth = (calls: unknown[][]) =>
    calls.find(
      (call) => call[0] === "set" && call[1] === "lineWidth",
    )![2] as number;
  near(lineWidth(grown) / lineWidth(small), 1.08 / 0.8);
  assert.deepEqual(pet, original);
});

test("food and water stay reachable at both meadow edges across mobile and desktop widths", () => {
  for (const sceneWidth of [240, 360, 600, 800, 1200]) {
    const bounds = worldBounds(sceneWidth),
      height = 500,
      groundY = height * 0.82;
    for (const startX of [
      bounds.minX,
      (bounds.minX + bounds.maxX) / 2,
      bounds.maxX,
      sceneWidth * 0.8,
    ]) {
      for (const [action, resource, offset] of [
        ["eat", "food", 70],
        ["drink", "water", 80],
      ] as const) {
        const state = createPetState(customPet(), { x: startX, y: groundY });
        const bowl = placeResource(state.position, sceneWidth, height, offset);
        assert.ok(bowl.x >= bounds.minX && bowl.x <= bounds.maxX);
        setPetAction(state, action, bowl);
        let reachedConsumption = false;
        for (let frame = 0; frame < 15 * 60; frame++) {
          updatePet(state, 1 / 60, {
            ...bounds,
            height,
            groundY,
            [resource]: bowl,
            speed: 46,
            autonomous: true,
          });
          if (
            state.currentAction === action &&
            state.actionTime > 1.4 &&
            Math.abs(state.position.x - bowl.x) < 28
          )
            reachedConsumption = true;
        }
        assert.equal(
          reachedConsumption,
          true,
          `${action} unreachable at width ${sceneWidth}, start ${startX}`,
        );
      }
    }
  }
});

test("food remains reachable when the scene shrinks after the bowl is placed", () => {
  for (const [fromWidth, toWidth] of [
    [1200, 240],
    [800, 360],
    [360, 1200],
  ]) {
    const height = 500,
      groundY = height * 0.82,
      oldBounds = worldBounds(fromWidth);
    const state = createPetState(customPet(), {
      x: oldBounds.maxX,
      y: groundY,
    });
    let food = placeResource(state.position, fromWidth, height);
    setPetAction(state, "eat", food);
    for (let i = 0; i < 15; i++)
      updatePet(state, 1 / 60, { ...oldBounds, height, groundY, food });
    state.position.x = (state.position.x / fromWidth) * toWidth;
    food = {
      x: clampWorldX((food.x / fromWidth) * toWidth, toWidth),
      y: groundY,
    };
    const bounds = worldBounds(toWidth);
    let reachedConsumption = false;
    for (let frame = 0; frame < 15 * 60; frame++) {
      updatePet(state, 1 / 60, { ...bounds, height, groundY, food, speed: 46 });
      if (
        state.currentAction === "eat" &&
        state.actionTime > 1.4 &&
        Math.abs(state.position.x - food.x) < 28
      )
        reachedConsumption = true;
    }
    assert.equal(
      reachedConsumption,
      true,
      `food unreachable after resize ${fromWidth} → ${toWidth}`,
    );
  }
});
