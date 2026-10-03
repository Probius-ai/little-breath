import assert from "node:assert/strict";
import test from "node:test";
import {
  CareGesture,
  clampPlacement,
  projectDrop,
  type CareItem,
} from "../src/care-placement.ts";
import { worldBounds } from "../src/world.ts";
import {
  createPetState,
  setPetAction,
  updatePet,
} from "../src/engine/index.ts";
import { createSample } from "../src/project.ts";

const scene = { left: 123, top: 57, width: 800, height: 460 };
const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≠ ${expected}`);

test("drop projection uses scene-local CSS coordinates and the reachable ground", () => {
  const point = projectDrop({ x: 523, y: 167 }, scene);
  assert.ok(point);
  near(point.x, 400);
  near(point.y, 460 * 0.82);
});

test("every scene corner projects to a reachable endpoint, never the decoration area", () => {
  const { minX, maxX } = worldBounds(scene.width);
  for (const [x, expectedX] of [
    [scene.left, minX],
    [scene.left + scene.width, maxX],
  ]) {
    for (const y of [scene.top, scene.top + scene.height]) {
      const point = projectDrop({ x, y }, scene);
      assert.ok(point);
      near(point.x, expectedX);
      near(point.y, scene.height * 0.82);
    }
  }
});

test("outside drops are rejected on all four sides instead of being clamped in", () => {
  for (const point of [
    { x: scene.left - 0.01, y: scene.top + 100 },
    { x: scene.left + scene.width + 0.01, y: scene.top + 100 },
    { x: scene.left + 100, y: scene.top - 0.01 },
    { x: scene.left + 100, y: scene.top + scene.height + 0.01 },
    { x: -99999, y: -99999 },
    { x: 99999, y: 99999 },
  ])
    assert.equal(projectDrop(point, scene), null);
});

test("pointer height changes do not misrepresent the bowl's ground landing", () => {
  const ground = scene.height * 0.82;
  for (let fraction = 0; fraction <= 1; fraction += 0.125) {
    const point = projectDrop(
      { x: scene.left + 250, y: scene.top + scene.height * fraction },
      scene,
    );
    assert.deepEqual(point, { x: 250, y: ground });
  }
});

test("hidden, zero-size, and malformed scene geometry cannot produce a placement", () => {
  for (const width of [0, -1, NaN, Infinity])
    assert.equal(projectDrop({ x: 125, y: 59 }, { ...scene, width }), null);
  for (const height of [0, -1, NaN, Infinity])
    assert.equal(projectDrop({ x: 125, y: 59 }, { ...scene, height }), null);
  for (const coordinate of [NaN, Infinity, -Infinity]) {
    assert.equal(projectDrop({ x: coordinate, y: 100 }, scene), null);
    assert.equal(projectDrop({ x: 200, y: coordinate }, scene), null);
    assert.equal(
      projectDrop({ x: 200, y: 100 }, { ...scene, left: coordinate }),
      null,
    );
    assert.equal(
      projectDrop({ x: 200, y: 100 }, { ...scene, top: coordinate }),
      null,
    );
  }
});

test("projection is deterministic and leaves the pointer and rectangle untouched", () => {
  const point = Object.freeze({ x: 570.5, y: 341.25 });
  const rect = Object.freeze({ ...scene });
  const first = projectDrop(point, rect);
  assert.deepEqual(projectDrop(point, rect), first);
  assert.deepEqual(point, { x: 570.5, y: 341.25 });
  assert.deepEqual(rect, scene);
});

test("resize and scroll use the latest scene rectangle rather than stale coordinates", () => {
  const point = { x: 410, y: 200 };
  assert.deepEqual(projectDrop(point, scene), {
    x: 287,
    y: 460 * 0.82,
  });
  const resized = { left: 25, top: 25, width: 390, height: 320 };
  assert.deepEqual(projectDrop(point, resized), {
    x: worldBounds(390).maxX,
    y: 320 * 0.82,
  });
  assert.equal(projectDrop(point, { ...resized, top: 250 }), null);
});

test("all projected positions remain finite and reachable across narrow and wide scenes", () => {
  for (const width of [1, 10, 64, 240, 390, 820, 1440, 2560]) {
    const rect = { left: -10.5, top: 40.25, width, height: 320.5 };
    const bounds = worldBounds(width);
    for (let i = 0; i <= 100; i++) {
      const point = projectDrop(
        { x: rect.left + (width * i) / 100, y: rect.top + 25 },
        rect,
      );
      assert.ok(point);
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
      assert.ok(point.x >= bounds.minX && point.x <= bounds.maxX);
      near(point.y, rect.height * 0.82);
    }
  }
});

test("the actual pet engine can consume food and water at both preview extremes", () => {
  const pet = createSample("turtle");
  for (const width of [240, 390, 820, 1440]) {
    const height = 420;
    const bounds = worldBounds(width);
    for (const x of [0, width]) {
      const drop = projectDrop(
        { x, y: 100 },
        { left: 0, top: 0, width, height },
      )!;
      for (const action of ["eat", "drink"] as const) {
        const state = createPetState(pet, {
          x: x === 0 ? bounds.maxX : bounds.minX,
          y: height * 0.82,
        });
        setPetAction(state, action, drop);
        let reached = false;
        for (let frame = 0; frame < 40 * 60; frame++) {
          updatePet(state, 1 / 60, {
            ...bounds,
            height,
            groundY: height * 0.82,
            speed: 46,
            ...(action === "eat" ? { food: drop } : { water: drop }),
          });
          if (
            state.currentAction === action &&
            state.actionTime > 1.4 &&
            Math.abs(state.position.x - drop.x) < 28
          ) {
            reached = true;
            break;
          }
        }
        assert.equal(reached, true, `${action} unreachable at ${x}/${width}`);
      }
    }
  }
});

test("tray taps select an item while an actual drag places it only at its preview", () => {
  const gesture = new CareGesture();
  assert.equal(gesture.begin(1, "carrot", { x: 800, y: 100 }), true);
  gesture.move(1, { x: 803, y: 104 }, scene);
  assert.equal(gesture.active?.dragging, false);
  assert.deepEqual(gesture.finish(1, { x: 803, y: 104 }, scene), {
    type: "select",
    item: "carrot",
  });
  assert.equal(gesture.active, null);

  assert.equal(gesture.begin(2, "water", { x: 800, y: 100 }), true);
  const preview = gesture.move(2, { x: 450, y: 250 }, scene);
  assert.equal(gesture.active?.dragging, true);
  assert.deepEqual(preview, projectDrop({ x: 450, y: 250 }, scene));
  assert.deepEqual(gesture.finish(2, { x: 450, y: 250 }, scene), {
    type: "place",
    item: "water",
    point: preview,
  });
  assert.equal(gesture.active, null);
});

test("select-and-click scene placement does not require dragging", () => {
  const gesture = new CareGesture();
  const point = { x: scene.left + 140, y: scene.top + 120 };
  gesture.begin(7, "berry", point, "scene");
  assert.deepEqual(gesture.finish(7, point, scene), {
    type: "place",
    item: "berry",
    point: projectDrop(point, scene),
  });
  assert.equal(gesture.active, null);
});

test("secondary pointers cannot replace, move, cancel, or finish the active item", () => {
  const gesture = new CareGesture();
  gesture.begin(1, "seeds", { x: 800, y: 100 });
  assert.equal(gesture.begin(2, "water", { x: 700, y: 150 }), false);
  assert.equal(gesture.move(2, { x: 300, y: 250 }, scene), null);
  assert.equal(gesture.finish(2, { x: 300, y: 250 }, scene), null);
  assert.equal(gesture.active?.pointerId, 1);
  assert.equal(gesture.active?.item, "seeds");
  assert.equal(gesture.active?.dragging, false);
  gesture.move(1, { x: 500, y: 250 }, scene);
  assert.deepEqual(gesture.finish(1, { x: 500, y: 250 }, scene), {
    type: "place",
    item: "seeds",
    point: projectDrop({ x: 500, y: 250 }, scene),
  });
  assert.equal(gesture.finish(1, { x: 500, y: 250 }, scene), null);
});

test("offscene and UI-blocked releases cancel without yielding a place result", () => {
  for (const blocked of [false, true]) {
    const gesture = new CareGesture();
    gesture.begin(1, "carrot", { x: 800, y: 100 });
    gesture.move(1, { x: 500, y: 250 }, scene);
    const release = blocked
      ? { x: 500, y: 250 }
      : { x: scene.left - 1, y: 250 };
    assert.equal(gesture.move(1, release, scene, blocked), null);
    assert.deepEqual(gesture.finish(1, release, scene, blocked), {
      type: "cancel",
    });
    assert.equal(gesture.active, null);
  }
});

test("explicit cancellation clears an active drag and a later release cannot place", () => {
  const gesture = new CareGesture();
  gesture.begin(15, "water", { x: 800, y: 100 });
  gesture.move(15, { x: 500, y: 250 }, scene);
  gesture.cancel();
  gesture.cancel();
  assert.equal(gesture.active, null);
  assert.equal(gesture.finish(15, { x: 500, y: 250 }, scene), null);
  assert.equal(gesture.begin(16, "berry", { x: 800, y: 100 }), true);
});

test("release projects through the current resized geometry and keyboard clamp agrees", () => {
  const gesture = new CareGesture();
  gesture.begin(1, "berry", { x: 800, y: 100 });
  gesture.move(1, { x: 450, y: 250 }, scene);
  const resized = { left: 25, top: 25, width: 440, height: 320 };
  const point = projectDrop({ x: 450, y: 250 }, resized)!;
  assert.deepEqual(gesture.finish(1, { x: 450, y: 250 }, resized), {
    type: "place",
    item: "berry",
    point,
  });
  assert.deepEqual(clampPlacement({ x: 425, y: 999 }, 440, 320), point);
  assert.deepEqual(clampPlacement({ x: -20, y: -50 }, 440, 320), {
    x: worldBounds(440).minX,
    y: 320 * 0.82,
  });
});

test("invalid gesture starts never acquire a pointer or disturb a later valid gesture", () => {
  const gesture = new CareGesture();
  assert.equal(gesture.begin(NaN, "seeds", { x: 300, y: 200 }), false);
  assert.equal(gesture.begin(1, "water", { x: Infinity, y: 200 }), false);
  assert.equal(
    gesture.begin(1, "__proto__" as CareItem, { x: 300, y: 200 }),
    false,
  );
  assert.equal(gesture.active, null);
  assert.equal(gesture.begin(1, "water", { x: 300, y: 200 }), true);
  assert.deepEqual(gesture.finish(1, { x: NaN, y: 200 }, scene), {
    type: "cancel",
  });
  assert.equal(gesture.active, null);
});

test("gesture input and active snapshots cannot mutate the owned pointer state", () => {
  const gesture = new CareGesture();
  const start = { x: 300, y: 200 };
  gesture.begin(1, "seeds", start);
  start.x = -100;
  const snapshot = gesture.active!;
  snapshot.start.x = -200;
  snapshot.point.y = -300;
  snapshot.item = "water";
  assert.equal(gesture.active?.start.x, 300);
  assert.equal(gesture.active?.point.y, 200);
  assert.equal(gesture.active?.item, "seeds");
  gesture.move(1, { x: 308, y: 200 }, scene);
  assert.equal(gesture.active?.dragging, true);
});
