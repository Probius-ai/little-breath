import { test, expect, type Page } from "@playwright/test";
import { createProject, clone, type Project } from "../../src/project";
import { AUTH_STORAGE_KEY } from "../../src/cloud/config";
const A = "11111111-1111-4111-8111-111111111111";
const STORAGE = "little-breath.project.v1";
const accountKey = "little-breath.account.v1." + A;
function fixtureSession() {
  return {
    access_token: "synthetic-test-token-not-a-credential",
    refresh_token: "synthetic-test-refresh-not-a-credential",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: A,
      aud: "authenticated",
      role: "authenticated",
      email: "fixture@example.invalid",
      app_metadata: { provider: "github" },
      user_metadata: { user_name: "FixtureGardener" },
      created_at: "2026-10-01T00:00:00Z",
    },
  };
}
async function setup(
  page: Page,
  { signedIn = true, remote = null as Project | null } = {},
) {
  const guest = createProject();
  guest.pet.name = "기기의 모아";
  const writes: Record<string, unknown>[] = [];
  const reads: string[] = [];
  let db = remote
    ? { project: remote, revision: 4, updated_at: "2026-10-02T00:00:00Z" }
    : null;
  await page.addInitScript(
    ({ guest, signedIn, session, authKey, key }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(guest));
      if (signedIn && !sessionStorage.getItem(authKey))
        sessionStorage.setItem(authKey, JSON.stringify(session));
    },
    {
      guest,
      signedIn,
      session: fixtureSession(),
      authKey: AUTH_STORAGE_KEY,
      key: STORAGE,
    },
  );
  await page.route(
    "https://nfoxrsuepgpelexiraqr.supabase.co/**",
    async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      if (url.pathname.includes("/auth/v1/logout")) {
        await route.fulfill({ status: 204 });
        return;
      }
      if (url.pathname.includes("/rest/v1/private_projects")) {
        reads.push(req.url());
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(db),
        });
        return;
      }
      if (url.pathname.includes("/rest/v1/rpc/save_project")) {
        const body = req.postDataJSON();
        writes.push(body);
        if (db && db.revision !== body.p_expected_revision) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ...db, status: "conflict" }),
          });
          return;
        }
        db = {
          project: body.p_project,
          revision: (db?.revision ?? 0) + 1,
          updated_at: new Date().toISOString(),
        };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...db, status: "saved" }),
        });
        return;
      }
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "unexpected fixture endpoint" }),
      });
    },
  );
  await page.goto("/");
  await expect(page.locator("#scene")).toBeVisible();
  return { guest, writes, reads, db: () => db };
}
async function openAccount(page: Page) {
  await page.getByRole("button", { name: "계정과 클라우드 동기화" }).click();
  await expect(page.locator("#cloud-panel")).toBeVisible();
}
async function consent(page: Page) {
  await page.locator("#cloud-consent").check();
  await page.getByRole("button", { name: "동기화 켜기", exact: true }).click();
}

test("guest remains network-free and account panel explains optional GitHub login", async ({
  page,
}) => {
  const h = await setup(page, { signedIn: false });
  await openAccount(page);
  await expect(
    page.getByRole("button", { name: "GitHub로 로그인" }),
  ).toBeVisible();
  await expect(page.locator("#cloud-panel")).toContainText(
    "로그인만으로 그림은 업로드되지 않아요",
  );
  expect(h.reads).toHaveLength(0);
  expect(h.writes).toHaveLength(0);
});
test("login requires explicit Supabase consent; only project allowlist uploads and guest survives logout", async ({
  page,
}) => {
  const h = await setup(page);
  await openAccount(page);
  await expect(page.locator("#cloud-panel")).toContainText("FixtureGardener");
  await expect(
    page.getByRole("button", { name: "동기화 켜기", exact: true }),
  ).toBeDisabled();
  expect(h.reads).toHaveLength(0);
  expect(h.writes).toHaveLength(0);
  await expect(page.locator("#cloud-panel")).toContainText(
    "Supabase 저장소(서울 리전)",
  );
  await consent(page);
  await expect(page.locator(".cloud-status-line")).toContainText(
    "클라우드에 저장됨",
  );
  expect(h.writes).toHaveLength(1);
  expect(h.writes[0]).not.toHaveProperty("user_id");
  expect(Object.keys(h.writes[0].p_project as object)).toEqual([
    "version",
    "pet",
    "birth",
    "createdAt",
    "updatedAt",
    "care",
    "preferences",
    "growth",
  ]);
  await page
    .getByRole("button", { name: "로그아웃 · 게스트로 돌아가기" })
    .click();
  await expect(
    page.getByRole("button", { name: "GitHub로 로그인" }),
  ).toBeVisible();
  const local = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    STORAGE,
  );
  expect(local.pet).toEqual(h.guest.pet);
  expect(local.growth).toEqual(h.guest.growth);
});
test("remote conflict lets user retain two downloadable copies before selecting cloud", async ({
  page,
}) => {
  const remote = createProject();
  remote.pet.name = "멀리 있던 보리";
  const h = await setup(page, { remote });
  await openAccount(page);
  await consent(page);
  await expect(
    page.getByRole("heading", { name: "두 사본 중 어떤 친구를 이어갈까요?" }),
  ).toBeVisible();
  expect(h.writes).toHaveLength(0);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "기기 사본 내려받기" }).click();
  expect((await download).suggestedFilename()).toMatch(/little-breath-local/);
  await page
    .getByRole("button", { name: "클라우드 사본 열기", exact: true })
    .click();
  await expect(page.locator(".pet-identity h2")).toHaveText("멀리 있던 보리");
  await expect(page.locator(".cloud-recoveries summary")).toContainText("1쌍");
  const cache = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    accountKey,
  );
  expect(cache.recoveries[0].local.pet.name).toBe("기기의 모아");
  expect(cache.recoveries[0].cloud.pet.name).toBe("멀리 있던 보리");
  expect(h.writes).toHaveLength(0);
});
test("offline account edit is queued and uploaded on reconnection without touching guest", async ({
  page,
  context,
}) => {
  const h = await setup(page);
  await openAccount(page);
  await consent(page);
  await expect(page.locator(".cloud-status-line")).toContainText(
    "클라우드에 저장됨",
  );
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await context.setOffline(true);
  await page.getByRole("button", { name: "친구 이름 바꾸기" }).click();
  await page.locator("#rename-input").fill("오프라인 친구");
  await page.locator("#rename-save").click();
  await expect(page.locator("#save-status")).toContainText("오프라인");
  expect(h.writes).toHaveLength(1);
  await context.setOffline(false);
  await expect(page.locator("#save-status")).toHaveText("클라우드에 저장됨");
  expect(h.writes).toHaveLength(2);
  expect(h.db()?.project.pet.name).toBe("오프라인 친구");
  const guest = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    STORAGE,
  );
  expect(guest.pet.name).toBe(h.guest.pet.name);
});
test("account panel is usable at phone width and modal traps keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await openAccount(page);
  await expect(page.locator("#cloud-panel")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "동기화 켜기", exact: true }),
  ).toBeVisible();
  const width = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    innerWidth,
  ]);
  expect(width[0]).toBeLessThanOrEqual(width[1]);
  await page.screenshot({
    path: ".artifacts/cloud-account-mobile.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(page.locator("#cloud-panel")).toHaveCount(0);
});
test("cancelled OAuth callback removes error details and still opens local garden", async ({
  page,
}) => {
  await setup(page, { signedIn: false });
  await page.goto(
    "/?error=access_denied&error_description=fixture-cancelled#garden",
  );
  await expect(page.locator("#scene")).toBeVisible();
  await expect(page.locator("#toast")).toContainText(
    "로그인이 완료되지 않았어요",
  );
  expect(page.url()).not.toContain("access_denied");
  expect(page.url()).not.toContain("fixture-cancelled");
});

test("a second same-account tab stays outside the writable workspace until the first closes", async ({
  page,
  context,
}) => {
  await setup(page);
  await openAccount(page);
  await consent(page);
  await expect(page.locator(".cloud-status-line")).toContainText(
    "클라우드에 저장됨",
  );
  const second = await context.newPage();
  await setup(second);
  await openAccount(second);
  await expect(second.locator("#cloud-panel")).toContainText(
    "다른 탭이 이 계정을 사용 중",
  );
  await expect(
    second.getByRole("button", { name: "계정 연결 다시 확인" }),
  ).toBeVisible();
  await page.close();
  await second.getByRole("button", { name: "계정 연결 다시 확인" }).click();
  await expect(second.locator("#cloud-consent")).toBeVisible();
  await expect(second.locator(".cloud-status-line")).toContainText(
    "동기화는 꺼져 있어요",
  );
});

test("foreign-tab auth broadcast cannot replace this tab's account or local workspace", async ({
  page,
}) => {
  await setup(page);
  await openAccount(page);
  await expect(page.locator("#cloud-panel")).toContainText("FixtureGardener");
  await page.evaluate(
    ({ key, session }) => {
      const channel = new BroadcastChannel(key);
      channel.postMessage({ event: "SIGNED_IN", session });
      channel.close();
    },
    {
      key: AUTH_STORAGE_KEY,
      session: {
        ...fixtureSession(),
        user: {
          ...fixtureSession().user,
          id: "22222222-2222-4222-8222-222222222222",
          user_metadata: { user_name: "ForeignAccountFixture" },
        },
      },
    },
  );
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await openAccount(page);
  await expect(page.locator("#cloud-panel")).toContainText("FixtureGardener");
  await expect(page.locator("#cloud-panel")).not.toContainText(
    "ForeignAccountFixture",
  );
});

test("sync can be cancelled while cloud lookup is still pending", async ({
  page,
}) => {
  await setup(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "https://nfoxrsuepgpelexiraqr.supabase.co/rest/v1/private_projects*",
    async (route) => {
      await held;
      await route
        .fulfill({ status: 200, contentType: "application/json", body: "null" })
        .catch(() => {});
    },
  );
  await openAccount(page);
  await consent(page);
  await expect(page.locator(".cloud-status-line")).toContainText("확인 중");
  await page.getByRole("button", { name: "동기화 끄기", exact: true }).click();
  await expect(page.locator(".cloud-status-line")).toContainText("동기화 꺼짐");
  release();
  await expect(
    page.getByRole("button", { name: "동기화 다시 켜기", exact: true }),
  ).toBeVisible();
});
