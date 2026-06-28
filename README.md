# ColdReach Intelligence Service

A **stateless prospect-intelligence service** that sits in front of
[ColdReach](https://trycoldreach.app). ColdReach knows _how_ to write the cold
email; this service finds _who_ to reach and a genuine **human hook** (shared
hometown, school, a recent post), then hands off ingredients to ColdReach's
drafting.

> This repo implements **Brandon's slice**: the Fiber data spike, the
> `/v1/hooks` + `/v1/enrich` endpoints, and the entire demo UI (narrated
> streaming + dark mode). See [`docs/brandon-plan.md`](docs/brandon-plan.md) for
> the full build spec, and [`AGENTS.md`](AGENTS.md) for agent/dev guidance.

## Core principle

**The service researches; ColdReach acts.** It is stateless, never touches
Gmail, and never writes final message prose — it returns _ingredients_ (ranked
people, candidate hooks, recent context, angles). Hooks are **human-in-the-loop**:
the service proposes, the user confirms (anti-hallucination).

## Run locally

```bash
npm install
npm run dev         # http://localhost:3000  (demo at /demo)
```

Every layer **degrades gracefully without API keys**, so the full flow runs
end-to-end with zero configuration (demo-safe by design). Add keys in
`.env.local` (see `.env.example`) to enable live data. With `FIBER_API_KEY` set,
the dataset's real fintech founders (`REAL_PEOPLE` in `lib/mock-data.ts`) return
their **actual** recent LinkedIn/X posts; fictional demo people fall back to the
curated dataset.

| Env var                 | Purpose                                   | Without it                                  |
| ----------------------- | ----------------------------------------- | ------------------------------------------- |
| `SERVICE_SHARED_SECRET` | `x-service-secret` header auth on `/v1/*` | Open demo mode (auth skipped)               |
| `OPENAI_API_KEY`        | Hook extraction + angle generation        | Deterministic grounded heuristic fallback   |
| `FIBER_API_KEY`         | Live LinkedIn/X posts (real data)         | News/Apollo/curated dataset fallback        |
| `APOLLO_API_KEY`        | Bio/contact fallback                      | Curated dataset only                        |

## Scripts

| Command            | What it does                                          |
| ------------------ | ----------------------------------------------------- |
| `npm run dev`        | Start the dev server (Turbopack)                    |
| `npm run build`      | Production build                                     |
| `npm start`          | Serve the production build                          |
| `npm run lint`       | ESLint (flat config)                                |
| `npm run typecheck`  | `tsc --noEmit`                                       |
| `npm run fiber:spike`| Run the Fiber spike (Task 0 decision gate)          |

## Endpoints

- `POST /v1/narrow` — broad goal → ranked people (**mock**; Sasha owns the real one).
- `POST /v1/hooks` — person → grounded candidate hooks (`needsUserConfirmation: true`).
- `POST /v1/enrich` — person + confirmed hook → recent context + outreach angles.
- `POST /api/demo/stream` — narrated NDJSON stream powering the demo UI.

All `/v1` endpoints validate the body with Zod and require the shared-secret
header when `SERVICE_SHARED_SECRET` is set.

## Folder structure

```
app/
  page.tsx                landing page
  layout.tsx              root layout + theme provider
  globals.css             dark/light theme tokens + demo styles
  demo/                   the disposable demo UI (Brandon)
    page.tsx              flow orchestrator (targeting→results→detail→hook→draft)
    components/           TargetingPrompt, ProspectResults, PersonDetail,
                          HookCapture, DraftView
  api/
    v1/narrow/route.ts    mock narrow (Sasha stand-in)
    v1/hooks/route.ts     Brandon
    v1/enrich/route.ts    Brandon
    demo/stream/route.ts  narrated streaming (Brandon)
lib/
  types.ts                read-only contract (Sasha)
  auth.ts                 shared-secret auth (Sasha stand-in)
  mock-data.ts            curated YC-fintech dataset (Sasha stand-in / fallback)
  fiber.ts                Fiber AI client — the spike (Brandon)
  apollo.ts               Apollo fallback client (Brandon)
  context.ts              Fiber→fallback context gathering (Brandon)
  ai.ts                   OpenAI hooks/angles + heuristic fallback (Brandon)
  hooks.ts                findHooks (Brandon)
  enrich.ts               enrich (Brandon)
  http.ts                 tiny route helpers
scripts/
  fiber-spike.ts          Task 0 decision-gate script
```

## Tech

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Vercel AI SDK (`ai`,
`@ai-sdk/openai`) · `zod` · `next-themes`.
