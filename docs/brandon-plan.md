# ColdReach Intelligence Service — Build Spec (Brandon's part)

> Sasha owns the service spine + `/v1/narrow`. Brandon owns the **risky data
> dependency (Fiber)**, the **hooks/enrich endpoints**, and the **entire demo
> UI** (streaming + dark mode).

---

## 0. TL;DR

We're building a **stateless intelligence service** in a **new, separate repo**
for a 24-hour YC growth hackathon. It adds a prospect-discovery layer on top of
**ColdReach** (`trycoldreach.app`). The service turns a broad targeting goal into
ranked specific people; the user then finds a **human hook** on that person's
LinkedIn/X, and ColdReach drafts the message.

**Brandon's slice is the risk + the surface:**

1. The **Fiber AI spike** (`lib/fiber.ts`) — the go/no-go for the whole project.
2. `/v1/hooks` and `/v1/enrich` — the endpoints that consume Fiber.
3. The **demo UI** — the disposable thin client judges watch, plus the
   **streaming fix** and **dark mode**.

**#1 risk:** getting live LinkedIn/X posts on stage is the flakiest thing in
outreach. So spike it FIRST, and always have a non-Fiber fallback (news + Apollo
+ Sasha's curated dataset). The demo must work even if Fiber's social data is
thin.

---

## 1. Project overview

### What ColdReach is (existing product — do NOT rebuild)

A one-person-at-a-time cold-email tool. User chats about who to reach → agent
finds one verified contact via Apollo → drafts three tones (casual /
professional / efficient) → user sends from their own Gmail. Stack: Next.js 16
App Router, React 19, TypeScript, Vercel AI SDK, Upstash Redis, Apollo, Gmail
send.

### The gap we fill

ColdReach assumes the user already knows _who_ to email. We add the step before:
broad goal → exact people → a **real human hook** (same hometown, shared school,
a recent post) → handoff to ColdReach's drafting.

### Hackathon constraints (non-negotiable)

- **Separate codebase** from ColdReach. Runtime integration only; no importing
  ColdReach's repo. (Re-typing patterns is fine.)
- Open-source on GitHub for the duration.
- Judged on: usefulness (GTM), technical complexity, coolness. **Submission is a
  3-minute demo video.** The UI is what judges see, so it has to feel polished
  and live.
- Primary track: **Revenue on Autopilot (Cold Outbound & Pipeline Automation).**

---

## 2. Architecture

**Core principle: the service researches; ColdReach acts.**

```
  ColdReach (real caller)        Demo UI (disposable — Brandon builds this)
            \                      /
             \                    /     both call the SAME endpoints
              v                  v
        ┌───────────────────────────────────────┐
        │  INTELLIGENCE SERVICE  (this new repo) │
        │  stateless · no Gmail · no user state  │
        │   POST /v1/narrow   ← Sasha owns        │
        │   POST /v1/hooks    ← BRANDON owns      │
        │   POST /v1/enrich   ← BRANDON owns      │
        │   lib/  narrow · hooks · enrich · fiber │
        └───────────────────────────────────────┘
              |                         |
         Apollo + curated          Fiber AI ← Brandon owns
         dataset (Sasha)           OpenAI (reasoning, shared)
                       |
                 returns STRUCTURED JSON
                 { candidates, hooks, angles }
                       |
                       v
        ColdReach owns: the user, 3-tone drafting, Gmail send
```

### Hard rules for this repo

- Service is **stateless**: no user session, no user data. (Short-lived cache OK.)
- Service **never touches Gmail** and **never writes the final message prose**.
  It returns _ingredients_ (hooks, angles, context). ColdReach drafts and sends.
- Endpoints are **versioned** (`/v1/...`) and **thin**: validate → call a `lib`
  function → return JSON.
- Auth = single **shared-secret** header on every endpoint.
- **Hooks are human-in-the-loop.** The service _proposes_ candidates; the user
  _confirms_ the real one. Never auto-inject an unconfirmed hook into a draft.

---

## 3. The two-person split

| Area                                          | Owner       |
| --------------------------------------------- | ----------- |
| Service skeleton, routing, auth, shared types | Sasha       |
| `/v1/narrow` (broad goal → ranked people)     | Sasha       |
| Curated YC-fintech dataset + ranking          | Sasha       |
| **Fiber spike (`lib/fiber.ts`)**              | **Brandon** |
| **`/v1/hooks`, `/v1/enrich`**                 | **Brandon** |
| **Demo UI, streaming fix, dark mode**         | **Brandon** |

`lib/types.ts` and `/v1/narrow` are Sasha's — treat the types as **read-only
contract** and call `narrow` as an existing endpoint (mock its response if Sasha
hasn't pushed yet).

---

## 4. The contract (READ-ONLY — Sasha owns `lib/types.ts`)

See [`lib/types.ts`](../lib/types.ts) — `Channel`, `ChannelAvailability`,
`ProspectPerson`, `HookCandidate`, `HooksRequest`/`HooksResponse`,
`EnrichRequest`/`EnrichResponse`, `NarrowResponse`.

---

## 6. Tasks (build order)

- **Task 0 — Fiber spike** (`lib/fiber.ts` + `scripts/fiber-spike.ts`): can we
  reliably get a real person's recent LinkedIn/X posts? Decision gate: ✅ real
  social → live hook is the demo closer; ⚠️ thin/flaky → pivot to news + Apollo +
  curated fallback. **Tell the team the result.**
- **Task 1 — `/v1/hooks`**: `findHooks(personId)` → 3–5 grounded `HookCandidate[]`,
  all `needsUserConfirmation: true`, never fabricated.
- **Task 2 — `/v1/enrich`**: `enrich(personId, confirmedHook?)` → `recentContext`
  + `suggestedAngles` (ingredients, not prose).
- **Task 3 — Demo UI + streaming**: targeting → results → detail → hook capture →
  draft. Narrated loading states, **no blank assistant bubbles**.
- **Task 4 — Dark mode**: intentional dark theme (not inverted) via theme tokens.
- **Task 5 — Demo mode + safety**: full flow with zero risk of a real send.

---

## 9. DO NOT (guardrails)

- ❌ Do NOT redefine `lib/types.ts` or reimplement `/v1/narrow` (Sasha's).
- ❌ Do NOT draft final email/DM prose in the service — return angles/ingredients.
- ❌ Do NOT auto-inject an unconfirmed hook into any draft (anti-hallucination).
- ❌ Do NOT make the demo depend on live Fiber social — always have a fallback.
- ❌ Do NOT touch Gmail/OAuth or store user sessions/tokens. Stateless service.
- ❌ Do NOT import from or depend on the ColdReach repo. Re-type patterns only.
- ❌ Do NOT over-invest in "fix streaming" — ship the flow first.
- ❌ Do NOT build CRM/sequences/auto-scraping/auto-sending (out of scope).

---

## 10. Definition of done (Brandon's slice)

- [x] Fiber spike resolved (decision: fallback branch when no `FIBER_API_KEY`).
- [x] `POST /v1/hooks` returns grounded `HookCandidate[]`, all confirmation-gated.
- [x] `POST /v1/enrich` returns `recentContext` + `suggestedAngles` (ingredients).
- [x] Demo UI runs targeting → results → detail → hook capture → draft.
- [x] Streaming shows narrated loading states and no blank assistant bubbles.
- [x] Intentional dark mode (not inverted), clean and readable.
- [x] Demo mode runs end-to-end with zero risk of a real outbound send.
- [x] Whole flow works even if Fiber social returns nothing (fallback proven).
