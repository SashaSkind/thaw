# ColdReach Intelligence Service — Build Spec (Sasha's part)

> Drop this in the repo root as `AGENTS.md` (or `docs/sasha-plan.md`) and give it to Cursor as context.
> It explains the whole project, the architecture, and the exact slice I (Sasha) own.

---

## 0. TL;DR for the agent

We are building a **stateless intelligence service** in a **new, separate repo** for a 24-hour YC growth hackathon. It adds a prospect-discovery layer on top of an existing product called **ColdReach** (`trycoldreach.app`). The service takes a broad targeting goal ("founders at YC fintechs in NYC, Series B") and returns **ranked, specific people with reasons** as structured JSON. ColdReach (not us) drafts and sends the actual email.

**My slice (Sasha) is the safe spine:** the service skeleton, the `/v1/narrow` endpoint, a curated YC-fintech dataset, the ranking logic, and channel-availability. It must work with **zero dependency on Fiber AI** (my teammate Brandon owns the Fiber-dependent parts). I build full-speed from hour 1.

**Build order:** lock the shared types/contract → service skeleton + auth → curated dataset → `/v1/narrow` (parse → find → rank → return) → channel availability → mock the other two endpoints so Brandon isn't blocked.

---

## 1. Project overview

### What ColdReach is (the existing product — do NOT rebuild it)
ColdReach is a thoughtful, one-person-at-a-time cold-email tool. A user chats about who they want to reach, an agent finds **one** verified contact via Apollo, drafts the email in three tones (casual / professional / efficient), and the user sends it from their own Gmail. It is deliberately NOT a sequencer or CRM. Stack: Next.js 16 App Router, React 19, TypeScript, Vercel AI SDK, Upstash Redis, Apollo, Gmail send.

### The gap we fill
ColdReach assumes the user already knows *who* to email. The missing step is the **decision before the email**: turning "I want to reach founders at YC fintechs in NYC around Series B" into the exact companies, the exact people, and the best reason to reach out.

### What we're building (the whole project)
A separate repo that adds **prospect discovery + hook-finding** and hands the chosen person back to ColdReach for drafting/sending. The product feeling: *"I know the kind of opportunity I want, but not who. ColdReach finds the right person, helps me find a real hook, and writes the first message for the channel I can actually use."*

### Hackathon constraints (non-negotiable)
- **Separate codebase.** We may integrate with ColdReach at runtime, but must NOT share its repo or database. No importing ColdReach's `lib/`. (Copying patterns by re-typing is fine — see §7.)
- Open-source on GitHub for the duration.
- Judged on: usefulness (GTM), technical complexity, coolness. Submission is a 3-minute demo video. Slides discouraged — just demo a working thing.
- Primary track: **Revenue on Autopilot (Cold Outbound & Pipeline Automation).**

---

## 2. Architecture (the mental model the agent must hold)

**Core principle: the service researches; ColdReach acts.**

```
  ColdReach (real caller)        Demo UI (disposable, Brandon builds)
            \                      /
             \                    /     both call the SAME endpoints
              v                  v
        ┌───────────────────────────────────────┐
        │  INTELLIGENCE SERVICE  (this new repo) │
        │  stateless · no Gmail · no user state  │
        │                                        │
        │   POST /v1/narrow   ← SASHA owns        │
        │   POST /v1/hooks    ← Brandon owns      │
        │   POST /v1/enrich   ← Brandon owns      │
        │                                        │
        │   lib/  narrow · hooks · enrich · fiber │
        └───────────────────────────────────────┘
              |                         |
         Apollo + curated          Fiber AI (Brandon)
         dataset (Sasha)           OpenAI (reasoning, shared)
                       |
                 returns STRUCTURED JSON
                 { candidates, hooks, angles }
                       |
                       v
        ColdReach owns: the user, 3-tone drafting, Gmail send
```

### Hard rules for this repo
- The service is **stateless**. It holds no user session and no user data. (A short-lived cache for Apollo lookups is fine; nothing user-identifying.)
- The service **never touches Gmail** and **never writes the final email prose**. It returns *ingredients* (candidates, reasons, channel availability, hook angles). ColdReach turns those into drafts and does any sending.
- Every endpoint is **versioned** (`/v1/...`) and **thin**: validate input → call a `lib` function → return JSON.
- Auth is a **single shared secret** header on every endpoint. Nothing user-owned sits behind it, so this is sufficient.

---

## 3. The two-person split (so the agent builds MY part, not Brandon's)

| Area | Owner | This repo? |
|---|---|---|
| Service skeleton, routing, auth, shared types | **Sasha (me)** | yes |
| `/v1/narrow` (broad goal → ranked people) | **Sasha (me)** | yes |
| Curated YC-fintech dataset + ranking | **Sasha (me)** | yes |
| Channel availability + no-email logic | **Sasha (me)** | yes |
| Fiber spike (`lib/fiber.ts`) | Brandon | yes (not mine) |
| `/v1/hooks`, `/v1/enrich` | Brandon | yes (not mine) |
| Demo UI, streaming fix, dark mode | Brandon | yes (not mine) |

**Cursor: only implement the "Sasha (me)" rows.** For Brandon's endpoints, create **stub routes that return realistic mock JSON** matching the contract, so the demo UI and integration aren't blocked — but do not implement their real logic.

---

## 4. The contract (LOCK THIS FIRST — shared types)

Create `lib/types.ts`. Everything else is built against these shapes. These are the JSON the service returns and ColdReach/demo consume.

```ts
// lib/types.ts

export type CompanyStage = "seed" | "series_a" | "series_b" | "series_c" | "growth" | "unknown";
export type Channel = "email" | "linkedin" | "x";

// Structured version of the user's broad ask (output of prompt parsing)
export interface TargetingIntent {
  rawQuery: string;
  industry?: string[];            // e.g. ["fintech"]
  geography?: string[];           // e.g. ["New York, NY"]
  stage?: CompanyStage[];         // e.g. ["series_b"]
  companyType?: string[];         // e.g. ["YC-backed"]
  roles?: string[];               // e.g. ["founder", "CEO"]
  exclusions?: string[];          // e.g. ["crypto"]
}

export interface ProspectCompany {
  id: string;
  name: string;
  domain?: string;
  category?: string;              // industry/category
  location?: string;
  stage: CompanyStage;
  matchReason: string;            // why THIS company matched the intent
}

export interface ChannelAvailability {
  email: boolean;
  linkedin: boolean;
  x: boolean;
}

export interface ProspectPerson {
  id: string;
  name: string;
  title: string;
  company: string;
  companyId: string;
  location?: string;
  email?: string;                 // present only if found
  linkedinUrl?: string;
  xUrl?: string;
  evidence: string;               // why this person matches the goal
  matchScore: number;             // 0..100, see ranking (§6 of build)
  channels: ChannelAvailability;
}

// Brandon's endpoints return these; I only need the shape to mock them.
export interface HookCandidate {
  id: string;
  text: string;                   // e.g. "Also from Queens"
  source: string;                 // where it came from (post, bio, etc.)
  needsUserConfirmation: true;    // human-in-the-loop always
}

// ---- endpoint payloads ----

// POST /v1/narrow
export interface NarrowRequest {
  query: string;                  // the broad targeting goal
  userBackground?: string;        // optional resume/context to improve ranking
  limit?: number;                 // default 8
}
export interface NarrowResponse {
  intent: TargetingIntent;        // the parsed criteria (show the user we understood)
  companies: ProspectCompany[];
  people: ProspectPerson[];       // ranked, highest matchScore first
}

// POST /v1/hooks  (Brandon — I only stub it)
export interface HooksRequest { personId: string; }
export interface HooksResponse { hooks: HookCandidate[] }

// POST /v1/enrich (Brandon — I only stub it)
export interface EnrichRequest { personId: string; confirmedHook?: string; }
export interface EnrichResponse {
  recentContext: string[];        // recent posts/news snippets
  suggestedAngles: string[];      // angles ColdReach's drafting can use
}
```

> Validate every request body with **Zod** schemas mirroring these interfaces. Reject with 400 on mismatch.

---

## 5. Repo / file structure

```
.
├── AGENTS.md                       ← this file
├── package.json
├── .env.local                      ← secrets (never commit)
├── .env.example
├── app/
│   └── api/
│       └── v1/
│           ├── narrow/route.ts     ← SASHA: real
│           ├── hooks/route.ts      ← stub (mock JSON) for Brandon
│           └── enrich/route.ts     ← stub (mock JSON) for Brandon
├── lib/
│   ├── types.ts                    ← the contract (§4)
│   ├── auth.ts                     ← shared-secret check
│   ├── parse-intent.ts             ← OpenAI: query → TargetingIntent
│   ├── narrow.ts                   ← find + rank candidates
│   ├── rank.ts                     ← scoring logic
│   ├── apollo.ts                   ← Apollo wrapper (pattern copied from ColdReach)
│   ├── dataset/
│   │   └── yc-fintech.ts           ← curated fallback dataset (also Brandon's safety net)
│   └── coldreach.ts                ← outbound client: hand a chosen prospect to ColdReach (test-mode)
└── README.md
```

(No `app/demo/` here — that's Brandon's disposable UI. No Redis required; add a tiny in-memory or Upstash cache for Apollo only if time allows.)

---

## 6. My tasks in detail (build in this order)

### Task 1 — Project skeleton + contract (~45 min)
- `npx create-next-app@latest` — App Router, TypeScript (strict), no Tailwind needed for the service (Brandon owns UI).
- Add `lib/types.ts` exactly as §4. This is the source of truth.
- Add `zod`, `ai`, `@ai-sdk/openai`.
- `lib/auth.ts`: export `requireSecret(req)` that checks an `x-service-secret` header against `process.env.SERVICE_SHARED_SECRET`; throw/return 401 on mismatch. Call it first in every route.

### Task 2 — Curated YC-fintech dataset (~45 min) — do this EARLY
This is the demo's reliability backbone and Brandon's fallback too, so it can't wait.
- `lib/dataset/yc-fintech.ts`: a hand-built array of ~15–25 `ProspectCompany` + ~30–50 `ProspectPerson` records that satisfy realistic queries (NYC fintech, Series B, founders). Real-ish names/titles/companies are fine; include a mix where some have email and some don't (to demo the no-email path). Populate `channels` realistically (some email:false, linkedin:true).
- Export query helpers: `filterCompanies(intent)`, `filterPeople(intent)`.

### Task 3 — Parse intent (~30 min)
- `lib/parse-intent.ts`: `parseIntent(query, userBackground?) -> TargetingIntent`.
- Use the **Vercel AI SDK with OpenAI** (`generateObject` with a Zod schema mirroring `TargetingIntent`). System prompt: "Extract structured B2B prospecting criteria. Return only the fields you're confident about."
- This is a sponsor touchpoint (OpenAI powers the reasoning). Keep the model call cheap and fast.

### Task 4 — Narrow: find candidates (~1.5 hr)
- `lib/narrow.ts`: `narrow(req: NarrowRequest) -> NarrowResponse`.
  1. `parseIntent` → `TargetingIntent`.
  2. Try Apollo (`lib/apollo.ts`) for companies + people matching the intent. **Apollo is optional**: if `APOLLO_API_KEY` is missing OR the call fails OR returns < N results, fall back to the curated dataset. Never throw to the caller because a data source is down.
  3. Merge/dedupe Apollo + dataset results.
  4. Compute `channels` (ChannelAvailability) per person from whatever fields are present.
  5. Rank (Task 5), sort people by `matchScore` desc, slice to `limit` (default 8).
  6. Return `{ intent, companies, people }`.
- **Critical reliability rule:** the live demo path must work with the curated dataset alone. Apollo is an enhancement, never a dependency.

### Task 5 — Ranking (~45 min)
- `lib/rank.ts`: `scorePerson(person, intent) -> number` (0..100). Transparent, explainable scoring — judges like seeing *why*. Suggested weights:
  - role match (founder/CEO when asked): +30
  - industry match: +20
  - geography match: +15
  - stage match: +15
  - channel availability (has email): +10; (has linkedin/x): +5
  - specificity bonus (more matched criteria): up to +10
- Set `person.evidence` to a one-line human-readable reason derived from which criteria hit (e.g. "Founder at a NYC Series B fintech, email on file").

### Task 6 — `/v1/narrow` route (~30 min)
- `app/api/v1/narrow/route.ts`: `POST` → `requireSecret` → validate body with Zod → `narrow()` → `NextResponse.json(result)`.
- Support streaming if easy (Vercel AI SDK), but a fast plain JSON response is acceptable for narrow; the streaming *feel* matters more on the chat surface Brandon owns. Don't over-invest here.

### Task 7 — Stub Brandon's endpoints (~20 min) — UNBLOCKS HIM
- `app/api/v1/hooks/route.ts` and `enrich/route.ts`: real auth + Zod, but return **realistic mock JSON** matching `HooksResponse` / `EnrichResponse`. Add a `// TODO(Brandon): real impl` comment. This lets the demo UI and integration proceed before Fiber is wired.

### Task 8 — ColdReach handoff client (~30 min)
- `lib/coldreach.ts`: `sendToColdReach(prospect, hook?)` → `POST` to ColdReach's external draft endpoint with `{ contact, hooks }`. ColdReach does the drafting + (test-mode) send. We never touch Gmail. If ColdReach's endpoint isn't ready, make this a no-op that logs, so it can't break our demo.

### Task 9 — Integration + hardening (later)
- End-to-end: query → narrow → pick person → (Brandon's hooks/enrich) → handoff.
- Edge cases: empty results, vague query, Apollo down, person with no email (must still return, with `channels.email=false`).

---

## 7. Patterns to copy from ColdReach (re-type, don't import)

ColdReach already solved several of these. **Re-type the pattern into this repo** and tag each file `// PATTERN FROM coldreach/lib/<x>.ts — dedupe post-hackathon`. Do NOT import or symlink ColdReach.

- **Apollo wrapper** (`lib/apollo.ts`): client + lookup + optional cache; mock contacts when `APOLLO_API_KEY` is absent.
- **Shared types convention** (`lib/types.ts`): single source of truth for tool/persisted/UI shapes.
- **Zod validation** on every external/tool payload.
- **User identity**: key any future per-user data by the Google account id, same as ColdReach, so a later merge lines up. (Not needed for the stateless service, but if you add caching, use the same convention.)

---

## 8. Tech + env

- Next.js (App Router) + TypeScript strict.
- `ai` (Vercel AI SDK) + `@ai-sdk/openai` for intent parsing / ranking assistance. **OpenAI is the sponsor model** for this repo's reasoning (top prizes are OpenAI credits) — use it for the parse/rank step.
- `zod` for validation.
- Apollo via REST (optional). Curated dataset is the fallback.

`.env.example`:
```
SERVICE_SHARED_SECRET=        # required: header auth for all endpoints
OPENAI_API_KEY=               # required: intent parse + ranking
APOLLO_API_KEY=               # optional: falls back to curated dataset if absent
COLDREACH_DRAFT_URL=          # optional: ColdReach external draft endpoint
COLDREACH_SHARED_SECRET=      # optional: auth for the handoff
```

---

## 9. DO NOT (guardrails for the agent)

- ❌ Do NOT build the demo UI, streaming chat, or dark mode — that's Brandon.
- ❌ Do NOT integrate Fiber AI or implement real `/v1/hooks` or `/v1/enrich` logic — Brandon owns those; only stub them.
- ❌ Do NOT draft final email/DM prose in this service — return ingredients only; ColdReach drafts.
- ❌ Do NOT touch Gmail, OAuth, or store user sessions/tokens. The service is stateless.
- ❌ Do NOT import from or depend on the ColdReach repo. Copy patterns by re-typing only.
- ❌ Do NOT let a data-source failure (Apollo down, no key) throw to the caller — always fall back to the curated dataset.
- ❌ Do NOT build CRM features, multi-step sequences, or auto-scraping (out of scope).

---

## 10. Definition of done (my slice)

- [ ] `lib/types.ts` contract committed and stable.
- [ ] Shared-secret auth on all three routes.
- [ ] `POST /v1/narrow` returns ranked `people` + `companies` + parsed `intent` from a real query, in < ~3s.
- [ ] Works end-to-end on the **curated dataset alone** (Apollo off).
- [ ] At least one returned person has `email`, at least one has `email:false` (to demo the no-email branch).
- [ ] `/v1/hooks` and `/v1/enrich` return contract-valid mock JSON so Brandon/UI aren't blocked.
- [ ] `lib/coldreach.ts` handoff exists and degrades gracefully if ColdReach isn't up.

---

## 11. First message to give Cursor

> "Read AGENTS.md. Scaffold a Next.js App Router + TypeScript service. Implement `lib/types.ts` exactly as specified, then `lib/auth.ts` (shared-secret), then `lib/dataset/yc-fintech.ts` (curated), then `lib/parse-intent.ts` (Vercel AI SDK + OpenAI `generateObject`), then `lib/rank.ts`, then `lib/narrow.ts`, then `app/api/v1/narrow/route.ts`. Stub `/v1/hooks` and `/v1/enrich` with realistic mock JSON matching the contract. Do not build any UI, do not integrate Fiber, do not touch Gmail. Follow every rule in §9."

---

## Cursor Cloud specific instructions

Durable, non-obvious notes for future agents (the dependency install is handled
by the startup update script — `npm install`).

- **Stack/run:** Next.js 16 App Router + React 19 + TypeScript (strict). Standard scripts in `package.json`: `npm run dev` (port 3000), `npm run build`, `npm run lint`, `npm run typecheck` (`tsc --noEmit`).
- **Auth on every request:** all `/api/v1/*` routes require header `x-service-secret` equal to `SERVICE_SHARED_SECRET`. If `SERVICE_SHARED_SECRET` is unset, routes return 401 by design (not a bug). `.env.local` ships a dev value (`dev-secret-coldreach`); `.env.local` is git-ignored.
- **Keys are optional by design (reliability spine):** `parse-intent.ts` uses OpenAI `generateObject` only when `OPENAI_API_KEY` is set, otherwise it falls back to a deterministic keyword heuristic. `narrow` uses Apollo only when `APOLLO_API_KEY` is set and returns enough results, otherwise the curated dataset in `lib/dataset/yc-fintech.ts`. The demo path is meant to work with **no external keys**, so do not treat missing keys as a blocker.
- **Curated dataset is the demo backbone:** it intentionally includes people with `email:false` (LinkedIn/X only) to exercise the no-email channel branch. Keep that mix if you edit it.
- **Scope guardrails still apply:** `/v1/hooks` and `/v1/enrich` are deliberately stubs returning mock JSON (Brandon owns real impl + Fiber). Do not implement them, build UI, or touch Gmail here (see §9).
- **Quick smoke test:**
  `curl -s localhost:3000/api/v1/narrow -H 'content-type: application/json' -H 'x-service-secret: dev-secret-coldreach' -d '{"query":"founders at YC fintechs in NYC, Series B","limit":5}'`
