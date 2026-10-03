import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AddressInfo } from "node:net";
import {
  createDemoWeather,
  fetchLiveWeather,
  isWeatherSnapshot,
  SCENE_OPTIONS,
  sceneFromWeatherCode,
  WeatherError,
} from "../src/weather.js";
import {
  buildForecastUrl,
  createWeatherService,
  normalizeForecast,
  parseLocation,
  ServiceError,
} from "../server/weather-service.js";
import { createAppServer } from "../server/app.js";

const location = {
  latitude: 37.57,
  longitude: 126.98,
  name: "서울",
  timezone: "Asia/Seoul",
};
const fixture = {
  dt: 1781240400,
  timezone: 32400,
  weather: [
    { id: 501, icon: "10d", description: "upstream text is not trusted" },
  ],
  main: { temp: 18.2, feels_like: 17.3, humidity: 76 },
  wind: { speed: 2.5 },
  rain: { "1h": 1.2 },
};
const response = (body: unknown = fixture) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
const mockFetch = (
  handler: (
    url: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>,
) => handler as typeof fetch;

test("six deterministic demo scenes cover day and night without a network", () => {
  for (const { id } of SCENE_OPTIONS) {
    for (const time of ["day", "night"] as const) {
      const snapshot = createDemoWeather(id, time);
      assert.deepEqual(snapshot, createDemoWeather(id, time));
      assert.equal(snapshot.source, "demo");
      assert.equal(snapshot.scene, id);
      assert.equal(snapshot.timeOfDay, time);
      assert.ok(isWeatherSnapshot(snapshot));
    }
  }
});

test("OpenWeather condition groups map to the six scenes", () => {
  const cases = [
    [800, "sunny"],
    [801, "cloudy"],
    [804, "cloudy"],
    [200, "storm"],
    [232, "storm"],
    [300, "rain"],
    [511, "rain"],
    [531, "rain"],
    [600, "snow"],
    [622, "snow"],
    [701, "fog"],
    [741, "fog"],
  ] as const;
  for (const [code, scene] of cases)
    assert.equal(sceneFromWeatherCode(code), scene);
  assert.equal(sceneFromWeatherCode(-1), "cloudy");
});

test("location validation rejects ambiguous, arbitrary, duplicate and malformed queries", () => {
  assert.deepEqual(parseLocation(new URLSearchParams("city=seoul")), location);
  assert.deepEqual(
    parseLocation(new URLSearchParams("latitude=35.12345&longitude=-70.126")),
    { latitude: 35.12, longitude: -70.13, name: "내 주변" },
  );
  for (const query of [
    "",
    "city=unknown",
    "city=seoul&city=busan",
    "city=seoul&latitude=1&longitude=1",
    "latitude=91&longitude=0",
    "latitude=0&longitude=-181",
    "latitude=&longitude=1",
    "latitude=NaN&longitude=1",
    "latitude=1e2&longitude=1",
    "latitude=1&longitude=2&url=https://attacker.example",
    "city=seoul&apikey=secret",
  ]) {
    assert.throws(
      () => parseLocation(new URLSearchParams(query)),
      (error: unknown) => error instanceof ServiceError && error.status === 400,
      query,
    );
  }
});

test("upstream is fixed HTTPS, metric and rounded; keys never enter normalized snapshots", () => {
  const url = buildForecastUrl(location, "test-only-key");
  assert.equal(url.origin, "https://api.openweathermap.org");
  assert.equal(url.pathname, "/data/2.5/weather");
  assert.equal(url.searchParams.get("units"), "metric");
  const snapshot = normalizeForecast(fixture, location);
  assert.equal(snapshot.windKph, 9);
  assert.equal(snapshot.precipitationMm, 1.2);
  assert.equal(snapshot.timeOfDay, "day");
  assert.equal(snapshot.description, "비");
  assert.equal(snapshot.timezone, "Asia/Seoul");
  assert.ok(snapshot.observedAt.endsWith("Z"));
  assert.ok(isWeatherSnapshot(snapshot));
  assert.equal(JSON.stringify(snapshot).includes("test-only-key"), false);
  assert.equal(JSON.stringify(snapshot).includes("upstream text"), false);
});

test("night, snow precipitation and invalid provider responses are handled", () => {
  const snow = normalizeForecast(
    {
      ...fixture,
      weather: [{ id: 601, icon: "13n" }],
      rain: undefined,
      snow: { "1h": 2 },
    },
    location,
  );
  assert.equal(snow.timeOfDay, "night");
  assert.equal(snow.scene, "snow");
  assert.equal(snow.precipitationMm, 2);
  for (const bad of [
    null,
    {},
    { ...fixture, main: { ...fixture.main, temp: "18" } },
    { ...fixture, wind: { speed: -1 } },
    { ...fixture, weather: [{ id: 501, icon: "<script>" }] },
    { ...fixture, dt: Infinity },
  ]) {
    assert.throws(() => normalizeForecast(bad, location), ServiceError);
  }
});

test("snapshot validation does not coerce nulls, strings, dates or impossible values", () => {
  const valid = createDemoWeather();
  for (const invalid of [
    { ...valid, humidity: null },
    { ...valid, humidity: "50" },
    { ...valid, humidity: 101 },
    { ...valid, observedAt: "today" },
    { ...valid, source: "unknown" },
    { ...valid, scene: "unknown" },
  ])
    assert.equal(isWeatherSnapshot(invalid), false);
});

test("unconfigured live weather returns disabled without making requests", async () => {
  let calls = 0;
  const service = createWeatherService({
    fetchImpl: mockFetch(async () => {
      calls++;
      return response();
    }),
  });
  await assert.rejects(
    service.get(location),
    (error: unknown) => error instanceof ServiceError && error.status === 503,
  );
  assert.equal(calls, 0);
});

test("cache and concurrent deduplication make a single upstream request", async () => {
  let calls = 0;
  const service = createWeatherService({
    apiKey: "test-only-key",
    fetchImpl: mockFetch(async (_url, init) => {
      calls++;
      assert.equal(init?.redirect, "error");
      await new Promise((resolve) => setTimeout(resolve, 5));
      return response();
    }),
  });
  const results = await Promise.all([
    service.get(location),
    service.get(location),
    service.get(location),
  ]);
  await service.get(location);
  assert.equal(calls, 1);
  assert.deepEqual(results[0], results[1]);
  results[0].locationName = "mutated";
  assert.equal((await service.get(location)).locationName, "서울");
});

test("cache expiry uses clearly marked stale data only within its bounded lifetime", async () => {
  let time = 0;
  let fails = false;
  const service = createWeatherService({
    apiKey: "test",
    now: () => time,
    cacheTtlMs: 100,
    staleTtlMs: 1000,
    fetchImpl: mockFetch(async () => {
      if (fails) throw new Error("secret-containing internal network error");
      return response();
    }),
  });
  await service.get(location);
  time = 101;
  fails = true;
  assert.equal((await service.get(location)).stale, true);
  time = 1001;
  await assert.rejects(
    service.get(location),
    (error: unknown) =>
      error instanceof ServiceError && !error.message.includes("secret"),
  );
});

test("cache capacity is bounded and oldest entries are evicted", async () => {
  let calls = 0;
  const service = createWeatherService({
    apiKey: "test",
    maxCacheEntries: 1,
    fetchImpl: mockFetch(async () => {
      calls++;
      return response();
    }),
  });
  await service.get(location);
  await service.get({ ...location, latitude: 35 });
  await service.get(location);
  assert.equal(calls, 3);
});

test("upstream timeout aborts the request and returns a sanitized error", async () => {
  const service = createWeatherService({
    apiKey: "test",
    timeoutMs: 15,
    fetchImpl: mockFetch(
      async (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error("key-secret")),
            { once: true },
          );
        }),
    ),
  });
  await assert.rejects(
    service.get(location),
    (error: unknown) =>
      error instanceof ServiceError &&
      error.status === 504 &&
      !error.message.includes("key-secret"),
  );
});

test("malformed, oversized and failed upstream responses are rejected without detail leaks", async () => {
  for (const makeResponse of [
    () => new Response("key-secret", { status: 401 }),
    () => response("x".repeat(70_000)),
    () =>
      new Response("{broken-json", {
        headers: { "content-type": "application/json" },
      }),
    () => new Response("<html>key-secret</html>"),
  ]) {
    const service = createWeatherService({
      apiKey: "test",
      fetchImpl: mockFetch(async () => makeResponse()),
    });
    await assert.rejects(
      service.get(location),
      (error: unknown) =>
        error instanceof ServiceError &&
        error.status === 502 &&
        !error.message.includes("key-secret"),
    );
  }
});

test("browser client sends rounded coordinates only to its own origin", async (t) => {
  let requested = "";
  const snapshot = normalizeForecast(fixture, location);
  t.mock.method(globalThis, "fetch", async (url: string) => {
    requested = String(url);
    return response(snapshot);
  });
  const result = await fetchLiveWeather({
    latitude: 37.566535,
    longitude: 126.977969,
    locationName: "내 동네",
  });
  assert.equal(requested, "/api/weather?latitude=37.57&longitude=126.98");
  assert.equal(result.locationName, "내 동네");
  assert.equal(requested.includes("내"), false);
});

test("browser client rejects invalid payloads and respects request cancellation", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () =>
    response({ invalid: true }),
  );
  await assert.rejects(
    fetchLiveWeather({ cityId: "seoul" }),
    (error: unknown) =>
      error instanceof WeatherError && error.code === "invalid-response",
  );
  await assert.rejects(
    fetchLiveWeather({ latitude: NaN, longitude: 0 }),
    WeatherError,
  );
  const controller = new AbortController();
  controller.abort();
  fetchMock.mock.mockImplementation(async () => {
    throw new DOMException("cancelled", "AbortError");
  });
  await assert.rejects(
    fetchLiveWeather({ cityId: "seoul", signal: controller.signal }),
    (error: unknown) =>
      error instanceof DOMException && error.name === "AbortError",
  );
});

const servers: ReturnType<typeof createAppServer>[] = [];
const directories: string[] = [];
after(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
  await Promise.all(
    directories.map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function start(options: Parameters<typeof createAppServer>[0] = {}) {
  const server = createAppServer(options);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test("HTTP API validates queries, methods, same-origin policy, health and secret-safe errors", async () => {
  const base = await start({
    apiKey: "test-only-key",
    fetchImpl: mockFetch(async () => {
      throw new Error("test-only-key https://provider?appid=secret");
    }),
  });
  assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), {
    status: "ok",
    liveWeatherConfigured: true,
  });
  assert.equal((await fetch(`${base}/api/weather?city=invalid`)).status, 400);
  assert.equal(
    (await fetch(`${base}/api/weather?city=seoul`, { method: "POST" })).status,
    405,
  );
  assert.equal(
    (
      await fetch(`${base}/api/weather?city=seoul`, {
        headers: { "sec-fetch-site": "cross-site" },
      })
    ).status,
    403,
  );
  const failed = await fetch(`${base}/api/weather?city=seoul`);
  assert.equal(failed.status, 502);
  assert.equal(failed.headers.get("cache-control"), "no-store");
  const text = await failed.text();
  assert.equal(text.includes("test-only-key"), false);
  assert.equal(text.includes("appid"), false);
});

test("HTTP limiter returns retry information without trusting forwarded IPs", async () => {
  const base = await start({ requestsPerMinute: 1 });
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  const limited = await fetch(`${base}/api/health`, {
    headers: { "x-forwarded-for": "1.2.3.4" },
  });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");
});

test("static server delivers the built frontend with safety headers and blocks secret/symlink files", async () => {
  const root = await mkdtemp(join(tmpdir(), "little-breath-test-"));
  directories.push(root);
  const dist = join(root, "dist");
  await mkdir(dist);
  await writeFile(join(dist, "index.html"), "<h1>Little Breath</h1>");
  await writeFile(join(dist, ".env"), "SECRET=never");
  await writeFile(join(root, "private.txt"), "private");
  await symlink(join(root, "private.txt"), join(dist, "outside.txt"));
  const base = await start({ staticDirectory: dist });
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.equal(await page.text(), "<h1>Little Breath</h1>");
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");
  assert.ok(
    page.headers.get("content-security-policy")?.includes("connect-src 'self'"),
  );
  assert.equal((await fetch(`${base}/.env`)).status, 404);
  assert.equal((await fetch(`${base}/outside.txt`)).status, 404);
  assert.equal(
    (await fetch(`${base}/index.html`, { method: "HEAD" })).headers.get(
      "content-length",
    ),
    "22",
  );
});
