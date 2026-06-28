# ColdReach UI Build Prompt — Thaw as Headless Backend

> **Audience:** Cursor agent working in the **ColdReach** repo.
> **Source of truth:** shapes and behavior copied from the Thaw repo (`lib/types.ts`, `app/api/v1/*`, `app/demo/*`, `lib/auth.ts`, `lib/people-cache.ts`).
> **Do not** reimplement Thaw's research logic in ColdReach — call Thaw's API server-side only.

---

## A. Context

ColdReach keeps **all UI**, login, onboarding, user profile (resume, comments, email closing), drafting, and Gmail send.

**Thaw** is a headless research backend. ColdReach calls it **server-side** for three steps:

1. **Narrow** — broad targeting query → ranked people
2. **Hooks** — person → grounded hook candidates (human must confirm one)
3. **Enrich** — person + confirmed hook → recent context + suggested angles for drafting

The user **never leaves ColdReach**. There is **no** redirect to Thaw, no `/start`, no JWT handoff, no `pending-draft`, no `deepLink` round-trip. That plumbing (`docs/integration.md` in Thaw) is **intentionally skipped** for this integration model.

Thaw's `app/demo/` folder is a **UI spec** for the same flow — rebuild it in ColdReach's design system, not Thaw's CSS.

---

## B. The `/api/v1` contract

Thaw exposes Next.js route handlers at these paths (note the `/api` prefix):

| Thaw endpoint | Method |
|---|---|
| `${THAW_URL}/api/v1/narrow` | `POST` |
| `${THAW_URL}/api/v1/hooks` | `POST` |
| `${THAW_URL}/api/v1/enrich` | `POST` |

### Auth header

All three endpoints use shared-secret auth (`lib/auth.ts`):

```
x-service-secret: <SERVICE_SHARED_SECRET>
```

- Header name: **`x-service-secret`** (lowercase).
- When Thaw's `SERVICE_SHARED_SECRET` env var is **unset**, Thaw runs in **open demo mode** and skips auth.
- When set, the header value must match **exactly**.
- ColdReach must store the same secret value and send it on every proxy request.
- **Never** expose this secret to the browser.

### Error shapes (from Thaw route handlers)

**`/api/v1/narrow`** (`app/api/v1/narrow/route.ts`):

| Status | Body |
|---|---|
| 400 | `{ "error": "Invalid JSON body." }` |
| 400 | `{ "error": "Invalid request body.", "details": … }` (Zod flatten) |
| 401 | `{ "error": "Unauthorized: …" }` |
| 500 | `{ "error": "Internal error while narrowing prospects." }` |

**`/api/v1/hooks`** and **`/api/v1/enrich`** (`lib/http.ts`):

| Status | Body |
|---|---|
| 400 | `{ "error": "bad_request", "reason": "…" }` |
| 401 | `{ "error": "unauthorized", "reason": "…" }` |

---

### Shared types (verbatim from `lib/types.ts`)

```ts
export type CompanyStage =
  | "seed"
  | "series_a"
  | "series_b"
  | "series_c"
  | "growth"
  | "unknown";

export type Channel = "email" | "linkedin" | "x";

export interface TargetingIntent {
  rawQuery: string;
  industry?: string[];
  geography?: string[];
  stage?: CompanyStage[];
  companyType?: string[];
  roles?: string[];
  exclusions?: string[];
}

export interface ProspectCompany {
  id: string;
  name: string;
  domain?: string;
  category?: string;
  location?: string;
  stage: CompanyStage;
  matchReason: string;
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
  email?: string; // present only if found
  emailStatus?: "verified" | "guessed" | "unavailable";
  emailSource?: "fiber" | "apollo";
  linkedinUrl?: string;
  xUrl?: string;
  evidence: string;
  matchScore: number; // 0..100
  channels: ChannelAvailability;
}

export interface HookCandidate {
  id: string;
  text: string;
  source: string;
  needsUserConfirmation: true;
}
```

---

### `POST /api/v1/narrow`

**Request** (Zod-validated in `app/api/v1/narrow/route.ts`):

```ts
{
  query: string;           // required, min length 1
  userBackground?: string; // optional resume/context to improve ranking
  limit?: number;          // optional, int, positive, max 50; default 8 when omitted (lib/narrow.ts)
}
```

**Response** (`NarrowResponse`):

```ts
{
  intent: TargetingIntent;
  companies: ProspectCompany[];
  people: ProspectPerson[]; // ranked, highest matchScore first
}
```

---

### `POST /api/v1/hooks`

**Request** (Zod-validated in `app/api/v1/hooks/route.ts`):

```ts
{
  personId: string; // required, min length 1 — use ProspectPerson.id from narrow
}
```

**Response** (`HooksResponse` plus fields added by the route handler):

```ts
{
  hooks: HookCandidate[];
  primarySource: string; // runtime values from lib/hooks.ts: "fiber" | "fallback"
  notes: string[];
}
```

`HooksResponse` in `lib/types.ts` only documents `hooks`; the live route **always** also returns `primarySource` and `notes`.

---

### `POST /api/v1/enrich`

**Request** (Zod-validated in `app/api/v1/enrich/route.ts`):

```ts
{
  personId: string;        // required, min length 1
  confirmedHook?: string;  // optional but should be set after user confirms a hook
}
```

**Response** (`EnrichResponse` plus field added by the route handler):

```ts
{
  recentContext: string[];
  suggestedAngles: string[];
  primarySource: string; // runtime values from lib/enrich.ts: "fiber" | "fallback"
}
```

Returns **ingredients only** — never finished email prose.

---

## C. UI components to build in ColdReach's design system

Rebuild Thaw's demo flow (`app/demo/`) in ColdReach styling. Reference implementations:

| Thaw file | Step | Endpoint |
|---|---|---|
| `app/demo/components/TargetingPrompt.tsx` | User enters targeting query | triggers narrow |
| `app/demo/components/ProspectResults.tsx` | Ranked prospect list | data from narrow |
| `app/demo/components/PersonDetail.tsx` | Person detail + "Find hooks" | data from narrow (no extra call) |
| `app/demo/components/HookCapture.tsx` | Hook picker | data from hooks |
| `app/demo/chat-workflow.tsx` | Chat-first variant of the same flow | all three endpoints |

ColdReach does **not** port Thaw's `DraftView.tsx` handoff (`postPendingDraft` / `deepLink`). Wire into ColdReach's **existing** draft + `gmail.send` instead.

### 1. Prospect list

**Data:** `NarrowResponse.people` (and optionally show parsed `intent` / `companies`).

**Render per card/row** (from `ProspectResults.tsx` + `chat-workflow.tsx` `kind === "prospects"`):

- `name`
- `title`, `company`, `location` (join with ` · ` or ` - ` — match CR style)
- `evidence` (why this person matched)
- `matchScore` with a "match" label
- Channel badges from `channels`: **email**, **LinkedIn** (`channels.linkedin`), **X** (`channels.x`) — active/inactive styling when boolean is true/false
- Email availability: `channels.email`; if `email` is present, show it on the detail step; `emailStatus` / `emailSource` are available for richer indicators if desired

**Interaction:** clicking a card selects that `ProspectPerson` and advances to person detail.

**Copy hint** (from chat workflow): *"Here are the strongest coffee-chat options. Pick one and I will look for a warm lead."*

Thaw's chat workflow passes `limit: 10` on narrow; default in Thaw is `8` when omitted.

### 2. Person detail

**Data:** the selected `ProspectPerson` object already returned by narrow — **no additional Thaw call** on this step.

**Render** (from `PersonDetail.tsx` + chat `kind === "person"`):

- `name`
- `title`, `company`, `location`
- `linkedinUrl` → external link (if present)
- `xUrl` → external link (if present)
- `email` (if present)
- `evidence`
- **"Find hook"** / **"Find warm lead"** button → calls hooks with `personId: person.id`

Optional: Thaw's `PersonDetail.tsx` shows static "Research prompts" bullet list — UI chrome only, not from API. Include or omit per CR product taste.

**Copy hint:** *"Good pick. I can now look for warm-lead context from recent posts, public profiles, and fallback signals."*

### 3. Hook picker

**Data:** hooks response — `hooks`, `primarySource`, optionally `notes`.

**Render** (from `HookCapture.tsx` + chat `kind === "hooks"`):

- Instruction: user **must confirm exactly one** hook before drafting (anti-hallucination; every `HookCandidate` has `needsUserConfirmation: true`)
- Radio-style list of candidates:
  - `hook.text`
  - `hook.source` (display as `source: …`)
- Free-text field: "Or type your own warm hook" — if user types their own, that string becomes the confirmed hook
- Show `primarySource` (e.g. `context source: fiber`)
- If `hooks.length === 0`, show empty state: context was thin; user must add their own hook
- Confirm button (disabled until a candidate is selected or custom text is non-empty)

**On confirm:** call enrich with `{ personId, confirmedHook: <confirmed string> }`.

**Copy hint:** *"Confirm the hook you actually want to use. I will not put anything into a draft until you choose it."*

### 4. Wire into ColdReach's existing draft step

**Data:** enrich response — `recentContext`, `suggestedAngles`, `primarySource`.

**On hook confirm:**

1. `POST` enrich with `personId` + `confirmedHook`
2. Feed into CR's **existing** three-tone drafting:
   - `recentContext[]`
   - `suggestedAngles[]`
   - Logged-in user's profile already in CR: resume text, comments, email closing
   - Selected `ProspectPerson` contact fields (`name`, `title`, `company`, `email`, `linkedinUrl`, `xUrl`, `channels`)
3. Send via CR's existing **`gmail.send`** path

Thaw never drafts finished prose for this integration model and never sends email.

**Channel selection:** use `ProspectPerson.channels` — if `channels.email` is true, email draft (subject + body); else LinkedIn/X DM body. Thaw type `Channel = "email" | "linkedin" | "x"`.

---

## D. Server proxy routes to build in ColdReach

Call Thaw from **ColdReach's server only**. The browser calls CR routes; CR proxies to Thaw.

Suggested CR routes (names are recommendations — adjust to CR conventions):

| CR route | Proxies to |
|---|---|
| `POST /api/thaw/narrow` | `POST ${THAW_URL}/api/v1/narrow` |
| `POST /api/thaw/hooks` | `POST ${THAW_URL}/api/v1/hooks` |
| `POST /api/thaw/enrich` | `POST ${THAW_URL}/api/v1/enrich` |

**Every proxy request must include:**

```
Content-Type: application/json
x-service-secret: ${SERVICE_SHARED_SECRET}
```

Forward the request JSON body as-is (narrow/hooks/enrich shapes above). Return Thaw's JSON response and status code to the CR frontend (or map errors to CR-friendly messages).

**Narrow proxy:** attach `userBackground` from the logged-in user's resume/profile text when available.

CR frontend **must not** call `${THAW_URL}` directly.

---

## E. ColdReach env additions

```bash
THAW_URL=https://…           # base URL of deployed Thaw service (no trailing slash)
SERVICE_SHARED_SECRET=…      # same value as Thaw's SERVICE_SHARED_SECRET
```

Local dev example:

```bash
THAW_URL=http://localhost:3000
SERVICE_SHARED_SECRET=dev-integration-secret   # only if Thaw also has it set
```

Thaw's `INTEGRATION_SHARED_SECRET` and `COLDREACH_URL` env vars are for the **redirect handoff flow** (`docs/integration.md`). They are **not required** for this headless UI integration.

---

## F. Critical gotchas

1. **`personId` is `ProspectPerson.id`** — hooks and enrich key on `personId`, **not** name/company. Always pass the `id` from the narrow response.

2. **30-minute same-instance cache** — Thaw caches person identifiers in-process after narrow (`lib/people-cache.ts`, `TTL_MS = 30 * 60 * 1000`). Hooks/enrich resolve LinkedIn/X handles from this cache to fetch real Fiber posts. Call hooks/enrich **soon after** narrow, against the **same Thaw instance**. Multi-instance Thaw deploys need a shared store (Redis) — // TBD: confirm in Thaw for production topology.

3. **Pass `userBackground` on narrow** — optional `userBackground` string (logged-in user's resume text) improves ranking.

4. **Never auto-inject an unconfirmed hook** — user must explicitly select a `HookCandidate` or type their own before enrich/draft. Every hook has `needsUserConfirmation: true`.

5. **Gmail send stays in ColdReach** — Thaw never touches Gmail, OAuth, or send.

6. **Auth is server-to-server** — `x-service-secret` only on CR→Thaw proxy calls, never in client bundles.

7. **Hooks/enrich extra fields** — consume `primarySource` and `notes` (hooks only) from live responses even though `lib/types.ts` `HooksResponse` / `EnrichResponse` document a subset.

8. **Progress/narration steps are UI-only** — Thaw's chat workflow shows steps like "Parsing the target profile" and "Searching Fiber, Apollo, and curated fallback contacts" while narrow runs. These are **not** returned by the API; CR may show similar loading UX.

---

## G. Do NOT (for ColdReach's Cursor)

- ❌ No redirect to Thaw `/start`, no JWT handoff token, no `GET /api/external/handoff`, no `pending-draft`, no `deepLink` — user never leaves CR.
- ❌ Do **not** call Thaw from the browser — only from CR server proxy routes.
- ❌ Do **not** reimplement Thaw's research, ranking, Fiber/Apollo/OpenAI logic — call `/api/v1/*` only.
- ❌ Do **not** redefine Thaw's types beyond copying the shapes CR needs to render and proxy.
- ❌ Do **not** put `SERVICE_SHARED_SECRET` in client-side code or env exposed to the browser.
- ❌ Do **not** skip hook confirmation before enrich/draft.

---

## H. Component → data props map

Derived from `lib/types.ts` and Thaw demo components.

### Prospect list card

| UI field | Source |
|---|---|
| `name` | `ProspectPerson.name` |
| `title` | `ProspectPerson.title` |
| `company` | `ProspectPerson.company` |
| `location` | `ProspectPerson.location?` |
| `evidence` | `ProspectPerson.evidence` |
| `matchScore` | `ProspectPerson.matchScore` |
| Email badge on | `ProspectPerson.channels.email` |
| LinkedIn badge on | `ProspectPerson.channels.linkedin` |
| X badge on | `ProspectPerson.channels.x` |
| Email string (detail) | `ProspectPerson.email?` |
| Email quality hint | `ProspectPerson.emailStatus?` (`"verified"` \| `"guessed"` \| `"unavailable"`) |
| Email provenance | `ProspectPerson.emailSource?` (`"fiber"` \| `"apollo"`) |
| Row key / select id | `ProspectPerson.id` |
| Company link | `ProspectPerson.companyId` → `ProspectCompany` in `NarrowResponse.companies` // TBD: confirm in Thaw whether CR should surface company cards |

### Person detail

| UI field | Source |
|---|---|
| All contact/profile fields | Same `ProspectPerson` from narrow (no new call) |
| LinkedIn link | `ProspectPerson.linkedinUrl?` |
| X link | `ProspectPerson.xUrl?` |
| Why matched | `ProspectPerson.evidence` |
| Find hook action | `POST` hooks with `{ personId: ProspectPerson.id }` |

### Hook picker row

| UI field | Source |
|---|---|
| Hook text | `HookCandidate.text` |
| Hook source label | `HookCandidate.source` |
| Row key | `HookCandidate.id` |
| Confirmation flag | `HookCandidate.needsUserConfirmation` (always `true`) |
| Context source label | hooks response `primarySource` |
| Debug/empty context | hooks response `notes[]` |
| Confirmed value sent to enrich | selected `HookCandidate.text` OR user-typed string |

### Draft step (CR existing — inputs from Thaw + CR profile)

| Draft input | Source |
|---|---|
| Contact name, title, company | `ProspectPerson` |
| Contact email / social URLs | `ProspectPerson.email?`, `linkedinUrl?`, `xUrl?` |
| Channel availability | `ProspectPerson.channels` |
| Confirmed hook | user-confirmed string from hook picker |
| Recent snippets | `EnrichResponse.recentContext[]` |
| Outreach angles | `EnrichResponse.suggestedAngles[]` |
| Context provenance | enrich response `primarySource` |
| Resume / voice / closing | CR user profile (already in CR — not from Thaw) |
| Send | CR `gmail.send` |

### Narrow request (proxy)

| Field | Source |
|---|---|
| `query` | user targeting input in CR UI |
| `userBackground?` | logged-in user's resume text from CR profile |
| `limit?` | CR choice; Thaw default `8`, max `50` |

---

## I. First message to give ColdReach's Cursor

Build the Thaw headless integration in ColdReach in this order: (1) Add env vars `THAW_URL` and `SERVICE_SHARED_SECRET`, then create three **server-only** proxy routes (`/api/thaw/narrow`, `/api/thaw/hooks`, `/api/thaw/enrich`) that forward JSON to `${THAW_URL}/api/v1/narrow|hooks|enrich` with header `x-service-secret` and never expose the secret to the client. (2) Build a **prospect list** component in ColdReach's design system that renders `ProspectPerson` rows from narrow (`name`, `title`, `company`, `location`, `evidence`, `matchScore`, channel badges from `channels`, optional `emailStatus`/`emailSource`) and passes `userBackground` from the logged-in user's resume on the narrow call. (3) On row click, show **person detail** from the same `ProspectPerson` (links, email, evidence) with a **Find hook** button that proxies `POST` hooks with `{ personId: person.id }`. (4) Build a **hook picker** that lists `HookCandidate` items (`text`, `source`), shows `primarySource`, allows a custom hook, and requires explicit confirmation before proceeding. (5) On confirm, proxy `POST` enrich with `{ personId, confirmedHook }`, then feed `recentContext` and `suggestedAngles` plus the selected person and the user's existing resume/comments/closing into ColdReach's **existing** draft composer and send via **existing** `gmail.send`. Do **not** redirect to Thaw, do **not** implement handoff/pending-draft/deep-link, do **not** call Thaw from the browser, and always use `ProspectPerson.id` (not name) for hooks/enrich immediately after narrow while Thaw's 30-minute person cache is warm.

---

## Appendix: Thaw demo flow ↔ API sequence

```
User query
  → POST /api/v1/narrow { query, userBackground?, limit? }
  → render people[]

User clicks person (client state only)
  → render ProspectPerson fields

User clicks "Find hook"
  → POST /api/v1/hooks { personId }
  → render hooks[], primarySource, notes[]

User confirms hook
  → POST /api/v1/enrich { personId, confirmedHook }
  → CR draft using recentContext[], suggestedAngles[] + CR profile
  → CR gmail.send
```

Thaw reference files: `app/demo/chat-workflow.tsx` (chat UX), `app/demo/components/*.tsx` (step components), `lib/types.ts` (contract), `lib/people-cache.ts` (personId cache), `lib/auth.ts` (auth header).
