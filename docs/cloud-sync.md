# Optional account sync

GitHub login and Supabase storage are optional. The complete drawing, rigging, care and Mock-weather app works as a guest. Login alone does not read or upload a project. On every new page session, the user must explicitly enable sync after reviewing the disclosure. Previously queued edits remain on that device until sync is enabled again.

## Data and consent

The account panel names the destination (the Little Breath Supabase project in Seoul) and the saved fields: authored strokes and rig, name, birth date or season, city and fictional temperament, care counters, growth, reduced-motion preference, creation/modification times. The existing `validateProject` allowlist reconstructs all payloads. Tracing photos, weather responses, provider tokens and API keys do not enter project JSON. Cloud projects are limited to 5 MiB. File export remains available independently of the service.

Guest data retains the original `little-breath.project.v1` key. Each account's device copy and pending mutation are stored separately under its Supabase UUID. Logging out restores the guest. Account copies and conflict recovery pairs remain on the device and are not encrypted; use care on shared devices. Turning sync off or signing out does not delete server data.

## Auth

`@supabase/supabase-js` is pinned exactly in package.json and package-lock.json. The checked-in URL and `sb_publishable_` key in `src/cloud/config.ts` are public browser identifiers, not server credentials. No secret/service-role key or GitHub client secret belongs in the repository, frontend environment or Actions workflow.

The browser uses GitHub OAuth with PKCE and only `read:user user:email` scopes, never repository scopes. Login uses the exact return URL `https://probius-ai.github.io/little-breath/`. The callback code is captured and removed before hash navigation. Unsupported implicit token fragments and login errors are removed without logging them. Auth state lives only in this tab's sessionStorage; GitHub provider tokens are removed from persisted session values. Closing the tab ends the locally persisted login. The app does not request offline GitHub access.

Every database request captures the initiating account's application access token and abort signal. Account changes invalidate all pending callbacks and restore the correct local workspace. An A-account write cannot be reissued with B's current token.

## Concurrency, offline and recovery

The database owns a monotonic revision. Local `Project.updatedAt` is display metadata and never used for last-write-wins. `save_project(p_project, p_expected_revision, p_mutation_id)` derives ownership only from `auth.uid()`. It returns a saved row or an explicit conflict. Retrying an uncertain response reuses the exact mutation UUID, revision and payload. Newer edits wait behind that immutable request.

The device stores pending work before sending. Transient failures retry with bounded backoff while sync remains enabled; offline mode waits for the browser's online event. Refresh/relogin keeps pending work but does not automatically upload it. A server conflict pauses writes. The user can download either JSON, then choose local or cloud. Both snapshots must be successfully preserved on the device before a resolution can replace either working copy. A second remote write is still protected by CAS. Corrupt account caches and storage-quota errors fail closed and preserve the visible project for file export.

Cloud copies are checked on explicit refresh and window focus while sync is enabled. The app does not use Realtime or continuously poll. A new remote version never silently overwrites a different local project.

## Database and setup for a fork

1. Create your own Supabase project and use a publishable client key. Update `src/cloud/config.ts` for your own project and exact deployed URL.
2. Review and apply `docs/cloud-schema.sql` to that project. It installs the private row table, own-user RLS, explicit grants, hardened invoker RPC and metadata protection. Do not grant anonymous access.
3. Register a GitHub OAuth application. Its callback is `https://<your-project-ref>.supabase.co/auth/v1/callback`; its homepage is your deployed URL.
4. Configure that client ID and secret directly in the Supabase GitHub provider dashboard. The account owner handles the secret; never put it in source or send it through chat.
5. Set the Supabase Site URL and redirect allowlist to the exact deployed return URL. No wildcard is required. Local development still works as a guest; use a separately approved local callback if you need local OAuth.
6. Run `npm ci`, `npm run check`, and browser tests. Test RLS using the rollback-only SQL fixture in `docs/cloud-database-tests.sql`, then run Supabase security advisors.

Free-tier availability, capacity and project pausing are provider constraints. Offline device copies and explicit file backups remain important. The feature provides authenticated row-level isolation, not end-to-end encryption.

## Verification boundaries

Unit tests cover serialization, consent, account isolation, revision conflicts, uncertain-response replay, logout races, offline recovery and storage errors. Browser tests use clearly synthetic sessions and intercepted network responses; they do not create real test accounts or upload personal projects. Database tests exercise real PostgreSQL role/RLS behavior with rollback-only synthetic fixtures and no persistent credentials. Actual GitHub OAuth must additionally be smoke-tested after the account owner finishes provider setup.

References: [GitHub login](https://supabase.com/docs/guides/auth/social-login/auth-github), [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), [securing the Data API](https://supabase.com/docs/guides/api/securing-your-api).

### Multiple tabs and storage failures

One tab at a time may hold a writable account workspace, using the Web Locks API. Other tabs remain in guest mode until the owner tab closes and the user reconnects. Browsers without Web Locks fail closed for account writes. A restored back/forward-cache page must reacquire ownership and reload the account cache. Cross-tab Supabase auth events are checked against this tab's own session before changing the displayed account.

If browser storage is full, sync pauses. The account panel still opens and can export the visible project. Unsaved account snapshots have a separate tab-session fallback plus an in-memory recovery copy and an unload warning. An auth-boundary export request is best-effort; check the browser's download list. Recovery copies are offered for download after returning to that account and never silently overwrite a newer device copy. Do not close the tab before exporting when both persistent and session storage are unavailable.
