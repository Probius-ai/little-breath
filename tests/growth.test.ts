import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createGrowth,
  feedGrowth,
  FOOD_OPTIONS,
  getGrowthStage,
  MAX_GROWTH_VALUE,
  petGrowth,
  type FoodId,
} from "../src/growth.js";

test("each new friend has independent empty growth counters", () => {
  const first = createGrowth();
  const second = createGrowth();
  assert.deepEqual(first, {
    experience: 0,
    foodCounts: { seeds: 0, berry: 0, carrot: 0 },
  });
  first.foodCounts.seeds = 10;
  assert.equal(second.foodCounts.seeds, 0);
});

test("the three foods have different shapes, rewards, and truthful display text", () => {
  assert.deepEqual(
    FOOD_OPTIONS.map((food) => food.id),
    ["seeds", "berry", "carrot"],
  );
  assert.equal(new Set(FOOD_OPTIONS.map((food) => food.icon)).size, 3);
  assert.equal(new Set(FOOD_OPTIONS.map((food) => food.xp)).size, 3);
  for (const food of FOOD_OPTIONS) {
    assert.ok(food.name.length > 0 && food.message.length > 0);
    assert.ok(food.effect.includes(`+${food.xp}`));
    assert.ok(Number.isInteger(food.xp) && food.xp > 0);
    assert.ok(Object.isFrozen(food));
  }
  assert.ok(Object.isFrozen(FOOD_OPTIONS));
});

test("completed meals reward their selected food and increment only its counter", () => {
  for (const food of FOOD_OPTIONS) {
    const next = feedGrowth(createGrowth(), food.id);
    assert.equal(next.experience, food.xp);
    for (const option of FOOD_OPTIONS)
      assert.equal(next.foodCounts[option.id], option.id === food.id ? 1 : 0);
  }
});

test("feeding is immutable, even with a frozen input and counts", () => {
  const original = Object.freeze({
    experience: 17,
    foodCounts: Object.freeze({ seeds: 1, berry: 2, carrot: 3 }),
  });
  const next = feedGrowth(original, "carrot");
  assert.deepEqual(next, {
    experience: 25,
    foodCounts: { seeds: 1, berry: 2, carrot: 4 },
  });
  assert.notEqual(next, original);
  assert.notEqual(next.foodCounts, original.foodCounts);
  assert.equal(original.experience, 17);
});

test("exact milestones change stage labels and physical size", () => {
  const checkpoints = [
    [0, "sprout", 0.8, 20],
    [19, "sprout", 0.8, 20],
    [20, "bud", 0.9, 60],
    [59, "bud", 0.9, 60],
    [60, "bloom", 1, 140],
    [139, "bloom", 1, 140],
    [140, "companion", 1.08, null],
    [999, "companion", 1.08, null],
  ] as const;
  for (const [experience, id, scale, nextAt] of checkpoints) {
    const stage = getGrowthStage(experience);
    assert.equal(stage.id, id);
    assert.equal(stage.scale, scale);
    assert.equal(stage.nextAt, nextAt);
    assert.ok(stage.label.length > 0);
  }
  assert.equal(
    new Set([0, 20, 60, 140].map((xp) => getGrowthStage(xp).label)).size,
    4,
  );
});

test("progress measures the current stage rather than total lifetime experience", () => {
  for (const experience of [0, 20, 60])
    assert.equal(getGrowthStage(experience).progress, 0);
  for (const experience of [10, 40, 100])
    assert.equal(getGrowthStage(experience).progress, 0.5);
  assert.equal(getGrowthStage(19).progress, 0.95);
  assert.equal(getGrowthStage(140).progress, 1);
  assert.equal(getGrowthStage(MAX_GROWTH_VALUE).progress, 1);
});

test("successive meals can grow a friend through every milestone", () => {
  let growth = createGrowth();
  for (let i = 0; i < 5; i++) growth = feedGrowth(growth, "seeds");
  assert.equal(getGrowthStage(growth.experience).id, "bud");
  for (let i = 0; i < 5; i++) growth = feedGrowth(growth, "carrot");
  assert.equal(getGrowthStage(growth.experience).id, "bloom");
  for (let i = 0; i < 10; i++) growth = feedGrowth(growth, "carrot");
  assert.equal(getGrowthStage(growth.experience).id, "companion");
  assert.deepEqual(growth.foodCounts, { seeds: 5, berry: 0, carrot: 15 });
});

test("gentle affection grows the friend without inventing a meal or mutating history", () => {
  const original = {
    experience: 19,
    foodCounts: { seeds: 2, berry: 1, carrot: 0 },
  };
  const next = petGrowth(original);
  assert.equal(next.experience, 20);
  assert.equal(getGrowthStage(next.experience).id, "bud");
  assert.deepEqual(next.foodCounts, original.foodCounts);
  assert.notEqual(next.foodCounts, original.foodCounts);
  assert.equal(original.experience, 19);
});

test("growth survives JSON storage and does not depend on wall-clock time", () => {
  const saved = feedGrowth(feedGrowth(createGrowth(), "berry"), "carrot");
  const restored = JSON.parse(JSON.stringify(saved));
  assert.deepEqual(restored, saved);
  assert.deepEqual(
    getGrowthStage(restored.experience),
    getGrowthStage(saved.experience),
  );
  assert.deepEqual(feedGrowth(restored, "seeds"), feedGrowth(saved, "seeds"));
});

test("invalid display experience stays finite and cannot break a progress bar", () => {
  for (const invalid of [
    -100,
    Number.NaN,
    Number.NEGATIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ]) {
    assert.deepEqual(getGrowthStage(invalid), getGrowthStage(0));
  }
  assert.equal(getGrowthStage(19.9).id, "sprout");
  assert.equal(getGrowthStage(Number.MAX_VALUE).id, "companion");
});

test("unknown food ids are rejected without changing saved progress", () => {
  const growth = createGrowth();
  assert.throws(() => feedGrowth(growth, "__proto__" as FoodId), RangeError);
  assert.deepEqual(growth, createGrowth());
});

test("bounded counters continue to produce valid persisted values", () => {
  const growth = {
    experience: MAX_GROWTH_VALUE - 1,
    foodCounts: { seeds: MAX_GROWTH_VALUE, berry: 0, carrot: 0 },
  };
  const fed = feedGrowth(growth, "seeds");
  assert.equal(fed.experience, MAX_GROWTH_VALUE);
  assert.equal(fed.foodCounts.seeds, MAX_GROWTH_VALUE);
  assert.equal(petGrowth(fed).experience, MAX_GROWTH_VALUE);
  assert.equal(getGrowthStage(fed.experience).id, "companion");
});
