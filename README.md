# ColdReach Intelligence Service

A **stateless** prospect-discovery layer that sits on top of [ColdReach](https://trycoldreach.app).
It takes a broad targeting goal (e.g. _"founders at YC fintechs in NYC, Series B"_)
and returns **ranked, specific people with reasons** as structured JSON.
The service _researches_; ColdReach _acts_ (drafting + sending).

The `/chat` route is the main ColdReach-style chat workflow: start in a centered
Claude-like composer, pick from ranked contacts, confirm a warm hook, then
continue to `/email/[draftId]` for editing/sending.

See [`AGENTS.md`](./AGENTS.md) for the full build spec and architecture.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript (strict)
- Vercel AI SDK (`ai`) + `@ai-sdk/openai` for intent parsing
- `@assistant-ui/react` + `@assistant-ui/react-ai-sdk` for the chat runtime shell
- `zod` for request validation
- Fiber and Apollo (optional) with a curated YC-fintech dataset fallback

## Setup

```bash
npm install
cp .env.example .env.local   # set SERVICE_SHARED_SECRET (others optional)
npm run dev                  # http://localhost:3000
```

`OPENAI_API_KEY`, `FIBER_API_KEY`, and `APOLLO_API_KEY` are **optional**:
without them the service falls back to deterministic heuristics and the curated
dataset, so the demo path always works.

## Folder structure

- `app/chat/` - main ColdReach-style chat UI
- `app/email/` - drafted email review/send route
- `app/demo/` - legacy redirects and shared demo draft helpers
- `app/api/v1/` - structured narrow/hooks/enrich endpoints
- `app/api/demo/chat/` - assistant-ui/Vercel AI SDK streaming transport target
- `lib/` - backend clients, parsing, ranking, context, and shared types
- `lib/dataset/` - curated fallback prospect data
- `scripts/` - smoke and integration helpers

## Demo UI

- Light mode follows the supplied ColdReach tokens (`#F6F4EF` canvas,
  `#F2F0E9` sidebar, white cards, black primary buttons, periwinkle accents).
- Dark mode uses matching component tokens and can be toggled from the chat and
  email pages.
- Drafts are stored in browser storage because the intelligence service remains
  stateless. `/api/email/send` forwards to `COLDREACH_SEND_URL` when configured,
  otherwise it records a safe demo send.

## Endpoints

All endpoints are versioned under `/api/v1` and require an `x-service-secret`
header matching `SERVICE_SHARED_SECRET`.

| Method & path        | Owner   | Status |
| -------------------- | ------- | ------ |
| `POST /api/v1/narrow` | Sasha   | real   |
| `POST /api/v1/hooks`  | Brandon | real (Fiber/fallback context) |
| `POST /api/v1/enrich` | Brandon | real (Fiber/fallback context) |

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
