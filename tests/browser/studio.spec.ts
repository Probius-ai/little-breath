import { test, expect } from "@playwright/test";

test("first load is local-only, accessible core controls and six scenes work", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:5173") &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "오늘도, 작은숨." }),
  ).toBeVisible();
  for (const scene of ["sunny", "cloudy", "rain", "snow", "storm", "fog"]) {
    await page.locator(`[data-scene="${scene}"]`).click();
    await expect(page.locator(`[data-scene="${scene}"]`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  await page.locator('[data-time="night"]').click();
  await expect(page.locator('[data-time="night"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("four legs can each increase to four connected joints, export and refresh", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-view="draw"]').click();
  await page.locator('[data-sample="turtle"]').click();
  await page.locator('[data-action="next-rig"]').click();
  await expect(page.locator(".leg-item")).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    await page.locator(".leg-title").nth(i).click();
    await page.getByRole("button", { name: "관절 늘리기" }).click();
    await expect(
      page.locator(".leg-item").nth(i).locator(".joint-chain button"),
    ).toHaveCount(4);
  }
  await page.locator('[data-action="undo"]').click();
  await expect(
    page.locator(".leg-item").nth(3).locator(".joint-chain button"),
  ).toHaveCount(3);
  await page.locator('[data-action="redo"]').click();
  await expect(
    page.locator(".leg-item").nth(3).locator(".joint-chain button"),
  ).toHaveCount(4);
  await page.locator('[data-action="finish"]').click();
  await expect(
    page.getByRole("heading", { name: "토리", exact: true }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.locator('[data-action="export"]').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("토리");
  await page.waitForTimeout(450);
  await page.reload();
  await page.locator('[data-view="rig"]').click();
  await expect(page.locator(".leg-item")).toHaveCount(4);
  for (let i = 0; i < 4; i++)
    await expect(
      page.locator(".leg-item").nth(i).locator(".joint-chain button"),
    ).toHaveCount(4);
});

test("drawing, undo, redo and joint keyboard coordinates are functional", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-view="draw"]').click();
  const before = await page.locator(".paper-label").textContent();
  const canvas = page.locator("#editor"),
    box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.35, {
    steps: 20,
  });
  await page.mouse.up();
  const after = await page.locator(".paper-label").textContent();
  expect(after).not.toEqual(before);
  await page.locator('[data-action="undo"]').click();
  expect(await page.locator(".paper-label").textContent()).toEqual(before);
  await page.locator('[data-action="redo"]').click();
  expect(await page.locator(".paper-label").textContent()).toEqual(after);
  await page.locator('[data-action="next-rig"]').click();
  await page.locator('[data-joint="body"]').click();
  await page.locator("#joint-x").fill("43");
  await page.locator("#joint-x").press("Tab");
  await expect(page.locator("#joint-x")).toHaveValue("43");
});

test("birth/name validation, rename, dialog focus and persistence", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-action="new"]').click();
  await page.locator("#birth-save").click();
  await expect(page.locator("#birth-error")).toContainText("이름");
  await page.locator("#birth-name").fill("초록이 🌱");
  await page.locator("#season-mode").click();
  await page.locator("#birth-season").selectOption("autumn");
  await page.locator("#birth-save").click();
  await expect(page.locator("#pet-name")).toHaveValue("초록이 🌱");
  await page.locator('[data-action="next-rig"]').click();
  await page.locator('[data-action="finish"]').click();
  await page.locator('[data-action="rename"]').click();
  await page.locator("#rename-input").fill("토닥이");
  await page.locator("#rename-save").click();
  await expect(
    page.getByRole("heading", { name: "토닥이", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(450);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "토닥이", exact: true }),
  ).toBeVisible();
  // Repeated immediate dismissal catches the previous deferred-focus race.
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.locator('[data-action="weather"]').first().click();
    if (attempt === 1) {
      // A visible dialog must honor Escape even if focus briefly leaves it.
      await page.locator("#main-content").focus();
    }
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});

test("photo tracing is ephemeral and food earns growth after arrival", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-view="draw"]').click();
  // Synthetic 1×1 PNG with valid chunk CRCs for strict browser decoders.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
    "base64",
  );
  await page.locator("#photo-import").setInputFiles({
    name: "synthetic-reference.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(page.locator(".tracing-name")).toContainText(
    "synthetic-reference.png",
  );
  await page.locator('[data-trace="opacity"]').fill("55");
  await page.locator('[data-action="next-rig"]').click();
  await page.locator('[data-view="draw"]').click();
  await expect(page.locator(".tracing-name")).toHaveCount(0);
  await page.locator('[data-action="back-garden"]').click();
  await page.locator('[data-action="feed"]').click();
  await page.locator('[data-care-item="carrot"]').click();
  const scene = page.locator("#scene");
  const sceneBox = (await scene.boundingBox())!;
  await scene.click({
    position: { x: sceneBox.width * 0.45, y: sceneBox.height * 0.6 },
  });
  await expect(page.locator("#meals-value")).toContainText("1", {
    timeout: 20000,
  });
  await expect(page.locator("#growth-xp")).toContainText("8 XP");
});

test("phone and tablet have no horizontal overflow and all main navigation remains usable", async ({
  page,
}) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 820, height: 1180 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.locator('[data-view="draw"]').click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.locator('[data-view="rig"]').click();
    await expect(page.locator("#editor")).toBeVisible();
  }
});
