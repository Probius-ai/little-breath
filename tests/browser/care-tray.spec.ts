import { expect, test, type Page } from "@playwright/test";
import { createProject, createSample, type Project } from "../../src/project";
import { worldBounds } from "../../src/world";

type Point = { x: number; y: number };
type RenderedCare = { food?: Point; water?: Point };
type CareWindow = Window & { __renderedCare: RenderedCare };
const storageKey = "little-breath.project.v1";

async function loadGarden(page: Page, project = createProject()) {
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(value));
      // Observe the actual canvas bowls without adding production test hooks.
      // Clear the snapshot at the start of each scene frame, then record its
      // distinctive food/water bowl path in scene-local CSS coordinates.
      const target = window as unknown as CareWindow;
      target.__renderedCare = {};
      const clear = CanvasRenderingContext2D.prototype.clearRect;
      CanvasRenderingContext2D.prototype.clearRect = function (...args) {
        if (this.canvas.id === "scene") target.__renderedCare = {};
        return clear.apply(this, args);
      };
      const ellipse = CanvasRenderingContext2D.prototype.ellipse;
      CanvasRenderingContext2D.prototype.ellipse = function (...args) {
        if (this.canvas.id === "scene") {
          const [x, y, rx, ry] = args;
          if (rx === 21 && ry === 6 && this.fillStyle === "#cfad81")
            target.__renderedCare.food = { x, y };
          if (rx === 22 && ry === 7 && this.fillStyle === "#96bab8")
            target.__renderedCare.water = { x, y };
        }
        return ellipse.apply(this, args);
      };
    },
    { key: storageKey, value: project },
  );
  await page.goto("/");
  await expect(page.locator("#scene")).toBeVisible();
}

async function savedProject(page: Page): Promise<Project> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    storageKey,
  );
}

async function renderedCare(page: Page): Promise<RenderedCare> {
  return page.evaluate(() => (window as unknown as CareWindow).__renderedCare);
}

async function previewPoint(page: Page): Promise<Point> {
  await expect(page.locator("#care-drop-preview")).toBeVisible();
  return page.locator("#care-drop-preview").evaluate((element) => ({
    x: parseFloat((element as HTMLElement).style.left),
    y: parseFloat((element as HTMLElement).style.top),
  }));
}

async function expectRendered(
  page: Page,
  kind: "food" | "water",
  point: Point,
) {
  await expect
    .poll(async () => {
      const actual = (await renderedCare(page))[kind];
      return actual
        ? Math.max(Math.abs(actual.x - point.x), Math.abs(actual.y - point.y))
        : Infinity;
    })
    .toBeLessThan(0.1);
}

async function openTray(page: Page) {
  const toggle = page.locator("#care-tray-toggle");
  if ((await toggle.getAttribute("aria-expanded")) !== "true")
    await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}

async function pauseGarden(page: Page) {
  await page.locator('[data-action="pause"]').click();
}

async function startMouseDrag(page: Page, item: string, point: Point) {
  const button = page.locator(`[data-care-item="${item}"]`);
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(point.x, point.y, { steps: 8 });
}

test("side tray starts collapsed and stays reachable without covering the walkable meadow", async ({
  page,
}) => {
  await loadGarden(page);
  const toggle = page.locator("#care-tray-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
    { width: 820, height: 1180 },
  ]) {
    await page.setViewportSize(viewport);
    await openTray(page);
    const scene = (await page.locator("#scene").boundingBox())!;
    const buttons = page.locator("[data-care-item]");
    await expect(buttons).toHaveCount(4);
    for (const button of await buttons.all()) {
      await expect(button).toBeVisible();
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(
        scene.x + worldBounds(scene.width).maxX,
      );
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator('[data-care-item="seeds"]')).toBeHidden();
  }
});

test("mouse drop previews the exact clamped landing and rewards one carrot only after consumption", async ({
  page,
}) => {
  await loadGarden(page);
  await pauseGarden(page);
  await openTray(page);
  const box = (await page.locator("#scene").boundingBox())!;
  await startMouseDrag(page, "carrot", {
    x: box.x + 2,
    y: box.y + box.height * 0.6,
  });
  const preview = await previewPoint(page);
  expect(preview.x).toBeCloseTo(worldBounds(box.width).minX, 3);
  expect(preview.y).toBeCloseTo(box.height * 0.82, 3);
  expect(await renderedCare(page)).toEqual({});
  await page.mouse.up();
  await expect(page.locator("#care-drop-preview")).toBeHidden();
  await expectRendered(page, "food", preview);
  expect((await savedProject(page)).care.meals).toBe(0);
  await expect(page.locator("#growth-xp")).toHaveText("0 XP");

  await expect(page.locator("#meals-value")).toHaveText("1번", {
    timeout: 20_000,
  });
  await expect(page.locator("#growth-xp")).toHaveText("8 XP");
  await expect.poll(async () => (await savedProject(page)).care.meals).toBe(1);
  const saved = await savedProject(page);
  expect(saved.growth.foodCounts).toEqual({ seeds: 0, berry: 0, carrot: 1 });
  await expect
    .poll(async () => (await renderedCare(page)).food)
    .toBeUndefined();
});

test("click selection and a scene click place one food without using the old modal", async ({
  page,
}) => {
  await loadGarden(page);
  await pauseGarden(page);
  await openTray(page);
  await page.locator('[data-care-item="berry"]').click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await renderedCare(page)).toEqual({});
  const scene = page.locator("#scene");
  const box = (await scene.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.6);
  const preview = await previewPoint(page);
  await page.mouse.down();
  await page.mouse.up();
  await expectRendered(page, "food", preview);
  await expect(page.locator("#growth-xp")).toHaveText("6 XP", {
    timeout: 15_000,
  });
  await expect.poll(async () => (await savedProject(page)).care.meals).toBe(1);
  expect((await savedProject(page)).growth.foodCounts).toEqual({
    seeds: 0,
    berry: 1,
    carrot: 0,
  });
});

test("keyboard selection, arrows and Enter place water and never award food XP", async ({
  page,
}) => {
  await loadGarden(page);
  await pauseGarden(page);
  await openTray(page);
  const water = page.locator('[data-care-item="water"]');
  await water.focus();
  await page.keyboard.press("Space");
  const scene = page.locator("#scene");
  await scene.focus();
  await scene.press("Home");
  const left = await previewPoint(page);
  await scene.press("ArrowRight");
  const moved = await previewPoint(page);
  expect(moved.x).toBeGreaterThan(left.x);
  await scene.press("End");
  const right = await previewPoint(page);
  const box = (await scene.boundingBox())!;
  expect(right.x).toBeCloseTo(worldBounds(box.width).maxX, 3);
  await scene.press("Enter");
  await expectRendered(page, "water", right);
  expect((await savedProject(page)).care.drinks).toBe(0);
  await expect
    .poll(async () => (await savedProject(page)).care.drinks, {
      timeout: 20_000,
    })
    .toBe(1);
  expect((await savedProject(page)).care.meals).toBe(0);
  await expect(page.locator("#growth-xp")).toHaveText("0 XP");
});

test("offscene, Escape, pointer cancellation and lost capture never create bowls or rewards", async ({
  page,
}) => {
  await loadGarden(page);
  await pauseGarden(page);
  await openTray(page);
  const box = (await page.locator("#scene").boundingBox())!;
  const landing = { x: box.x + box.width * 0.4, y: box.y + box.height * 0.6 };
  for (const reason of [
    "offscene",
    "escape",
    "pointercancel",
    "lostpointercapture",
  ]) {
    await startMouseDrag(page, "carrot", landing);
    await expect(page.locator("#care-drop-preview")).toBeVisible();
    if (reason === "offscene") await page.mouse.move(box.x - 5, landing.y);
    else if (reason === "escape") await page.keyboard.press("Escape");
    else {
      // Mouse pointer ids are stable in Chromium. Dispatching interruption on
      // the capture owner exercises paths that regular mouse.up cannot cover.
      await page.locator('[data-care-item="carrot"]').dispatchEvent(reason, {
        pointerId: 1,
        pointerType: "mouse",
        bubbles: true,
      });
    }
    await page.mouse.up();
    await expect(page.locator("#care-drop-preview")).toBeHidden();
    await expect(page.locator("#care-drag-ghost")).toBeHidden();
    expect(await renderedCare(page)).toEqual({});
  }
  expect((await savedProject(page)).care).toEqual({
    meals: 0,
    drinks: 0,
    affection: 0,
  });
  await expect(page.locator("#growth-xp")).toHaveText("0 XP");
});

test("a real touch drag places water at its preview without scrolling the phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadGarden(page);
  await pauseGarden(page);
  await openTray(page);
  const button = (await page
    .locator('[data-care-item="water"]')
    .boundingBox())!;
  const scene = (await page.locator("#scene").boundingBox())!;
  const start = {
    x: button.x + button.width / 2,
    y: button.y + button.height / 2,
  };
  const end = {
    x: scene.x + scene.width * 0.4,
    y: scene.y + scene.height * 0.6,
  };
  const beforeScroll = await page.evaluate(() => scrollY);
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...start, id: 1 }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ ...end, id: 1 }],
  });
  const preview = await previewPoint(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expectRendered(page, "water", preview);
  expect(await page.evaluate(() => scrollY)).toBe(beforeScroll);
  expect((await savedProject(page)).care.drinks).toBe(0);
  await session.detach();
});

test("a cancelled replacement keeps the existing meal and never changes its food reward", async ({
  page,
}) => {
  await loadGarden(page);
  await pauseGarden(page);
  await openTray(page);
  await page.locator('[data-care-item="seeds"]').click();
  const scene = page.locator("#scene");
  await scene.focus();
  const original = await previewPoint(page);
  await scene.press("Space");
  await expectRendered(page, "food", original);
  // A valid placement resumes the garden; pause again while trying the
  // cancelled replacement so the pre-existing bowl cannot be eaten first.
  await pauseGarden(page);
  const box = (await scene.boundingBox())!;
  await startMouseDrag(page, "carrot", {
    x: box.x + box.width * 0.5,
    y: box.y + box.height * 0.6,
  });
  await page.mouse.move(box.x - 4, box.y + box.height * 0.6);
  await page.mouse.up();
  await expectRendered(page, "food", original);
  expect((await savedProject(page)).growth.experience).toBe(0);
  await pauseGarden(page);
  await expect(page.locator("#growth-xp")).toHaveText("4 XP", {
    timeout: 15_000,
  });
  await expect.poll(async () => (await savedProject(page)).care.meals).toBe(1);
  expect((await savedProject(page)).growth.foodCounts).toEqual({
    seeds: 1,
    berry: 0,
    carrot: 0,
  });
});

test("a second touch cannot steal or complete the primary food drag", async ({
  page,
}) => {
  await loadGarden(page);
  await pauseGarden(page);
  await openTray(page);
  const seeds = (await page.locator('[data-care-item="seeds"]').boundingBox())!;
  const water = (await page.locator('[data-care-item="water"]').boundingBox())!;
  const scene = (await page.locator("#scene").boundingBox())!;
  const first = {
    x: seeds.x + seeds.width / 2,
    y: seeds.y + seeds.height / 2,
    id: 1,
  };
  const second = {
    x: water.x + water.width / 2,
    y: water.y + water.height / 2,
    id: 2,
  };
  const landing = {
    x: scene.x + scene.width * 0.4,
    y: scene.y + scene.height * 0.6,
    id: 1,
  };
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [first],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [first, second],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [landing, second],
  });
  const preview = await previewPoint(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [landing],
  });
  expect(await renderedCare(page)).toEqual({});
  await expect(page.locator("#care-drop-preview")).toBeVisible();
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expectRendered(page, "food", preview);
  expect((await renderedCare(page)).water).toBeUndefined();
  await session.detach();
});

test("resize cancels an unfinished drag, and previously placed bowls remain reachable", async ({
  page,
}) => {
  await loadGarden(page);
  await pauseGarden(page);
  await openTray(page);
  let box = (await page.locator("#scene").boundingBox())!;
  await startMouseDrag(page, "seeds", {
    x: box.x + box.width * 0.6,
    y: box.y + box.height * 0.6,
  });
  await previewPoint(page);
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(page.locator("#care-drop-preview")).toBeHidden();
  await expect(page.locator("#care-drag-ghost")).toBeHidden();
  await page.mouse.up();
  expect(await renderedCare(page)).toEqual({});
  expect((await savedProject(page)).care.meals).toBe(0);
  box = (await page.locator("#scene").boundingBox())!;
  await startMouseDrag(page, "seeds", {
    x: box.x + box.width * 0.5,
    y: box.y + box.height * 0.6,
  });
  const preview = await previewPoint(page);
  expect(preview.x).toBeCloseTo(box.width * 0.5, 3);
  expect(preview.y).toBeCloseTo(box.height * 0.82, 3);
  await page.mouse.up();
  await expectRendered(page, "food", preview);
  await pauseGarden(page);
  const oldWidth = box.width;
  await page.setViewportSize({ width: 390, height: 844 });
  box = (await page.locator("#scene").boundingBox())!;
  const bounds = worldBounds(box.width);
  await expectRendered(page, "food", {
    x: Math.max(
      bounds.minX,
      Math.min(bounds.maxX, (preview.x / oldWidth) * box.width),
    ),
    y: box.height * 0.82,
  });
});

test("closing the tray and changing views cancel selection without reviving stale placement handlers", async ({
  page,
}) => {
  await loadGarden(page);
  await pauseGarden(page);
  await openTray(page);
  await page.locator('[data-care-item="seeds"]').click();
  await page.locator("#care-tray-toggle").click();
  await expect(page.locator("#care-drop-preview")).toBeHidden();
  let scene = page.locator("#scene");
  let box = (await scene.boundingBox())!;
  await scene.click({ position: { x: box.width * 0.4, y: box.height * 0.6 } });
  expect(await renderedCare(page)).toEqual({});
  await openTray(page);
  await page.locator('[data-care-item="berry"]').click();
  await page.locator('[data-view="draw"]').click();
  await page.locator('[data-action="back-garden"]').click();
  scene = page.locator("#scene");
  box = (await scene.boundingBox())!;
  await scene.click({ position: { x: box.width * 0.4, y: box.height * 0.6 } });
  expect(await renderedCare(page)).toEqual({});
  await openTray(page);
  await page.locator('[data-care-item="carrot"]').click();
  await scene.focus();
  await scene.press("Enter");
  await expect(page.locator("#meals-value")).toHaveText("1번", {
    timeout: 20_000,
  });
  await expect(page.locator("#growth-xp")).toHaveText("8 XP");
});

test("new tray meals preserve existing names, ink, joints, birth story and version-one storage", async ({
  page,
}) => {
  const original = createProject(createSample("turtle"));
  original.pet.name = "돌봄 기록 친구";
  original.birth = {
    mode: "exact",
    date: "2024-10-02",
    season: "autumn",
    city: "busan",
    temperament: "차분한 가을의 친구",
  };
  original.care = { meals: 5, drinks: 3, affection: 7 };
  original.growth = {
    experience: 39,
    foodCounts: { seeds: 2, berry: 2, carrot: 1 },
  };
  original.preferences.reducedMotion = true;
  await loadGarden(page, original);
  await openTray(page);
  await page.locator('[data-care-item="seeds"]').click();
  await page.locator("#scene").focus();
  await page.locator("#scene").press("Enter");
  await expect(page.locator("#meals-value")).toHaveText("6번", {
    timeout: 20_000,
  });
  await expect.poll(async () => (await savedProject(page)).care.meals).toBe(6);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: original.pet.name, exact: true }),
  ).toBeVisible();
  const restored = await savedProject(page);
  expect(restored.version).toBe(1);
  expect(restored.pet).toEqual(original.pet);
  expect(restored.birth).toEqual(original.birth);
  expect(restored.preferences).toEqual(original.preferences);
  expect(restored.createdAt).toBe(original.createdAt);
  expect(restored.care).toEqual({ meals: 6, drinks: 3, affection: 7 });
  expect(restored.growth).toEqual({
    experience: 43,
    foodCounts: { seeds: 3, berry: 2, carrot: 1 },
  });
  expect(Object.keys(restored).sort()).toEqual(Object.keys(original).sort());
  expect(await renderedCare(page)).toEqual({});
});
