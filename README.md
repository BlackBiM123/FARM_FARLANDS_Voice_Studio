# FARM & FARLANDS — Voice Studio

Vue 3 + Vite + TypeScript + Tailwind. The project starts empty: no bundled NPCs, portraits, dialogue or speech presets. The supplied screenshot informs only the graphite/amber visual style. Includes a casting table, editable NPCs, voice/style/pace direction, test generation, audio playback, two-take comparison, favorites, local persistence and Godot ZIP export.

## Local development

Node 24 is required. Run `npm ci`, then `npm run dev`. The Vite development server serves the same `/api/tts` handler used by Vercel. Run `npm run build`, `npm test` and `npm run test:e2e` for verification. Playwright requires Chromium (`npx playwright install chromium` when absent).

Copy `.env.example` to `.env.local` and configure **server-only** values:

- `GEMINI_API_KEY`: Gemini Developer API key, restricted to the intended API/project.
- `STUDIO_ACCESS_TOKEN`: legacy variable; ignored by the current authentication system.
- `GENERATION_ENABLED`: defaults to false. Set true only after confirming account quotas and approving any possible charges.
- `STUDIO_ORIGIN`: exact allowed origin; same-origin requests are also permitted.

Never use `VITE_` prefixes for secrets. They would put secrets in the public client bundle. Supabase Auth verifies username/password credentials; access and refresh tokens are stored in HttpOnly, Secure, SameSite=Strict cookies. Refresh-cookie retention is 30 days. It is not stored in the client project or localStorage. The access dialog supports signing out. Unauthorized requests are rejected before any provider call. The API validates input, restricts models/voices, limits test text to 600 characters, sets a 90-second provider timeout and caps WAV responses at 4 MB. Errors omit provider bodies and secrets. Logs contain only a request ID and status. This is a private multi-user studio. Administrators manage admitted accounts; normal users share the studio project and cannot administer accounts. Legacy access codes and signed cookies are rejected. There is no distributed application rate limiter: keep the access code private and configure Vercel Firewall rate limits and provider quotas before allowing wider access.

## Vercel / GitHub

Target repository: https://github.com/BlackBiM123/FARM_FARLANDS_Voice_Studio

Import this repository into the Vercel team `blackbim123's projects`. Choose Vite, build `npm run build`, output `dist`, Node 24. `api/tts.ts` is a Node Vercel Function with a 120-second maximum duration. Set the variables above in Vercel project environment settings; none are supplied in this repository. Keep generation disabled for the initial interface preview. Publication and paid operations require the owner's confirmation. Git integration will subsequently create deployments when branches are pushed.

## Models and costs — checked 2026-10-09

The current [Gemini speech generation documentation](https://ai.google.dev/gemini-api/docs/speech-generation) documents `gemini-3.8-flash-tts` and `gemini-3.8-flash-lite-tts`, the Interactions API, and unary WAV output (24 kHz mono, 16-bit). This implementation uses these models and the current REST request schema. It uses built-in Google voices; no voice cloning is performed.

The [pricing table](https://ai.google.dev/gemini-api/docs/pricing) lists a free tier for Gemini 3.8 Flash TTS. This is not a promise that your requests will be free or that your project has access. [Actual limits are project-specific](https://ai.google.dev/gemini-api/docs/rate-limits) and must be checked in AI Studio. No account quota or real synthesis request was verified during development because no Gemini key was configured. No billing was enabled. Speech style and pace are natural-language model instructions, not deterministic audio DSP controls.

## Storage and Godot

NPC settings are saved in localStorage; WAV recordings and take metadata in IndexedDB. When Supabase is configured, the authenticated studio syncs NPC settings and takes to the shared cloud project. Local storage remains a browser cache and fallback. Clearing browser data removes the local cache; after login cloud data loads again. Unsynced local changes are not recoverable after clearing browser data, so export backups regularly. JSON import/export transfers NPC settings only. Godot ZIP export includes all saved takes, favorites, immutable generation settings, language, transcript and `res://voice/audio/...wav` paths in `voice/manifest.json`. Copy the `voice` directory into the Godot project. WAVs are playable with `load(path)` after Godot imports them.

Example Godot 4:

```gdscript
var manifest = JSON.parse_string(FileAccess.get_file_as_string("res://voice/manifest.json"))
var take = manifest.takes[0]
$AudioStreamPlayer.stream = load(take.audio)
$AudioStreamPlayer.play()
```

Characters use neutral placeholders; no images or character data from the supplied screenshot are included. No OpenRouter proxy is used: generation calls Gemini directly from the protected server.

## Verification

Server tests cover authentication, disabled generation, origins, validation, quota errors, WAV forwarding and timeouts. Browser tests cover an empty catalog and newly created NPCs, settings persistence, mocked synthesis, comparison, favorite persistence, ZIP contents, deletion and a 390px mobile viewport. Provider responses in tests are mocked; production synthesis and the deployed Function must be checked after credentials and publication approval.


## Published deployment

Live application: https://farm-farlands-voice-studio.vercel.app/

The initial production deployment is READY on Vercel with `GENERATION_ENABLED=false`. Its UI returns HTTP 200, and unauthenticated POST /api/tts returns HTTP 401. The browser starts with an empty catalog and reports no console warnings/errors. No Gemini synthesis call was made.

Source has been pushed to main. The first deployment was uploaded from reviewed local files. The owner has now reauthorized Vercel and connected BlackBiM123/FARM_FARLANDS_Voice_Studio in the project Git settings. Pushes to main use Vercel's Git integration; generation is enabled for the owner-confirmed Free tier.

## Usage panel

The in-studio panel records successful takes in this browser, per model. It displays a daily-reset countdown based on America/Los_Angeles midnight with DST, and a local estimate of request allowance if RPM/RPD limits are known. Limits can be entered inside the studio and are also populated from Google QuotaFailure responses when supplied. RetryInfo supplies a cooldown timer; 429 without retry metadata displays an unknown wait, not an invented duration. The UI prevents generation while a reported cooldown is active.

This is not an authoritative project-wide remaining quota. Other applications, devices, tabs, rejected requests and historical calls are not measured. TPM allowance can be configured, but remaining tokens are unknown. Project-wide monitoring requires additional authenticated Service Usage / Cloud Monitoring access, plus verifying that the model's quota metrics are exposed there. No Google Cloud monitoring credentials have been configured and no external AI Studio link is required by the UI.

## Supabase cloud persistence

Project: `lgieykyijdpqzxyyoueh` (`farm-farlands-voice-studio`), Free organization. Migration `supabase/migrations/001_studio.sql` has been applied: `studio_projects`, `studio_takes` and private `studio-audio` bucket. Tables have RLS enabled and no anonymous/authenticated access; the Vercel server authorizes the owner studio cookie before using a server Secret key. This is a single shared studio, not separate per-user workspaces. Only users explicitly admitted by a studio administrator can access the shared project.

Production variables: `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (Supabase `sb_secret_...`, or legacy service-role key). The secret is never exposed in browser bundles. Preview and local development remain local-only unless explicitly configured with their own server variables.

NPC settings autosave with an 800ms delay and optimistic revision checks. A stale edit returns 409 rather than silently replacing another device's changes. The user can export local JSON before loading the cloud version; a local JSON backup is also kept under `farlands-before-cloud-load`. Refresh/synchronize to fetch changes from other devices; no realtime subscription is enabled. An empty cloud project automatically receives existing local NPCs and recordings after login. If an existing cloud project conflicts with unsynced local settings, the studio asks the user which version to load. Files and settings that fail to upload remain in the browser and can be retried via Synchronize.

WAV files are stored privately and streamed through `/api/audio` only after studio authentication. Audio downloads are lazy, reducing transfer usage. Godot export downloads missing cloud audio before building its ZIP. New takes and favorites are synced. Deleting a take hides it through a tombstone; its file is retained in the private bucket for recovery and continues to use storage. There is no permanent-purge UI yet. The storage counter measures registered recording bytes including hidden takes; orphan uploads are not measured by this counter.

Free tier currently includes 500 MB database and 1 GB file storage, subject to Supabase limits; free projects may pause after a week of low activity. No paid plan or billing was enabled. Keep exported backups: automatic database backups are not included in the Free plan.

## Password login and user administration

The public page displays only the login screen until Supabase Auth verifies a studio-admitted account. All cloud, audio and TTS routes revalidate the user against Supabase Auth. Studio admission, enabled state and role are trusted only from server-managed `app_metadata`; user-editable metadata cannot grant access. Old bearer access codes and legacy cookies have no effect. There is no public signup in the studio; accounts created independently in Supabase cannot enter unless an administrator admits them.

Studio usernames are mapped to synthetic internal email identifiers under `accounts.farlands.invalid`; those addresses are not contact addresses and no confirmation emails are sent. Passwords are stored and verified by Supabase Auth, never in application source or database tables. Administrators can add users, assign roles, disable access and set a new password. They cannot disable or demote themselves through the app. The user list is capped at 100 studio accounts.

Initial admin provisioning uses a one-time server-only `STUDIO_BOOTSTRAP_TOKEN`. It can only create the `admin` administrator before any studio account exists. Disable that variable after provisioning. Subsequent users are created only by an authenticated administrator. New-user passwords require at least 12 characters; the initial master credential follows the owner's explicit password choice. No master password is committed in this repository.

GET /api/session refreshes expired access using its HttpOnly refresh cookie. API clients retry an authentication failure once after session refresh, then return to the login screen. Supabase Auth applies its provider-side authentication limits; no distributed custom login limiter is configured. These are application-level access controls; static HTML/JS/CSS login assets remain publicly downloadable.
