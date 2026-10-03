# Weather architecture

Little Breath starts in **Mock (demo)** mode. All six scenes and their day/night
variants are deterministic and available without a network connection. No weather
request, location permission, registration, or key is needed to draw and play.

## Optional OpenWeather mode

1. Copy `.env.example` to the ignored `.env` file.
2. Put your own OpenWeather API key in `OPENWEATHER_API_KEY` on the server only.
   Never prefix it with `VITE_`, put it in browser code, or commit it.
3. Run `npm run server` alongside `npm run dev`. Vite forwards `/api` to port 8787.
4. Choose a city and explicitly select live weather in the app.

After `npm run build`, `npm run server` serves both `dist/` and `/api` on the
same origin at `http://127.0.0.1:8787`. It uses Node 22+ with the repository's
`tsx` development tool; install development dependencies or precompile the server
before creating a production image. Static-only hosts support Mock mode; they do
not execute the optional Node weather service. No credentials have been included
or provisioned by this project.

`PORT` and `HOST` can be set by the deployment environment. Binding defaults to
loopback for local safety. Use `HOST=0.0.0.0` only when intentionally exposing the
server, behind HTTPS and an appropriately configured reverse proxy.

### API

- `GET /api/health`: health and a boolean configuration indicator; never a key
- `GET /api/weather?city=seoul`: a named preset (see `CITY_PRESETS`)
- `GET /api/weather?latitude=37.57&longitude=126.98`: one approximate coordinate pair

The JSON response is the `WeatherSnapshot` interface in `src/weather.ts`.
`source` is `demo` or `openweather`; `stale` explicitly marks cached data served
during an upstream outage. Provider timestamps are converted from Unix time to
UTC ISO strings. City presets retain their IANA timezone. For manually supplied
coordinates, the timestamp's display timezone is UTC; day/night still uses the
provider's day/night weather icon. `windKph` is converted from OpenWeather's
metric metres-per-second field. `precipitationMm` adds the latest one-hour rain
and snow amounts when present; absent amounts are zero.

The browser never calls OpenWeather directly. The server calls only
`https://api.openweathermap.org/data/2.5/weather`, with `units=metric`. Requests
use preset coordinates rather than deprecated built-in city-name geocoding.
There is no free-text city search to silently resolve an ambiguous location.

### Mapping

| OpenWeather condition                               | Scene  |
| --------------------------------------------------- | ------ |
| 800                                                 | sunny  |
| 801–804                                             | cloudy |
| 2xx                                                 | storm  |
| 3xx, 5xx                                            | rain   |
| 6xx                                                 | snow   |
| 7xx (mist/fog/haze and other atmosphere conditions) | fog    |

This is an artistic scene mapping, not a weather-warning system. Use official
local forecasts and warnings for real-world decisions. The application displays
its own Korean scene labels rather than rendering arbitrary upstream text.

### Reliability and privacy

- Six-second upstream timeout; ten-second browser timeout; cancellable requests
- Cache for five minutes, at most 200 coordinate cells, in-flight deduplication
- At most one-hour-old cache entries on failure, always marked `stale: true`
- Sixty API requests per minute per directly connected IP, bounded rate-limit map,
  and at most 32 distinct simultaneous upstream requests
- Fixed HTTPS upstream, redirects rejected, strict coordinate/query validation,
  and JSON response-size cap of 64 KiB
- Sanitized errors; no raw provider errors, key-bearing URLs or request logging
- Same-origin API, no CORS wildcard, cross-site browser API requests rejected
- Production static files confined by realpath, with dotfiles/source maps blocked,
  a MIME allowlist and restrictive security headers

Precise coordinates are rounded to two decimals (roughly kilometre scale) before
leaving the browser and again on the server. The optional location button must
be explicitly used before requesting browser geolocation. The approximate
coordinates are shared with your application server and OpenWeather solely to
retrieve weather; do not persist coordinates in app storage or analytics.
Provider and hosting privacy policies still apply. A city preset avoids sharing
device location.

These built-in limits are for a small single-process deployment. They do not
replace an edge rate limiter, API-budget controls, HTTPS, monitoring, and your
provider plan's quotas. Reverse proxies share the direct socket IP by design;
the app does not trust spoofable `X-Forwarded-For` headers. Use a trusted edge
limiter for fair per-user limits. No distributed cache, authentication service,
or automatic polling is included.

### Errors and failure behavior

Missing credentials return `503 LIVE_WEATHER_DISABLED`; invalid queries return
400; throttling returns 429; upstream failures return 502; upstream timeout
returns 504. Error messages contain no upstream payload or exception detail.
The UI retains a usable demo/previous scene when live weather fails and should
show the error rather than label demo data as live.

## Verification

`npm test` runs fixture-based unit and HTTP integration tests, including condition
mapping, no-key behavior, malformed response handling, timeout, cancellation,
cache expiry, stale fallback, size limits, rate limits, secret-safe errors, and
static-file confinement. Tests never need or send a real API key. A successful
fixture suite does not imply a live provider request has been verified.

## Official references

- [Current weather API](https://openweathermap.org/api/current)
- [Weather condition codes and day/night icons](https://openweathermap.org/api/weather-conditions)
- [Geocoding API](https://openweathermap.org/api/geocoding-api)
- See [third-party notices](THIRD_PARTY_NOTICES.md) for attribution and licensing

Dify is intentionally not required for weather. Retrieving structured current
conditions through a deterministic adapter keeps this feature easier to audit,
cheaper to run, and usable without an AI service or extra secrets.
