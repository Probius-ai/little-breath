# Third-party notices / 외부 구성요소 안내

Last reviewed: 2026-10-03. This notice distinguishes application code, development tools, remote-service data, and excluded research assets. It is a practical release record, not a legal opinion or a promise of rights that an upstream publisher has not granted.

## Application and build tools

The project's root `LICENSE` applies only to original application code and assets covered by that license. Third-party rights and provider terms are not replaced by it.

The browser application uses the exactly pinned `@supabase/supabase-js` 2.117.2 SDK for optional authentication and private account storage. Its runtime dependency inventory is recorded in `package-lock.json`; full upstream notices are bundled in [`public/third-party-licenses.txt`](../public/third-party-licenses.txt) and copied into every deployed build. The Supabase SDK family, `@supabase/phoenix`, and `iceberg-js` use MIT; `tslib` uses 0BSD. Supabase hosting and GitHub account/provider terms are separate from these software licenses.

Development and test tools are installed by npm, with resolved versions recorded in `package-lock.json`:

- [Vite](https://github.com/vitejs/vite): MIT
- [TypeScript](https://github.com/microsoft/TypeScript): Apache-2.0
- [Prettier](https://github.com/prettier/prettier): MIT
- [tsx](https://github.com/privatenumber/tsx): MIT
- [Playwright](https://github.com/microsoft/playwright): Apache-2.0
- [Node.js TypeScript definitions](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node): MIT

Those packages and their transitive dependencies retain their own license/copyright notices in the installed package distributions. Do not remove them if redistributing the tools. The lockfile is the dependency inventory; this short list is not a full software bill of materials. Recheck dependencies when upgrading.

## OpenWeather data and branding

Live weather is optional. The default demonstration weather is a synthetic fixture, not a downloaded current or historical observation. The project does not bundle an OpenWeather key or a reusable weather database.

For live results, show visible attribution: **Weather data provided by OpenWeather**, linked to <https://openweathermap.org/>, together with the official OpenWeather logo where required by the selected service plan. The logo identifies the data provider; it is not an original project asset and does not imply endorsement.

Bundled attribution asset: `public/openweather.png`, extracted without modification from the official [logo archive linked by the FAQ](https://docs.openweather.co.uk/storage/app/media/logo_files.zip), member `Logo files/Master logo/RGB (for screen)/OpenWeather-Master-Logo RGB.png`. Retrieved 2026-10-02; SHA-256 `78530eceb7385370ba7997ae66c08125e2d0cad102d172b2c5ae5e68c19e9a2b`. OpenWeather retains its branding/trademark rights. This asset is included for provider attribution under that published guidance and is excluded from the project's MIT grant; do not present it as independently relicensed artwork.

OpenWeather's current guide distinguishes displayed output from an adapted weather database. Its self-service data licensing and subscription terms remain separate from this project's software license. Review the actual account's plan before operating a public service, retaining/exporting weather data, or republishing a weather feed. Do not assume the app's MIT license licenses the provider's data or waives attribution, usage limits, or payment obligations.

Primary sources:

- [Attribution FAQ](https://docs.openweather.co.uk/faq)
- [Current service and licensing guide](https://openweathermap.org/guide)
- [Pricing and plans](https://openweathermap.org/price)
- [Provider privacy policy](https://openweather.co.uk/privacy-policy)

## Dify integration guidance

Any optional Dify workflow/template is integration configuration, not a bundled copy of the Dify product. Dify and model-provider account terms, quotas, data handling, and charges are separate. Configure a Dify app API key on the server only. Never embed it in browser code or a public workflow export. A Dify workflow run with a mock weather branch still contacts Dify.

See [Dify's backend-only API guidance](https://docs.dify.ai/en/api-reference/guides/get-started). No paid account, new grant, or external workflow deployment is provisioned by this repository.

## Excluded pretrained policy

The public default deliberately does **not** redistribute the pretrained `sb3/td3-BipedalWalker-v3` archive or the numeric weights extracted from it. This app's procedural motion is not presented as that trained TD3 policy or as validated BipedalWalker physics.

Research provenance of the prior experimental asset:

- [Exact Hugging Face model repository](https://huggingface.co/sb3/td3-BipedalWalker-v3)
- [Exact archive metadata](https://huggingface.co/sb3/td3-BipedalWalker-v3/blob/main/td3-BipedalWalker-v3.zip)
- Published archive SHA-256: `a04f7afb8d5726c958db8d0355d9e4c9e8b4513e97dc62b7c288a0d26b6e4a84`
- [Related DLR-RM trained-agents repository](https://github.com/DLR-RM/rl-trained-agents) and its [MIT license, © 2020 Antonin RAFFIN](https://github.com/DLR-RM/rl-trained-agents/blob/master/LICENSE)

At review time the exact Hugging Face card/file listing did not provide an explicit model license. The related repository's MIT notice is relevant context, but exact artifact identity and license coverage were not established. A file hash identifies bytes; it does not grant rights. Before adding weights, obtain an explicit applicable license or verified provenance to a licensed artifact, preserve required notices, and record the immutable source revision and hash. No claim is made that the model is prohibited or that public availability alone grants redistribution rights.
