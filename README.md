# ColdReach Intelligence Service

A **stateless** prospect-discovery layer that sits on top of [ColdReach](https://trycoldreach.app).
It takes a broad targeting goal (e.g. _"founders at YC fintechs in NYC, Series B"_)
and returns **ranked, specific people with reasons** as structured JSON.
The service _researches_; ColdReach _acts_ (drafting + sending).

See [`AGENTS.md`](./AGENTS.md) for the full build spec and architecture.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript (strict)
- Vercel AI SDK (`ai`) + `@ai-sdk/openai` for intent parsing
- `zod` for request validation
- Apollo (optional) with a curated YC-fintech dataset fallback

## Setup

```bash
npm install
cp .env.example .env.local   # set SERVICE_SHARED_SECRET (others optional)
npm run dev                  # http://localhost:3000
```

`OPENAI_API_KEY` and `APOLLO_API_KEY` are **optional**: without them the service
falls back to a deterministic heuristic intent parser and the curated dataset,
so the demo path always works.

## Endpoints

All endpoints are versioned under `/api/v1` and require an `x-service-secret`
header matching `SERVICE_SHARED_SECRET`.

| Method & path        | Owner   | Status |
| -------------------- | ------- | ------ |
| `POST /api/v1/narrow` | Sasha   | real   |
| `POST /api/v1/hooks`  | Brandon | stub (mock JSON) |
| `POST /api/v1/enrich` | Brandon | stub (mock JSON) |

### Example

```bash
curl -s http://localhost:3000/api/v1/narrow \
  -H "content-type: application/json" \
  -H "x-service-secret: dev-secret-coldreach" \
  -d '{"query":"founders at YC fintechs in NYC, Series B","limit":5}' | jq
```

Returns `{ intent, companies, people }` with `people` ranked by `matchScore`
(highest first), each carrying an `evidence` string and `channels` availability.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`
