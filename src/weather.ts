/** The browser's complete weather contract. No API keys or third-party requests. */
export type SceneId = "sunny" | "cloudy" | "rain" | "snow" | "storm" | "fog";
export type TimeOfDay = "day" | "night";

export interface WeatherSnapshot {
  scene: SceneId;
  timeOfDay: TimeOfDay;
  temperatureC: number;
  feelsLikeC: number;
  humidity: number;
  windKph: number;
  precipitationMm: number;
  weatherCode: number;
  description: string;
  locationName: string;
  /** An unambiguous UTC ISO timestamp, never a local-time string. */
  observedAt: string;
  timezone: string;
  source: "demo" | "openweather";
  stale: boolean;
}

export interface CityPreset {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export const CITY_PRESETS: readonly CityPreset[] = [
  {
    id: "seoul",
    name: "서울",
    latitude: 37.57,
    longitude: 126.98,
    timezone: "Asia/Seoul",
  },
  {
    id: "busan",
    name: "부산",
    latitude: 35.18,
    longitude: 129.08,
    timezone: "Asia/Seoul",
  },
  {
    id: "jeju",
    name: "제주",
    latitude: 33.5,
    longitude: 126.53,
    timezone: "Asia/Seoul",
  },
  {
    id: "tokyo",
    name: "도쿄",
    latitude: 35.68,
    longitude: 139.69,
    timezone: "Asia/Tokyo",
  },
  {
    id: "new-york",
    name: "뉴욕",
    latitude: 40.71,
    longitude: -74.01,
    timezone: "America/New_York",
  },
  {
    id: "london",
    name: "런던",
    latitude: 51.51,
    longitude: -0.13,
    timezone: "Europe/London",
  },
  {
    id: "paris",
    name: "파리",
    latitude: 48.86,
    longitude: 2.35,
    timezone: "Europe/Paris",
  },
  {
    id: "sydney",
    name: "시드니",
    latitude: -33.87,
    longitude: 151.21,
    timezone: "Australia/Sydney",
  },
];

export const SCENE_OPTIONS: readonly {
  id: SceneId;
  label: string;
  icon: string;
  description: string;
}[] = [
  { id: "sunny", label: "맑음", icon: "☀", description: "햇살이 포근한 날" },
  {
    id: "cloudy",
    label: "구름",
    icon: "☁",
    description: "구름이 천천히 흐르는 날",
  },
  { id: "rain", label: "비", icon: "☂", description: "빗소리를 듣고 싶은 날" },
  { id: "snow", label: "눈", icon: "❄", description: "소복소복 눈이 오는 날" },
  { id: "storm", label: "천둥", icon: "ϟ", description: "함께라서 든든한 날" },
  {
    id: "fog",
    label: "안개",
    icon: "≋",
    description: "세상이 잠시 쉬어 가는 날",
  },
];

const DEMO: Record<
  SceneId,
  {
    temperatureC: number;
    humidity: number;
    windKph: number;
    precipitationMm: number;
    weatherCode: number;
  }
> = {
  sunny: {
    temperatureC: 23,
    humidity: 48,
    windKph: 7,
    precipitationMm: 0,
    weatherCode: 800,
  },
  cloudy: {
    temperatureC: 19,
    humidity: 64,
    windKph: 9,
    precipitationMm: 0,
    weatherCode: 804,
  },
  rain: {
    temperatureC: 17,
    humidity: 88,
    windKph: 12,
    precipitationMm: 2.4,
    weatherCode: 501,
  },
  snow: {
    temperatureC: -2,
    humidity: 81,
    windKph: 6,
    precipitationMm: 0.8,
    weatherCode: 601,
  },
  storm: {
    temperatureC: 18,
    humidity: 91,
    windKph: 28,
    precipitationMm: 6.2,
    weatherCode: 211,
  },
  fog: {
    temperatureC: 14,
    humidity: 96,
    windKph: 3,
    precipitationMm: 0,
    weatherCode: 741,
  },
};

/** Pure, repeatable samples: changing scenes works even when completely offline. */
export function createDemoWeather(
  scene: SceneId = "sunny",
  timeOfDay: TimeOfDay = "day",
  locationName = "서울",
): WeatherSnapshot {
  const sample = DEMO[scene];
  const temperatureC = sample.temperatureC - (timeOfDay === "night" ? 4 : 0);
  return {
    ...sample,
    scene,
    timeOfDay,
    temperatureC,
    feelsLikeC: temperatureC - 1,
    description: SCENE_OPTIONS.find((option) => option.id === scene)!.label,
    locationName,
    observedAt:
      timeOfDay === "day"
        ? "2026-06-12T05:00:00.000Z"
        : "2026-06-12T14:00:00.000Z",
    timezone:
      CITY_PRESETS.find((city) => city.name === locationName)?.timezone ??
      "Asia/Seoul",
    source: "demo",
    stale: false,
  };
}

/** Official OpenWeather condition groups. Unknown codes use a neutral scene. */
export function sceneFromWeatherCode(code: number): SceneId {
  if (code === 800) return "sunny";
  if (code >= 200 && code < 300) return "storm";
  if (code >= 300 && code < 600) return "rain";
  if (code >= 600 && code < 700) return "snow";
  if (code >= 700 && code < 800) return "fog";
  return "cloudy";
}

export type WeatherErrorCode =
  | "invalid-location"
  | "unavailable"
  | "invalid-response"
  | "timeout"
  | "rate-limited"
  | "disabled";
const ERROR_MESSAGES: Record<WeatherErrorCode, string> = {
  "invalid-location": "도시를 다시 선택해 주세요.",
  unavailable:
    "지금은 실제 날씨를 가져올 수 없어요. 데모 날씨는 계속 즐길 수 있어요.",
  "invalid-response":
    "날씨 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
  timeout: "날씨 응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.",
  "rate-limited": "날씨를 너무 자주 요청했어요. 잠시만 기다려 주세요.",
  disabled: "이 배포에서는 데모 날씨를 사용할 수 있어요.",
};

export class WeatherError extends Error {
  constructor(public readonly code: WeatherErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "WeatherError";
  }
}

export interface LiveWeatherOptions {
  cityId?: string;
  latitude?: number;
  longitude?: number;
  /** Display-only: this label is never sent to the weather provider. */
  locationName?: string;
  signal?: AbortSignal;
}

const inRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;

/** Validate the trust boundary even when the same-origin server is misconfigured. */
export function isWeatherSnapshot(value: unknown): value is WeatherSnapshot {
  if (!value || typeof value !== "object") return false;
  const w = value as Record<string, unknown>;
  return (
    SCENE_OPTIONS.some(({ id }) => id === w.scene) &&
    (w.timeOfDay === "day" || w.timeOfDay === "night") &&
    inRange(w.temperatureC, -100, 70) &&
    inRange(w.feelsLikeC, -130, 100) &&
    inRange(w.humidity, 0, 100) &&
    inRange(w.windKph, 0, 500) &&
    inRange(w.precipitationMm, 0, 1000) &&
    inRange(w.weatherCode, 200, 804) &&
    Number.isInteger(w.weatherCode) &&
    typeof w.description === "string" &&
    w.description.length <= 100 &&
    typeof w.locationName === "string" &&
    w.locationName.length > 0 &&
    w.locationName.length <= 80 &&
    typeof w.timezone === "string" &&
    w.timezone.length > 0 &&
    w.timezone.length <= 100 &&
    typeof w.observedAt === "string" &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(w.observedAt) &&
    Number.isFinite(Date.parse(w.observedAt)) &&
    (w.source === "demo" || w.source === "openweather") &&
    typeof w.stale === "boolean"
  );
}

/** Called by explicit UI actions only. It never requests browser geolocation. */
export async function fetchLiveWeather(
  options: LiveWeatherOptions = {},
): Promise<WeatherSnapshot> {
  const params = new URLSearchParams();
  if (options.cityId) {
    if (
      !CITY_PRESETS.some((city) => city.id === options.cityId) ||
      options.latitude !== undefined ||
      options.longitude !== undefined
    )
      throw new WeatherError("invalid-location");
    params.set("city", options.cityId);
  } else if (
    options.latitude !== undefined ||
    options.longitude !== undefined
  ) {
    if (
      !inRange(options.latitude, -90, 90) ||
      !inRange(options.longitude, -180, 180)
    )
      throw new WeatherError("invalid-location");
    // Approximate to ~1 km before transmission; precise GPS coordinates stay in memory.
    params.set("latitude", options.latitude.toFixed(2));
    params.set("longitude", options.longitude.toFixed(2));
  } else {
    params.set("city", "seoul");
  }
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 10_000);
  try {
    const response = await fetch(`/api/weather?${params}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    if (!response.ok) {
      throw new WeatherError(
        response.status === 429
          ? "rate-limited"
          : response.status === 503
            ? "disabled"
            : response.status === 504
              ? "timeout"
              : "unavailable",
      );
    }
    const snapshot: unknown = await response.json();
    if (!isWeatherSnapshot(snapshot) || snapshot.source !== "openweather")
      throw new WeatherError("invalid-response");
    return {
      ...snapshot,
      locationName:
        options.locationName?.trim().slice(0, 80) || snapshot.locationName,
    };
  } catch (error) {
    if (options.signal?.aborted)
      throw new DOMException("The request was cancelled.", "AbortError");
    if (timedOut) throw new WeatherError("timeout");
    if (error instanceof WeatherError) throw error;
    throw new WeatherError("unavailable");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
