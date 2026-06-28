# AGENTS.md

ColdReach Intelligence Service — a stateless prospect-intelligence layer in front
of [ColdReach](https://trycoldreach.app). This repo implements **Brandon's slice**:
the Fiber spike (`lib/fiber.ts`), `/v1/hooks` + `/v1/enrich`, and the demo UI
(narrated streaming + dark mode). Full spec: [`docs/brandon-plan.md`](docs/brandon-plan.md).

## Guardrails (do not violate)

- **Never fabricate hooks.** Every `HookCandidate` must trace to a real signal
  `source`. If context is thin, return fewer or none.
- **Never auto-inject an unconfirmed hook** into a draft — hooks are
  human-in-the-loop (`needsUserConfirmation: true`); the user confirms.
- The service is **stateless**, **never touches Gmail/OAuth**, and **returns
  ingredients, not finished prose** (`/v1/enrich` → context + angles).
- **Do not redefine the contract** (`lib/types.ts`) or reimplement `/v1/narrow`.
  `lib/types.ts`, `lib/auth.ts`, `lib/mock-data.ts`, and `app/api/v1/narrow`
  are local **Sasha stand-ins** — replace them with the real versions when Sasha
  pushes; do not fork the shapes.
- **Do not import from the ColdReach repo.** Re-type patterns (tagged
  `// PATTERN FROM coldreach/*`).

## Build / lint / test / run

Standard scripts live in `package.json` (`dev`, `build`, `start`, `lint`,
`typecheck`, `fiber:spike`). Use `pnpm`. `pnpm dev` serves the app on
`http://localhost:3000`; the demo flow is at `/demo`.

## Cursor Cloud specific instructions

- **Zero keys required to run or demo.** Every layer degrades to deterministic,
  grounded fallback data, so `pnpm dev` + the full `/demo` flow work with no
  `.env.local`. Optional keys (`OPENAI_API_KEY`, `FIBER_API_KEY`, `APOLLO_API_KEY`,
  `SERVICE_SHARED_SECRET`) only upgrade live data — see `.env.example`.
- **Fiber is wired to the real API** (`https://api.fiber.ai`, discovered via its
  `/llms.txt` + `/ai-docs/<operationId>.md`). Key facts (see `lib/fiber.ts`):
  auth = API key in the JSON **body** as `apiKey` (we also send `x-api-key`);
  recent posts come from LinkedIn `POST /v1/linkedin-live-fetch/profile-posts`
  (by slug/URL) and X `POST /v1/twitter/user-tweets` (by handle). Live fetches
  are slow (~tens of seconds) and **cost credits** — keep test volume low.
  With `FIBER_API_KEY` set, `pnpm fiber:spike` prints "✅ REAL SOCIAL"; with it
  unset it prints "⚠️ PIVOT TO FALLBACK" (also the expected/working outcome).
- **`lib/mock-data.ts` ships `REAL_PEOPLE`** (real public fintech founders —
  Dubugras/Akhund/Collison/Perret) with verified LinkedIn slugs / X handles, so
  the live Fiber path returns their ACTUAL posts in the demo. Their fallback
  `context.signals` are intentionally empty (never fabricate hooks for real
  people); fictional `DEMO_PEOPLE` keep curated signals for the offline fallback.
- **Auth runs in OPEN mode unless `SERVICE_SHARED_SECRET` is set.** The demo UI
  calls its own `/v1` endpoints without a header and relies on open mode; if you
  set the secret, you must send the `x-service-secret` header on every `/v1` call.
- **Lint is plain ESLint, not `next lint`** (removed in Next 16). `pnpm lint`
  runs `eslint .`. The flat config imports `eslint-config-next/core-web-vitals`
  and `eslint-config-next/typescript` **directly** (native flat configs) — do
  NOT route them through `FlatCompat`, which throws a circular-structure error
  with this version.
- **Demo streaming is a raw NDJSON `ReadableStream`** at `POST /api/demo/stream`
  (fixed narration steps + a final `result` event), deliberately chosen over an
  LLM token stream so it is reliable on stage with no keys. The client renders a
  step only once it arrives (the "no blank assistant bubbles" fix).
- **`next build` rewrites `tsconfig.json`** (sets `jsx: react-jsx`, adds
  `.next/dev/types`). That edit is expected — keep it.
