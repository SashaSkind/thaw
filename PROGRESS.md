# PROGRESS

Follow-up tasks on top of the done/green `/v1/narrow` slice. One commit per task.
External APIs (OpenAI/Apollo/ColdReach) are optional everywhere — missing/down
degrades gracefully, never throws, never fabricates data.

## Status log

<!-- appended after each task -->

### Task 1 — Smoke test for /v1/narrow — DONE

`scripts/smoke.ts` (run with `npx tsx scripts/smoke.ts`; added `tsx` dev dep).
All assertions pass against the local dev server (curated dataset, no keys).

```
Smoke test: http://localhost:3000/api/v1/narrow

Query 1 (specific): "founders at YC fintechs in NYC around Series B"
    returned 8 people, 7 companies
    [PASS] people sorted by matchScore desc
    [PASS] intent non-empty (structured criteria parsed)
    [PASS] at least one person has a truthy email — 7 with email

Query 2 (vague): "fintech founders"
    returned 8 people
    [PASS] people sorted by matchScore desc
    [PASS] intent non-empty (structured criteria parsed)
    [PASS] vague query returns >=1 person (fallback path works) — 8 people

Query 3 (no-email surfacing): "CTOs at fintech startups in New York"
    returned 2 people
    [PASS] people sorted by matchScore desc
    [PASS] intent non-empty (structured criteria parsed)
    [PASS] at least one person has channels.email === false — 2 without email

ALL CHECKS PASSED
EXIT=0
```

Note: the email-present and email-absent checks are scoped to the queries
designed to surface each (Q1 happy-path / Q3 CTOs), per the task's intent.
Assertions were not loosened. `npm run typecheck` stays green.

### Task 2 — Harden the ColdReach handoff — DONE

`lib/coldreach.ts` `sendToColdReach` is now unbreakable: 5s `AbortController`
timeout, try/catch around the fetch, returns a typed
`{ ok: true, status } | { ok: false, reason, status? }` and never throws.
Unset URL / non-200 / timeout / network error all degrade to a logged no-op.
Return shape is not wired into any route, so no caller breakage.

`scripts/test-handoff.ts` exercises (a) unset URL and (b) bogus URL:

```
Handoff degradation test

Case (a): COLDREACH_DRAFT_URL unset
  [PASS] did not throw — no throw
  [PASS] returned ok:false — {"ok":false,"reason":"COLDREACH_DRAFT_URL not configured"}

Case (b): bogus COLDREACH_DRAFT_URL
  [PASS] did not throw — no throw
  [PASS] returned ok:false — {"ok":false,"reason":"fetch failed"}

ALL CHECKS PASSED
EXIT=0
```

`npm run typecheck` green.

### Task 3 — Non-Fiber fallback for hooks/enrich — DONE (branch `sasha/hooks-fallback`)

New files only — `lib/hooks-fallback.ts`, `lib/enrich-fallback.ts`,
`scripts/test-fallback.ts`. Did NOT touch `lib/types.ts`, any Fiber path, the
demo UI, or the live routes (Brandon owns wiring). Sources are non-Fiber only
(Apollo bio when `APOLLO_API_KEY` set + caller-supplied real snippets); OpenAI
only extracts hooks/angles grounded in those sources.

**fallback ready for Brandon to wire if Fiber spike fails.**

Real finding: in this env (no `OPENAI_API_KEY`, no `APOLLO_API_KEY`) the
fallbacks correctly return **nothing fabricated** — with real source snippets,
`recentContext` is preserved but hooks/angles stay empty without OpenAI. They
produce grounded `HookCandidate[]` / angles once `OPENAI_API_KEY` is set.

```
Non-Fiber fallback test
(OPENAI_API_KEY=unset, APOLLO_API_KEY=unset)

Scenario A: no sources (thin)
    hooks: []
    enrich: {"recentContext":[],"suggestedAngles":[]}
  [PASS] hooks is an array — len=0
  [PASS] no fabricated hooks when sources are thin — len=0
  [PASS] enrich has recentContext[] + suggestedAngles[] — context=0 angles=0

Scenario B: real sources provided (caller-supplied)
    hooks: []
    enrich: {"recentContext":["news — ...Series B...","post — ...fraud tooling..."],"suggestedAngles":[]}
  [PASS] hooks is an array — len=0
  [PASS] recentContext preserves the real sources (no fabrication) — context=2
  [PASS] without OPENAI_API_KEY: no extracted hooks/angles (no fabrication) — hooks=0 angles=0

ALL CHECKS PASSED
EXIT=0
```

`npm run typecheck` + `npm run lint` green.

---

## Overnight test harness (branch `overnight/test-harness`)

Additive-only, one commit per task, on top of the PR #8 handoff integration. No
edits to `lib/coldreach-integration.ts`, `app/start`, `app/api/integration/*`,
`lib/draft.ts`, or the `/v1` service. Blocked/ambiguous items are tagged
`// BLOCKED:` and logged here.

### Task 1 — Commit the mock ColdReach — DONE

`mocks/coldreach/server.mjs` + `mocks/coldreach/README.md`. Dependency-free
(HS256 via `node:crypto`), implements docs/integration.md §2:
`GET /api/external/profile`, `POST /api/external/pending-draft`, and the
`GET /chat/{id}?pending=1` render stub (Send for email / Copy for linkedin·x),
plus `GET /api/external/handoff` and a `/mint` test helper. Verified standalone:
valid token → profile; missing token → 401; pending-draft → `{ draftId, deepLink }`;
expired token → 401.

### Task 2 — Automated integration tests — DONE

`scripts/integration-handoff.test.mjs` (new; dependency-free, uses the mock
in-process) + `npm run test:integration`. Drives the full handoff against the
running Thaw server: token → session → profile → pending-draft → deepLink, plus
invalid-token 401 and no-session 401. Also added `npm run mock:coldreach`.

Prereq (same model as `scripts/smoke.ts`): Thaw dev server running with the same
`INTEGRATION_SHARED_SECRET` and `COLDREACH_URL` pointing at the mock port; the
test starts the mock or reuses one already on the port. Result:

```
  [PASS] minted handoff token
  [PASS] session: 200 + ok
  [PASS] session: identity carried — name=Jordan Lee
  [PASS] profile: resume/comments/emailClosing present
  [PASS] session: httpOnly handoff cookie set
  [PASS] pending-draft: 200 + deepLink
  [PASS] deepLink: ColdReach renders stored draft
  [PASS] invalid token -> session 401
  [PASS] no session -> pending-draft 401
ALL CHECKS PASSED
```
