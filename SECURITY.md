# Security policy

Please report vulnerabilities privately through the repository's GitHub Security Advisories, if enabled, rather than placing credentials or personal projects in public issues. If private reporting is not enabled, contact the repository owner through a private channel before sharing a reproducible sensitive payload.

## Public release boundaries

- Never commit `.env`, secret API keys, exported user projects, reference photos, model checkpoints, or logs containing credentials
- The browser does not accept API keys. OpenWeather keys belong only in the optional server's environment
- Imports are JSON data, never scripts. Imported names and labels are rendered as escaped text; identifiers are bounded and validated
- The server has fixed upstream hosts, request validation, timeout/size limits, bounded cache, and same-origin policy
- The in-memory rate limiter is per process. Use suitable infrastructure controls for public/multi-instance hosting
- `localStorage` is not encrypted. User-created projects may contain personal birthdays and drawings
- Third-party package audits are a point-in-time signal, not a guarantee

The app has no medical, financial, or security decision-making features. Procedural creature behavior is fictional.

## Optional account sync

- The checked-in Supabase publishable key is intentionally public; it grants no anonymous access to private projects. Never substitute a service-role or secret key
- Login uses PKCE and exact redirects. It requests GitHub profile/email only, with no repository scopes. GitHub client secrets are configured only in the Supabase dashboard
- Project upload is separately opt-in, with fields and destination disclosed. RLS restricts SELECT/INSERT/UPDATE to auth.uid() ownership; the invoker RPC takes no owner parameter
- Server revisions/CAS prevent silent multi-device overwrites. Pending mutations and conflict pairs remain account-bound; photo underlays, tokens and weather payloads are excluded from project JSON
- Auth sessions are tab-scoped sessionStorage and remain distinct from project caches. Account device copies and backups are not encrypted, and logging out does not erase them or server copies
- See [cloud setup and verification](docs/cloud-sync.md). Browser test sessions are synthetic; real database security tests are transactional and rolled back
