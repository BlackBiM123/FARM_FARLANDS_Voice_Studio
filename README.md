# FARM & FARLANDS — Voice Studio

Vue 3 + Vite + TypeScript + Tailwind. The project starts empty: no bundled NPCs, portraits, dialogue or speech presets. The supplied screenshot informs only the graphite/amber visual style. Includes a casting table, editable NPCs, voice/style/pace direction, test generation, audio playback, two-take comparison, favorites, local persistence and Godot ZIP export.

## Local development

Node 24 is required. Run `npm ci`, then `npm run dev`. The Vite development server serves the same `/api/tts` handler used by Vercel. Run `npm run build`, `npm test` and `npm run test:e2e` for verification. Playwright requires Chromium (`npx playwright install chromium` when absent).

Copy `.env.example` to `.env.local` and configure **server-only** values:

- `GEMINI_API_KEY`: Gemini Developer API key, restricted to the intended API/project.
- `STUDIO_ACCESS_TOKEN`: a random secret of at least 24 characters. Enter this studio access code in the app, never the Gemini key.
- `GENERATION_ENABLED`: defaults to false. Set true only after confirming account quotas and approving any possible charges.
- `STUDIO_ORIGIN`: exact allowed origin; same-origin requests are also permitted.

Never use `VITE_` prefixes for secrets. They would put secrets in the public client bundle. The studio access code is kept only in tab memory. Unauthorized requests are rejected before any provider call. The API validates input, restricts models/voices, limits test text to 600 characters, sets a 90-second provider timeout and caps WAV responses at 4 MB. Errors omit provider bodies and secrets. Logs contain only a request ID and status. This is a private owner studio with a shared access code, not a multi-user authentication system. There is no distributed application rate limiter: keep the access code private and configure Vercel Firewall rate limits and provider quotas before allowing wider access.

## Vercel / GitHub

Target repository: https://github.com/BlackBiM123/FARM_FARLANDS_Voice_Studio

Import this repository into the Vercel team `blackbim123's projects`. Choose Vite, build `npm run build`, output `dist`, Node 24. `api/tts.ts` is a Node Vercel Function with a 120-second maximum duration. Set the variables above in Vercel project environment settings; none are supplied in this repository. Keep generation disabled for the initial interface preview. Publication and paid operations require the owner's confirmation. Git integration will subsequently create deployments when branches are pushed.

## Models and costs — checked 2026-10-09

The current [Gemini speech generation documentation](https://ai.google.dev/gemini-api/docs/speech-generation) documents `gemini-3.8-flash-tts` and `gemini-3.8-flash-lite-tts`, the Interactions API, and unary WAV output (24 kHz mono, 16-bit). This implementation uses these models and the current REST request schema. It uses built-in Google voices; no voice cloning is performed.

The [pricing table](https://ai.google.dev/gemini-api/docs/pricing) lists a free tier for Gemini 3.8 Flash TTS. This is not a promise that your requests will be free or that your project has access. [Actual limits are project-specific](https://ai.google.dev/gemini-api/docs/rate-limits) and must be checked in AI Studio. No account quota or real synthesis request was verified during development because no Gemini key was configured. No billing was enabled. Speech style and pace are natural-language model instructions, not deterministic audio DSP controls.

## Storage and Godot

NPC settings are saved in localStorage; WAV recordings and take metadata in IndexedDB. There is no cloud sync. Clearing browser data deletes this local project; export backups regularly. JSON import/export transfers NPC settings only. Godot ZIP export includes all saved takes, favorites, immutable generation settings, language, transcript and `res://voice/audio/...wav` paths in `voice/manifest.json`. Copy the `voice` directory into the Godot project. WAVs are playable with `load(path)` after Godot imports them.

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

Source has been pushed to main. The first deployment was uploaded from reviewed local files. The owner has now reauthorized Vercel and connected BlackBiM123/FARM_FARLANDS_Voice_Studio in the project Git settings. Pushes to main use Vercel's Git integration; generation remains disabled.
