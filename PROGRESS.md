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

## Integration branch (`integration/final`) — reconcile PRs #7 + #8 + #9 + #10

Cut from `main`. One commit per step. Target = v2 PRD architecture: stateless
`/v1`, Fiber→fallback data layer, exactly ONE send path (Option C handoff), Thaw
never sends.

### Gate 1 — Verify #7's fallback — RESOLVED

Inspected #7's `cohortProspects()` / `REAL_PEOPLE` (`lib/mock-data.ts`):

1. **Static, no live calls?** YES — hardcoded in-repo array, returned
   synchronously; no Fiber/Apollo at request time.
2. **Preserves email mix (≥1 with email AND ≥1 without)?** NO — all 4 cohort
   people are no-email (`channels.email=false`), and #7's live Fiber results also
   set `email:false`. The email-channel demo would have no eligible prospect.

**Decision:** Per Gate 1, since the cohort loses the email mix, KEEP the synthetic
`lib/dataset/yc-fintech.ts` curated dataset as the always-present static floor
(it has the email mix and cannot fail). Fallback chain in `narrow`:
**live Fiber → #7 real cohort → curated yc-fintech dataset (floor)**, merged +
deduped + ranked. The curated floor is always included so the on-stage email and
no-email paths both work, per PRD ("use the curated dataset for the live demo
path even if Fiber is wired in"). NOTE for Brandon: this re-introduces the
synthetic dataset that #7 intentionally dropped — logged here, not silent.
