# Mock ColdReach (test double)

A dependency-free stand-in for the **ColdReach** side of the Thaw ⇄ ColdReach
handoff, used to exercise the Thaw integration end-to-end without the real
ColdReach app. It implements the ColdReach endpoints from
[`docs/integration.md` §2](../../docs/integration.md).

> ⚠️ This is a **test harness only**. It is not the real ColdReach repo, never
> sends email, and stores drafts in memory (lost on restart). HS256 is done with
> `node:crypto`, so there are **no dependencies** — it runs with plain `node`.

## Endpoints implemented (§2)

| Method & path | §2 | Behavior |
| --- | --- | --- |
| `GET /api/external/handoff` | ✅ | Mints an HS256 token `{ sub, name, iat, exp:+15m }` and 302-redirects to `${THAW_URL}/start?t=<jwt>` (the "Find prospects with Thaw" button). |
| `GET /api/external/profile` | ✅ | `Authorization: Bearer <jwt>` → `200 { userId, name, resumeText, comments, emailClosing }`. 401 on missing/invalid/expired token. |
| `POST /api/external/pending-draft` | ✅ | `Authorization: Bearer <jwt>` + `{ contact, channel, subject?, body }` → `200 { draftId, deepLink }`. **Stores only; never sends.** 401 on bad token. |
| `GET /chat/{draftId}?pending=1` | ✅ (stub) | Renders the stored draft. `email` → **Send from my Gmail** button (the real ColdReach wires this to `gmail.send`); `linkedin`/`x` → **Copy** (no auto-send). |
| `GET /mint?expired=1` | helper | Returns `{ token }` for tests (not part of §2). `?expired=1` mints an already-expired token. |

The returned profile is a fixed pre-onboarded demo account (`Jordan Lee`), so
`/profile` always yields real sender context (§5).

## Run it

```bash
# from the repo root — no install needed
INTEGRATION_SHARED_SECRET=dev-integration-secret node mocks/coldreach/server.mjs
# -> [mock-coldreach] listening on http://localhost:4000
```

Environment:

| Var | Default | Meaning |
| --- | --- | --- |
| `INTEGRATION_SHARED_SECRET` | `dev-integration-secret` | HS256 secret — **must match Thaw's** value. |
| `MOCK_PORT` | `4000` | Port to listen on. |
| `THAW_URL` | `http://localhost:3000` | Where `/api/external/handoff` redirects. |
| `COLDREACH_URL` | `http://localhost:4000` | Base used to build `deepLink`s. |

To drive the full flow in a browser: start this mock, start Thaw
(`npm run dev`) with `COLDREACH_URL=http://localhost:4000` and the **same**
`INTEGRATION_SHARED_SECRET`, then open `http://localhost:4000/api/external/handoff`.

## Programmatic use (tests)

```js
import { createColdReachMock, mintToken, MOCK_PROFILE } from "./mocks/coldreach/server.mjs";
const server = createColdReachMock({ secret: "dev-integration-secret" });
server.listen(4000);
const token = mintToken("dev-integration-secret");          // valid 15-min token
const expired = mintToken("dev-integration-secret", { ttlSeconds: -10 }); // expired
```

See `scripts/integration-handoff.test.mjs` for the automated end-to-end test.
