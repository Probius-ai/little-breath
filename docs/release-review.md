# Public-release review / 공개 전 점검

Review date: 2026-10-02. Scope: public-source preparation and the requested GitHub Pages static deployment. Local checks are recorded here; the actual remote commit, CI results, and deployed URL still require verification by the publisher. Pages runs the Mock experience without server credentials. Enabling paid/live provider use is a separate configuration. This document is a release gate, not a security certification or legal opinion.

## Safe release baseline

- Default weather is a labeled local demonstration. Network access begins only after the visitor explicitly requests live weather and understands that their selected city or approximate coordinates go to the app server and OpenWeather.
- The browser never receives an OpenWeather or Dify secret. Use server environment variables or the deployment provider's secret store. `.env.example` contains placeholders only; `.env*`, private exports, logs, local state, and development captures stay out of source archives and Git history.
- Birthday, drawing, joints, growth, food/care history, and pet state are not required by a current-weather lookup. Keep them on the device. Explain browser storage and include a way to remove it. Do not describe localStorage as encrypted or access-controlled against scripts on the same origin.
- No pretrained third-party weights are bundled. Procedural animation, reward counters, and model-based reinforcement learning must not be described as interchangeable. See [third-party notices](THIRD_PARTY_NOTICES.md).

## Server and transport checks

Before a public live deployment, verify the final server, reverse proxy, and hosting configuration together:

1. Requests go only to fixed HTTPS provider endpoints. Browser input must never choose an upstream URL, host, API key, or arbitrary request headers. Reject redirects rather than forwarding credentials to a new destination.
2. Validate and bound every accepted field and body size. Return sanitized errors, enforce timeouts and finite numeric responses, and avoid echoing upstream URLs, provider error bodies, authorization headers, or keys.
3. Distinguish current live data, demo fixtures, cached live data, and errors. An outage must not silently make fixture weather appear live. A current-weather response does not establish historical weather for a birthday.
4. Bound request rates, concurrent work, cache entries and cache lifetimes. In-process limits are useful for one instance but are not a multi-instance abuse defense. Public deployments need an appropriate edge/global quota and cost cap. CORS and Origin checks do not authenticate arbitrary non-browser clients.
5. Serve HTTPS. Configure same-origin access, least-privilege security headers, and a Content Security Policy suitable for the actual built assets. Keep the development server and its filesystem access off the public Internet. `vite preview` is a local build preview, not a production security boundary.
6. Redact query strings/body fields at the host, reverse proxy, error tracker, and application logger. The browser-to-app hop may otherwise expose city names in logs. Do not promise zero retention by outside hosts/providers.
7. Use a production static server or supported platform for `dist/`; keep API secrets solely in the backend. A static-only host can run the demo, but it cannot privately hold a weather API key.

## Publication checklist

- [ ] Confirm the author/license choice and every bundled asset's origin; retain required notices and provider attribution
- [ ] Inspect the exact source archive and, if a repository exists, the entire committed history for secrets and private assets; `.gitignore` does not remove already committed material
- [ ] Confirm no extracted neural weights, pickle checkpoints, real API responses, private workflow IDs, user drawings, or screenshots with personal input were accidentally packaged
- [x] Reproduce installation from the lockfile in an isolated clean directory with `npm ci` (Node 24.19.0); CI also declares Node 22/24
- [x] Run unit/API checks and frontend/backend TypeScript checks plus production build; browser checks are recorded separately below
- [x] Review dependency audit output separately from tests; an empty audit is not proof of security
- [ ] Test malformed input, oversized requests, unsupported methods, API failure/timeout, retry, cancellation/navigation, and stale response handling
- [ ] Test storage disabled/quota failure, malformed imported files, repeated actions, reset, and a fresh profile
- [ ] Verify photo tracing stays local; accept bounded raster images, handle decode failure, revoke object URLs, and exclude the original photo/EXIF from saved/exported projects and public fixtures unless deliberately included
- [ ] Verify PNG export excludes the private tracing underlay by default, and that imported photos cannot taint the drawing canvas
- [ ] Validate imported growth/care values, prevent repeated-action races, and describe growth as a deterministic game mechanic rather than machine learning
- [ ] Check keyboard use, visible focus, motion reduction, screen-reader labels, responsive layout, and no unexpected external requests in default mode
- [ ] Before a public live deployment, verify provider plan/attribution, HTTPS, production logging policy, rate/quota controls, and host restrictions
- [x] Confirm publication scope: the owner requested GitHub Pages deployment; do not provision paid services or expose a live API key
- [ ] Verify the exact remote commit, CI/Pages workflow conclusion, final URL, and behavior at the repository subpath after deployment

## Verification record

Independent checks completed (2026-10-02):

- Inspected `server/app.ts`, `server/weather-service.ts`, `server/index.ts`, `src/weather.ts`, `src/project.ts`, and the npm lockfile.
- A local in-memory/fake-provider test completed 20 HTTP cases: static dotfile/source/symlink/traversal denial; unsupported API methods; cross-site request guard; unknown, duplicate, mixed, and out-of-range location inputs; security headers; key non-reflection; successful normalized response; health/unknown API paths; and static HEAD behavior.
- `node --import tsx --test tests/weather.test.ts` passed all 17 weather tests after the upstream response cleanup change.
- `npm run check` passed 83 tests, backend typecheck, frontend typecheck, and Vite production build in an isolated clean copy after `npm ci`. No real service credentials were needed.
- `npm run typecheck:server` passed with Node type definitions installed. The aggregate `npm run check` now includes this backend typecheck.
- Imported rig identifiers reject markup-bearing strings; unknown nested body/head fields are stripped. Both originally reported import issues were retested with malicious/extra-field fixtures and passed.
- Additional fake-provider probes passed for cache reuse, coordinate rounding, exception redaction, oversized upstream rejection, missing-key fail-closed behavior, and timeout. No real API key was accessed and no provider request was made by those probes.
- `npm audit --json` returned zero known vulnerabilities for the inspected lockfile. This is a point-in-time registry result, not proof that all dependencies are safe.
- Installed dependency metadata showed MIT, Apache-2.0, BSD-3-Clause, and ISC notices. Exact version/license metadata remains in the lockfile.

These are focused backend checks, not a full UI/browser pass. Photo tracing was statically checked: it uses a local `ImageBitmap`, accepts PNG/JPEG/WebP only, caps input at 12 MiB and decoded size at 20 million pixels/8,000 pixels per dimension, closes oversized bitmaps, and keeps the photo outside the saved Project structure. The export path targets the garden canvas, not the tracing canvas. Photo request lifecycle races were corrected using generation counters; stale returned bitmaps are closed, and navigation, removal, a new project, and import invalidate old requests. Weather dialogs also abort and invalidate old requests. These fixes were reviewed statically; browser/privacy checks remain distinct from this review.

A targeted scan of source/configuration/documentation found no common API-token/private-key signatures, local credential-bearing `.env` files, or model checkpoint files. Only the documented official OpenWeather logo and original favicon were present as public image assets. There was no Git history to inspect at the time of this review; any later source archive and Git commits must still be checked before publication. `.gitignore` behavior was independently tested, including the `.env.example` exception.

Known limits and unfinished deployment checks:

- Photo size is checked before decoding, but pixel/dimension limits are checked after the browser decodes. A highly compressed large image can briefly allocate more memory before rejection. File MIME and PNG/JPEG/WebP binary signatures are checked before decoding; dimensions are still checked after decoding rather than parsed in advance from format-specific headers.
- No real-key OpenWeather round trip, public HTTPS hosting, multi-instance abuse controls, or remote CI execution was performed by this review.
- Six Playwright UI regressions are authored in `tests/browser/studio.spec.ts`. Local execution was blocked before any app assertions by Chromium process `socket() EPERM`; the supported cloud browser also rejected localhost access (`ERR_BLOCKED_BY_CLIENT`). They are configured for a normal Chromium environment in CI, but no successful browser run is claimed in this local record.
- Desktop/mobile UI and asynchronous photo/modal flows require the separate browser QA record. Do not infer a full accessibility audit from passing unit tests.
- GitHub Pages deployment has been requested. Re-run checks on the exact content being published and verify the final remote result; local passing checks do not prove deployment succeeded.

## Reference sources

- [OpenWeather API documentation](https://docs.openweather.co.uk/current)
- [OpenWeather attribution requirements](https://docs.openweather.co.uk/faq)
- [Dify backend-only API guidance](https://docs.dify.ai/en/api-reference/guides/get-started)
- [Vite runtime requirements](https://vite.dev/guide/)
- [Vite deployment guidance](https://vite.dev/guide/static-deploy)
- [GitHub's licensing guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)
