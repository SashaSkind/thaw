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
