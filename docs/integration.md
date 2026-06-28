# Thaw ⇆ ColdReach Integration Spec (Cursor build prompt)

> Shared contract for two separate repos. **Thaw** = the new prospect-discovery app (this repo).
> **ColdReach** = the existing app (`trycoldreach.app`) that owns login, onboarding, and Gmail send.
> Paste the relevant section into each repo's Cursor, or commit this file to both as `docs/integration.md`.

---

## 0. Locked decisions (do not re-litigate)

1. **ColdReach is the front door.** The user logs in and onboards (resume, comments, preferred email closing) **in ColdReach first**, then is handed off to Thaw. This means there is **no auth wall or onboarding detour inside Thaw** — by the time Thaw runs, the user is authenticated and onboarded.
2. **Thaw drafts the FINISHED email text** (subject + body, including the closing). ColdReach does **not** draft anymore — it just stores and sends.
3. **The send always happens inside ColdReach's authenticated browser session** via the existing `gmail.send`. **Thaw never touches Gmail.**
4. **Round-trip pattern = Option C (pending draft + deep-link back).** Thaw POSTs the finished draft to ColdReach (stored as a pending draft keyed to the user), then redirects the user back into ColdReach at that draft to click Send. We chose C because ColdReach stores Gmail tokens only in the user's session cookie (server-side-never), so the send must fire from the user's live ColdReach session — not from a server-to-server call.
5. **Identity crosses via a short-lived signed token**, never Gmail credentials. The token carries `userId` only; sender context is fetched, not stuffed into the URL.

### The one invariant that must never break
> Gmail credentials never leave ColdReach. Thaw holds a signed handoff token (identity), never tokens. The `pending-draft` endpoint only **stores**; it never sends. The send fires when the user clicks Send in their authenticated ColdReach browser session.

---

## 1. End-to-end flow

```
ColdReach: login → onboarding (resume, comments, emailClosing)
   │  user clicks "Find prospects with Thaw"
   │  ColdReach mints signed token { userId, name, exp:+15m } → redirects to
   ▼
Thaw /start?t=<jwt>
   │  verifies token, fetches sender context from ColdReach (GET /profile)
   │  discovery → hooks → agent loop → user approves FINISHED draft → clicks "Send"
   │  POST finished draft + token → ColdReach (POST /pending-draft) → gets { deepLink }
   │  redirects browser to deepLink
   ▼
ColdReach /chat/{draftId}?pending=1
   │  renders the stored draft → user clicks Send
   ▼
gmail.send  (user's own authenticated session)
```

---

## 2. The shared contract (both repos build to these EXACT shapes)

### Token
Signed JWT, **HS256**, secret = `INTEGRATION_SHARED_SECRET` (identical value in both repos).
```jsonc
// claims
{ "sub": "<coldreach userId>", "name": "Jane Doe", "iat": ..., "exp": "iat + 15 min" }
```
Treated as an opaque **bearer credential** by Thaw (Thaw may decode it to show the name, but ColdReach is the authority and re-verifies on every call).

### ColdReach endpoints (3) — built by the ColdReach owner
```
GET  /api/external/handoff
  → mints the token for the logged-in user, 302-redirects to `${THAW_URL}/start?t=<jwt>`
  (this is the "Find prospects with Thaw" button target; uses the live ColdReach session)

GET  /api/external/profile
  Auth: Authorization: Bearer <jwt>   (verify HS256 + exp; resolve userId)
  → 200 { userId, name, resumeText, comments, emailClosing }
  (reads ColdReach's own profile:{userId})

POST /api/external/pending-draft
  Auth: Authorization: Bearer <jwt>
  Body: { contact: {name, email?, company, title, linkedinUrl?, xUrl?},
          channel: "email" | "linkedin" | "x",
          subject?: string,        // present when channel === "email"
          body: string }           // FINISHED text, closing included
  → 200 { draftId, deepLink }      // deepLink = `${COLDREACH_URL}/chat/{draftId}?pending=1`
  STORES ONLY under pending_draft:{userId}. MUST NOT send.
```
Plus a small UI change: `/chat/{draftId}?pending=1` renders the stored draft with a **Send** button wired to ColdReach's existing `gmail.send` path (email channel). For `linkedin`/`x` channels there is no auto-send (out of scope) — render with a **Copy** button instead.

### Thaw endpoints/pages (this repo) — built here
```
GET  /start?t=<jwt>          page: verify+decode token, set a short-lived Thaw session,
                             fetch sender context, route into the discovery flow.
lib/coldreach-integration.ts:
  verifyToken(jwt): { userId, name }            // HS256 with INTEGRATION_SHARED_SECRET
  fetchSenderProfile(jwt): SenderProfile         // GET ColdReach /api/external/profile
  postPendingDraft(jwt, draft): { deepLink }     // POST ColdReach /api/external/pending-draft
```
On the draft view's **Send** action: call `postPendingDraft(...)`, then `window.location.assign(deepLink)` — the deep-link-back redirect.

---

## 3. Build tasks — THAW side (this repo, Cursor builds)

1. **`lib/coldreach-integration.ts`** — implement `verifyToken`, `fetchSenderProfile`, `postPendingDraft` against §2. Use `INTEGRATION_SHARED_SECRET` + `COLDREACH_URL` from env. All three degrade gracefully (timeout + try/catch); if ColdReach is unreachable, surface a clear UI error, never throw to a blank screen.
2. **`app/start/page.tsx`** — read `?t=`, verify, stash the token + decoded `{userId, name}` in a **session-only** store (httpOnly cookie set by a Thaw route handler, or sessionStorage for the demo). Call `fetchSenderProfile` and hold `SenderProfile` in client/session state for the flow. Then route into the existing targeting/discovery UI.
3. **Wire sender context into drafting** — Thaw now writes the FINISHED email, so its drafting step MUST use `resumeText`, `comments`, and `emailClosing` from the fetched profile. The closing is appended/woven by Thaw, not ColdReach. (This is the consequence of "ColdReach just sends".)
4. **Draft view → Send** — build the finished `{contact, channel, subject?, body}`, call `postPendingDraft`, then redirect to the returned `deepLink`.
5. **Channel awareness** — if `channels.email` is true → email draft (subject+body); else produce a LinkedIn/X DM body and set `channel` accordingly (ColdReach will render Copy, not Send, for those).

### THAW guardrails (DO NOT)
- ❌ Do NOT call `gmail.send`, touch OAuth, or store/forward Gmail tokens. Thaw holds the **handoff token only**.
- ❌ Do NOT persist `SenderProfile` (resume/PII) to a database. Hold it in session state for the flow only; it is fetched fresh each handoff.
- ❌ Do NOT modify the stateless `/v1/narrow|hooks|enrich` service endpoints — this integration is a **new module** (`lib/coldreach-integration.ts` + `/start` page + the Send action), separate from the service.
- ❌ Do NOT redefine the shared types or the token claims — match §2 exactly.
- ❌ Do NOT put resume text or PII in any URL. Identity rides in the signed token; profile is fetched server-to-server.

---

## 4. Build tasks — COLDREACH side (other repo / owner)

> Hand this section to whoever owns the ColdReach repo. Keep these as thin integration glue — do not change ColdReach's auth/token model.

1. **`GET /api/external/handoff`** — for the logged-in user, mint the HS256 token (claims in §2) and 302 to `${THAW_URL}/start?t=<jwt>`. Add a "Find prospects with Thaw" button somewhere post-onboarding that links here.
2. **`GET /api/external/profile`** — verify Bearer token, return `{ userId, name, resumeText, comments, emailClosing }` from `profile:{userId}`.
3. **`POST /api/external/pending-draft`** — verify Bearer token, **store** `{contact, channel, subject?, body}` under `pending_draft:{userId}` with a `draftId`, return `{ draftId, deepLink }`. **Must not send.**
4. **Render + send** — `/chat/{draftId}?pending=1` shows the stored draft. Email channel → existing `gmail.send` on the Send button (user's session). LinkedIn/X channel → Copy button (no auto-send).
5. **Env:** `INTEGRATION_SHARED_SECRET` (same value as Thaw), `THAW_URL`.

---

## 5. Coordination checklist (between the two owners)
- [ ] `INTEGRATION_SHARED_SECRET` is the **same string** in both repos' env.
- [ ] `COLDREACH_URL` (in Thaw) and `THAW_URL` (in ColdReach) point at each other's deploys.
- [ ] The three endpoint shapes in §2 match byte-for-byte on both sides.
- [ ] Agreement that **Thaw owns the email voice** (drafts finished text incl. closing); ColdReach only stores + sends. Neither side leaves the closing out.
- [ ] Demo accounts are **pre-onboarded** in ColdReach (resume uploaded) so `/profile` returns real sender context.

---

## 6. Demo / test-mode safety
- Keep a demo path that sends **only to the signed-in user's own email** (or a dry-run that stops at the rendered draft) so nothing risky goes out live on stage. The deep-link-back beat — "…and it's now in ColdReach, ready to send from your own inbox" — is a *good* thing to show: it visibly proves the send is authenticated, not a bot blasting from a shared key.

---

## 7. First message to give THAW's Cursor

> "Read docs/integration.md. Build ONLY the Thaw side (§3). Create `lib/coldreach-integration.ts` with `verifyToken`, `fetchSenderProfile`, `postPendingDraft` exactly matching the §2 contract (HS256 with `INTEGRATION_SHARED_SECRET`, base URL `COLDREACH_URL`). Build `app/start/page.tsx` to verify the `?t=` token, fetch sender context, stash it in session-only state, and route into the existing discovery flow. Wire the fetched resume/comments/emailClosing into the drafting step so Thaw produces the FINISHED email text including the closing. On the draft view's Send action, POST the finished `{contact, channel, subject?, body}` via `postPendingDraft` and redirect to the returned `deepLink`. Follow every guardrail in §3 — especially: never call gmail.send or touch OAuth, never persist resume PII to a DB, never modify the /v1 service endpoints, and never put PII in a URL. All network calls degrade gracefully on timeout/failure with a clear UI error."
