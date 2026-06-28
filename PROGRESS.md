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

### Task 3 — Failure UX (new components/states only) — DONE

`app/handoff-status/HandoffStatus.tsx` (client) + `app/handoff-status/page.tsx`
(preview/target route). Three states with a retry action:
`coldreach-unreachable`, `token-expired` (states the 15-min TTL), and a generic
`error`. Reuses existing CSS classes; no globals.css change.

NOTE (per constraints): these are ADDITIVE, standalone surfaces and are **not
wired into the working /start flow** — wiring would require editing `app/start`,
which was explicitly out of scope for this branch. They are ready to wire (e.g.
the flow can redirect to `/handoff-status?state=token-expired`). Verified all
three render in the browser at `/handoff-status?state=...`.

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

### Step 1 — Base: #7 data layer + #8 handoff + #10 tests — DONE

Merged `overnight/test-harness` (brings #8 handoff + #10 mock/tests/failure-UX)
and #7 (`coldreach-intel-brandon-slice-2330`) onto `integration/final`. Conflicts
resolved: `.env.example` (kept the integration block; added `COLDREACH_URL` /
`INTEGRATION_SHARED_SECRET`), `app/demo/components/DraftView.tsx` (kept #8's
canonical Send→`postPendingDraft` version; dropped #7's older `composeDraft`),
`PROGRESS.md` (kept both sections). Applied Gate 1 fallback chain in
`lib/narrow.ts`: live Fiber → real cohort → curated `yc-fintech` floor (ranked,
deduped); all results cached for hooks/enrich. `/v1` stays JSON-only/stateless/no
Gmail/no send. `npm run typecheck` green.

### Step 2 — Fold in ONLY #9's wanted pieces — DONE

Brought from #9: streaming chat UX (`app/demo/chat-workflow.tsx`,
`app/api/demo/chat/route.ts`, `app/chat/page.tsx`), dark mode/theme
(`app/globals.css`, `app/providers.tsx`), landing/redirect (`app/page.tsx`,
`app/demo/page.tsx` → `/chat`), additive `ProspectPerson.emailStatus` /
`emailSource` (`lib/types.ts`), and deps `@assistant-ui/react` +
`@assistant-ui/react-ai-sdk`. **Rewired** `chat-workflow.tsx`: dropped its
`draft-state` import and local `/email` navigation; the draft step now renders
#8's `DraftView` (composes finished text via `lib/draft.ts`, Sends via
`postPendingDraft`), reads the handoff `sender` from session storage.
NOT brought: `app/api/email/send`, `app/email/[draftId]`,
`app/demo/drafts/[draftId]`, `app/settings`, `app/demo/draft-state.ts`, and #9's
`lib/narrow|context|rank|dataset|apollo` changes. typecheck + lint green.

### Step 3 — Delete #9's competing send path — DONE (none present)

Because Step 2 was selective, #9's send route + local pages were never brought.
Verified absent on disk: `app/api/email/send/route.ts`, `app/email/`,
`app/demo/drafts/`, `app/settings/page.tsx`, `app/demo/draft-state.ts`.
`git grep` for `COLDREACH_SEND_URL`, `api/email/send`, `draft-state`, `/email/`,
`/demo/drafts`, `/settings` in tracked source → **zero references**.
`COLDREACH_SEND_URL` is not present in any env file (only `COLDREACH_URL`).

### Step 4 — Single Option-C send path — DONE

Exactly one send path in the repo: `DraftView` →
`POST /api/integration/pending-draft` → `postPendingDraft()`
(`lib/coldreach-integration.ts`) → `{ deepLink }` → redirect into ColdReach,
which sends from the user's own session. No route forwards email anywhere; no
Thaw code touches `gmail.send`/OAuth/tokens (verified by grep).

### Step 5 — Reconcile `lib/narrow.ts` + `lib/context.ts` — DONE

Decision applied: the **#7 data-layer version wins as the base**; #9's chat UX
rides on top (it consumes `/v1/narrow|hooks|enrich`, not its own retrieval).
#9's `lib/narrow.ts`/`lib/context.ts`/`lib/rank.ts`/`lib/dataset`/`lib/apollo`
changes were NOT brought. `context.ts` resolves people via `people-cache`
(populated by `narrow` for both the cohort and the curated floor) + the static
cohort; hooks/enrich return grounded results or fall back to the human-confirmed
custom hook — never fabricated.
**NOTE for Brandon:** narrow.ts/context.ts reconciled toward #7's data layer;
#9's chat rides on top, and the curated `yc-fintech` floor was re-added under
#7's cohort (Gate 1). Please confirm.

### Step 6 — Definition of done: full Option C against the mock — DONE

- ✅ `npm run typecheck`, `npm run lint`, `npm run build` (routes: `/`, `/chat`,
  `/start`, `/handoff-status`, `/api/integration/*`, `/api/demo/{chat,stream}`,
  `/api/v1/*`; NO `/api/email/send`).
- ✅ `npm run test:integration` — token → session → profile → pending-draft →
  deepLink, plus invalid-token 401 and no-session 401 (9/9).
- ✅ End-to-end browser (chat UX): ColdReach handoff → `/start` → `/chat` →
  targeting → prospect (Maya Chen, email) → find warm lead → custom hook →
  finished draft ending in the sender closing `Warmly,/Jordan Lee/GTM Advisor`
  → "Send via ColdReach" → ColdReach review → "Sent from your Gmail (demo)".
- ✅ No-email path: a no-email prospect yields a channel-aware **DM** draft (no
  Email channel, no Subject, button "Save to ColdReach →"); its deepLink renders
  ColdReach's **Copy** button (not Send). Direct `/chat` visit (no handoff) →
  pending-draft 401 with a clear message (guardrail working).
- Fix applied during DoD: `narrow` now guarantees ≥1 email prospect stays in the
  visible result (live Fiber + no-email cohort were outranking the curated floor).

Guardrails verified: exactly ONE send path (Option C); no `gmail.send`/OAuth/token
storage; no `COLDREACH_SEND_URL`; `/v1` routes unchanged; `lib/types.ts` additive
only.

### Persona sweep — research pipeline integrity — RUN (branch `test/persona-sweep`)

Added `tests/personas.ts` and `tests/flow-runner.ts` for a headless Thaw sweep of
`narrow -> hooks -> enrich` only. No drafting, ColdReach handoff, Gmail, or UI
assertions are included.

Run command:

```bash
node --env-file-if-exists=.env.local --import tsx tests/flow-runner.ts
```

Environment notes:
- Dev server: `npm run dev` on `http://localhost:3000`, same instance for all calls.
- Auth mode: open (`SERVICE_SHARED_SECRET` empty in the runner environment).
- Live data: Fiber-backed search/social was available for this run; several personas
  returned live Fiber search/context instead of purely curated-floor data.

Result: **6/8 passed**, exit code `1` because the harness correctly exits non-zero
when any persona branch fails.

```text
Persona sweep: http://localhost:3000/api/v1 (auth=open)

[PASS] Student targeting a YC internship mentor — no-email-student
  narrow=8 people source=live-fiber-search
  selected=Henrique Dubugras at Brex (p_henrique_dubugras, no-email/linkedin/no-x, score=100)
  hooks=5 primary=fiber
  enrich=context:4 angles:3 primary=fiber

[PASS] GTM engineer targeting a customer company — email-happy-path
  narrow=8 people source=live-fiber-search
  selected=Maya Chen at Northgate Pay (p_north_1, email/linkedin/x, score=100)
  hooks=5 primary=fiber
  enrich=context:4 angles:3 primary=fiber

[PASS] Founder targeting an investor with rich social context — rich-social-founder-investor
  narrow=8 people source=live-fiber-search
  selected=Immad Akhund at Mercury (p_immad_akhund, no-email/no-linkedin/x, score=100)
  hooks=4 primary=fiber
  enrich=context:4 angles:3 primary=fiber

[PASS] Career switcher with sparse context — sparse-career-switcher
  narrow=8 people source=live-fiber-search
  selected=Henrique Dubugras at Brex (p_henrique_dubugras, no-email/linkedin/no-x, score=97)
  hooks=5 primary=fiber
  enrich=context:4 angles:3 primary=fiber

[PASS] Deliberately vague targeting prompt — vague-fallback
  narrow=8 people source=live-fiber-search
  selected=Henrique Dubugras at Brex (p_henrique_dubugras, no-email/linkedin/no-x, score=97)
  hooks=5 primary=fiber
  enrich=context:4 angles:3 primary=fiber

[FAIL] Target expected to have no LinkedIn or X — empty-social
  narrow=8 people source=live-fiber-search
  selected=Henrique Dubugras at Brex (p_henrique_dubugras, no-email/linkedin/no-x, score=97)
  hooks=5 primary=fiber
  enrich=context:4 angles:3 primary=fiber
  failure: expected at least one surfaced person with no LinkedIn and no X

[FAIL] Impossible zero-candidate query — zero-candidates
  narrow=8 people source=live-fiber-search
  failure: expected clean empty people[] but got 8

[PASS] Curated floor with email-mix guarantee — curated-floor-email-mix
  narrow=8 people source=live-fiber-search
  selected=Henrique Dubugras at Brex (p_henrique_dubugras, no-email/linkedin/no-x, score=97)
  hooks=5 primary=fiber
  enrich=context:4 angles:3 primary=fiber

Persona sweep complete: 6/8 passed
Failures:
- Target expected to have no LinkedIn or X (empty-social)
  - expected at least one surfaced person with no LinkedIn and no X
- Impossible zero-candidate query (zero-candidates)
  - expected clean empty people[] but got 8
```

Failure notes:
1. `empty-social`: current `/v1/narrow` did not surface any prospect with both
   `channels.linkedin === false` and `channels.x === false`; it fell back to
   Fiber/cohort results instead. This is a branch-coverage gap, not a test crash.
2. `zero-candidates`: current `/v1/narrow` always degrades to fallback people for
   the impossible query, so the API does not currently expose a clean empty
   `people[]` result for this branch.
3. `curated-floor-email-mix`: passed the non-empty + email-visible assertion, but
   this run still included live Fiber search results because live keys were
   available. Re-run with Fiber disabled to observe a pure curated-floor path.
