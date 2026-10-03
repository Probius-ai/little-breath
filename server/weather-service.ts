import {
  CITY_PRESETS,
  SCENE_OPTIONS,
  sceneFromWeatherCode,
  type WeatherSnapshot,
} from "../src/weather.js";

export interface WeatherLocation {
  latitude: number;
  longitude: number;
  name: string;
  timezone?: string;
}

export class ServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly publicMessage: string,
  ) {
    super(publicMessage);
    this.name = "ServiceError";
  }
}

const invalidLocation = () =>
  new ServiceError(
    400,
    "INVALID_LOCATION",
    "Choose a supported city or valid coordinates.",
  );

/** Allow only one city or one numeric coordinate pair, never upstream URLs. */
export function parseLocation(params: URLSearchParams): WeatherLocation {
  for (const key of params.keys()) {
    if (
      !["city", "latitude", "longitude"].includes(key) ||
      params.getAll(key).length !== 1
    )
      throw invalidLocation();
  }
  if (params.has("city")) {
    if (params.has("latitude") || params.has("longitude"))
      throw invalidLocation();
    const city = CITY_PRESETS.find((item) => item.id === params.get("city"));
    if (!city) throw invalidLocation();
    return {
      latitude: city.latitude,
      longitude: city.longitude,
      name: city.name,
      timezone: city.timezone,
    };
  }
  const parseCoordinate = (name: string, limit: number) => {
    const text = params.get(name);
    if (!text || text.length > 24 || !/^-?\d+(?:\.\d+)?$/.test(text))
      throw invalidLocation();
    const number = Number(text);
    if (!Number.isFinite(number) || Math.abs(number) > limit)
      throw invalidLocation();
    return Math.round(number * 100) / 100;
  };
  return {
    latitude: parseCoordinate("latitude", 90),
    longitude: parseCoordinate("longitude", 180),
    name: "내 주변",
  };
}

const BAD_UPSTREAM = () =>
  new ServiceError(
    502,
    "WEATHER_UNAVAILABLE",
    "Weather is temporarily unavailable. Try again later.",
  );
/** The upstream origin and field set are fixed in code to prevent SSRF. */
export function buildForecastUrl(
  location: WeatherLocation,
  apiKey: string,
): URL {
  const url = new URL("https://api.openweathermap.org/data/2.5/weather");
  url.search = new URLSearchParams({
    lat: location.latitude.toFixed(2),
    lon: location.longitude.toFixed(2),
    appid: apiKey,
    units: "metric",
    lang: "kr",
  }).toString();
  return url;
}

export function normalizeForecast(
  payload: unknown,
  location: WeatherLocation,
): WeatherSnapshot {
  if (!payload || typeof payload !== "object") throw BAD_UPSTREAM();
  const root = payload as Record<string, unknown>;
  const record = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw BAD_UPSTREAM();
    return value as Record<string, unknown>;
  };
  const number = (value: unknown, min: number, max: number): number => {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < min ||
      value > max
    )
      throw BAD_UPSTREAM();
    return value;
  };
  const main = record(root.main);
  const wind = record(root.wind);
  if (!Array.isArray(root.weather) || root.weather.length === 0)
    throw BAD_UPSTREAM();
  const weather = record(root.weather[0]);
  const weatherCode = number(weather.id, 200, 804);
  if (
    !Number.isInteger(weatherCode) ||
    typeof weather.icon !== "string" ||
    !/^\d{2}[dn]$/.test(weather.icon)
  )
    throw BAD_UPSTREAM();
  const epoch = number(root.dt, 0, 253402300799);
  const precipitation = (value: unknown): number =>
    value === undefined ? 0 : number(record(value)["1h"] ?? 0, 0, 1000);
  const scene = sceneFromWeatherCode(weatherCode);
  return {
    scene,
    timeOfDay: weather.icon.endsWith("d") ? "day" : "night",
    temperatureC: number(main.temp, -100, 70),
    feelsLikeC: number(main.feels_like, -130, 100),
    humidity: number(main.humidity, 0, 100),
    windKph: Math.round(number(wind.speed, 0, 138.88) * 36) / 10,
    precipitationMm: Math.min(
      1000,
      precipitation(root.rain) + precipitation(root.snow),
    ),
    weatherCode,
    description: SCENE_OPTIONS.find((option) => option.id === scene)!.label,
    locationName: location.name,
    observedAt: new Date(epoch * 1000).toISOString(),
    timezone: location.timezone ?? "UTC",
    source: "openweather",
    stale: false,
  };
}

export interface WeatherServiceOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  cacheTtlMs?: number;
  staleTtlMs?: number;
  maxCacheEntries?: number;
}

/** Bounded in-memory cache, in-flight deduplication, timeout and marked stale fallback. */
export function createWeatherService(options: WeatherServiceOptions = {}) {
  const apiKey = options.apiKey?.trim() ?? "";
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 6_000;
  const cacheTtlMs = options.cacheTtlMs ?? 5 * 60_000;
  const staleTtlMs = options.staleTtlMs ?? 60 * 60_000;
  const maxEntries = Math.max(1, options.maxCacheEntries ?? 200);
  const cache = new Map<
    string,
    { storedAt: number; snapshot: WeatherSnapshot }
  >();
  const inFlight = new Map<string, Promise<WeatherSnapshot>>();

  async function request(location: WeatherLocation): Promise<WeatherSnapshot> {
    const controller = new AbortController();
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      controller.abort();
    }, timeoutMs);
    try {
      const response = await fetchImpl(buildForecastUrl(location, apiKey), {
        signal: controller.signal,
        redirect: "error",
        headers: { Accept: "application/json" },
      });
      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("application/json")
      )
        throw BAD_UPSTREAM();
      // Limit decoded response bytes; do not trust Content-Length alone.
      if (Number(response.headers.get("content-length")) > 65_536)
        throw BAD_UPSTREAM();
      const reader = response.body?.getReader();
      if (!reader) throw BAD_UPSTREAM();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > 65_536) {
            await reader.cancel();
            throw BAD_UPSTREAM();
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return normalizeForecast(
        JSON.parse(new TextDecoder().decode(bytes)),
        location,
      );
    } catch {
      if (expired)
        throw new ServiceError(
          504,
          "WEATHER_TIMEOUT",
          "Weather took too long to respond. Try again later.",
        );
      throw BAD_UPSTREAM();
    } finally {
      clearTimeout(timer);
      // Also release unread error bodies and rejected oversized responses.
      controller.abort();
    }
  }

  return {
    async get(location: WeatherLocation): Promise<WeatherSnapshot> {
      if (!apiKey)
        throw new ServiceError(
          503,
          "LIVE_WEATHER_DISABLED",
          "Live weather is not configured. Demo weather is always available.",
        );
      const key = `${location.latitude.toFixed(2)},${location.longitude.toFixed(2)}`;
      const entry = cache.get(key);
      if (entry && now() - entry.storedAt < cacheTtlMs)
        return {
          ...entry.snapshot,
          locationName: location.name,
          timezone: location.timezone ?? "UTC",
        };
      let pending = inFlight.get(key);
      if (!pending) {
        if (inFlight.size >= 32)
          throw new ServiceError(
            429,
            "RATE_LIMITED",
            "Too many requests. Please wait a moment.",
          );
        pending = request(location)
          .then((snapshot) => {
            cache.delete(key);
            while (cache.size >= maxEntries)
              cache.delete(cache.keys().next().value!);
            cache.set(key, { snapshot, storedAt: now() });
            return snapshot;
          })
          .catch((error: unknown) => {
            if (entry && now() - entry.storedAt < staleTtlMs)
              return { ...entry.snapshot, stale: true };
            throw error;
          })
          .finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
      }
      return {
        ...(await pending),
        locationName: location.name,
        timezone: location.timezone ?? "UTC",
      };
    },
  };
}
