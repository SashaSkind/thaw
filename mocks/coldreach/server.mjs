// Mock ColdReach — test harness for the Thaw <-> ColdReach handoff.
//
// Implements the ColdReach side of docs/integration.md §2 so the Thaw side can
// be exercised end-to-end WITHOUT the real ColdReach app. Dependency-free
// (HS256 via node:crypto) so it runs with plain `node`, no install.
//
// NOTE: this is a TEST DOUBLE only. It is not, and must not be mistaken for,
// the real ColdReach repo. It never sends email; /chat is a render-only stub.

import http from "node:http";
import crypto from "node:crypto";

const DEFAULT_SECRET = "dev-integration-secret";
const TOKEN_TTL_SECONDS = 15 * 60; // docs/integration.md: token exp = iat + 15 min

// The sender context returned by GET /api/external/profile (a pre-onboarded
// demo account, per §5). Shapes match SenderProfile exactly.
export const MOCK_PROFILE = {
  userId: "u_123",
  name: "Jordan Lee",
  resumeText:
    "Jordan Lee is a former fintech operator who scaled GTM at two payments startups.",
  comments: "I help early fintech teams stand up outbound that actually converts.",
  emailClosing: "Warmly,\nJordan Lee\nGTM Advisor",
};

// ---- minimal HS256 JWT (compact JWS) ----

function b64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(data, secret) {
  return crypto.createHmac("sha256", secret).update(data).digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Mint an HS256 handoff token. claims: { sub, name, ttlSeconds? }.
 * Set ttlSeconds=-1 (or any past value) to mint an already-expired token for
 * testing the token-expired path.
 */
export function mintToken(secret = DEFAULT_SECRET, claims = {}) {
  const now = Math.floor(Date.now() / 1000);
  const ttl = typeof claims.ttlSeconds === "number" ? claims.ttlSeconds : TOKEN_TTL_SECONDS;
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      sub: claims.sub ?? MOCK_PROFILE.userId,
      name: claims.name ?? MOCK_PROFILE.name,
      iat: now,
      exp: now + ttl,
    }),
  );
  const signature = sign(`${header}.${payload}`, secret);
  return `${header}.${payload}.${signature}`;
}

function verify(token, secret) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = sign(`${header}.${payload}`, secret);
  // constant-time compare
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    if (claims.exp && Math.floor(Date.now() / 1000) > claims.exp) return null;
    return claims;
  } catch {
    return null;
  }
}

function bearer(req, secret) {
  const m = (req.headers["authorization"] || "").match(/^Bearer (.+)$/);
  return m ? verify(m[1], secret) : null;
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function html(res, status, body) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
}

/**
 * Build the mock ColdReach HTTP server. Does not start listening.
 * options: { secret, thawUrl, selfUrl }
 */
export function createColdReachMock(options = {}) {
  const secret = options.secret ?? process.env.INTEGRATION_SHARED_SECRET ?? DEFAULT_SECRET;
  const thawUrl = (options.thawUrl ?? process.env.THAW_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const selfUrl = (options.selfUrl ?? process.env.COLDREACH_URL ?? "http://localhost:4000").replace(/\/$/, "");
  const drafts = new Map();

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, selfUrl);

    // §2: "Find prospects with Thaw" — mint token, 302 into Thaw /start.
    if (req.method === "GET" && url.pathname === "/api/external/handoff") {
      const token = mintToken(secret, {});
      res.writeHead(302, { location: `${thawUrl}/start?t=${token}` });
      res.end();
      return;
    }

    // Test helper (not part of §2): return a raw token, optionally expired.
    if (req.method === "GET" && url.pathname === "/mint") {
      const ttl = url.searchParams.get("expired") === "1" ? -10 : undefined;
      return json(res, 200, { token: mintToken(secret, { ttlSeconds: ttl }) });
    }

    // §2: GET /api/external/profile (Bearer) -> SenderProfile
    if (req.method === "GET" && url.pathname === "/api/external/profile") {
      if (!bearer(req, secret)) return json(res, 401, { error: "unauthorized" });
      return json(res, 200, MOCK_PROFILE);
    }

    // §2: POST /api/external/pending-draft (Bearer) -> { draftId, deepLink }
    // STORES ONLY. Never sends.
    if (req.method === "POST" && url.pathname === "/api/external/pending-draft") {
      const claims = bearer(req, secret);
      if (!claims) return json(res, 401, { error: "unauthorized" });
      let raw = "";
      for await (const chunk of req) raw += chunk;
      let draft;
      try {
        draft = JSON.parse(raw || "{}");
      } catch {
        return json(res, 400, { error: "invalid JSON" });
      }
      const draftId = "d_" + crypto.randomBytes(4).toString("hex");
      drafts.set(draftId, { ...draft, userId: claims.sub });
      return json(res, 200, { draftId, deepLink: `${selfUrl}/chat/${draftId}?pending=1` });
    }

    // §2: /chat/{draftId}?pending=1 — render the stored draft. Email -> Send
    // button (wired to gmail.send in real ColdReach); linkedin/x -> Copy.
    const chat = url.pathname.match(/^\/chat\/([^/]+)$/);
    if (req.method === "GET" && chat) {
      const d = drafts.get(chat[1]);
      if (!d) return html(res, 404, "<h1>Draft not found</h1>");
      const action = d.channel === "email" ? "Send from my Gmail" : "Copy";
      return html(
        res,
        200,
        `<!doctype html><html><head><meta charset="utf-8"><title>ColdReach — pending draft</title>
<style>body{font-family:system-ui;max-width:680px;margin:40px auto;padding:0 20px;background:#0f1115;color:#e8e8ea}
.card{background:#171a21;border:1px solid #2a2f3a;border-radius:12px;padding:20px}
pre{white-space:pre-wrap;background:#0b0d11;padding:14px;border-radius:8px;border:1px solid #2a2f3a}
.btn{background:#4f7cff;color:#fff;border:0;padding:10px 16px;border-radius:8px;font-size:15px;cursor:pointer}
.tag{color:#9aa4b2;font-size:13px}</style></head>
<body><div class="card">
<div class="tag">ColdReach · pending draft for ${escapeHtml(d.contact?.name ?? "")} (${escapeHtml(d.channel ?? "")})</div>
<h2>Review &amp; send</h2>
${d.subject ? `<p><b>Subject:</b> ${escapeHtml(d.subject)}</p>` : ""}
<pre>${escapeHtml(d.body ?? "")}</pre>
<button class="btn" onclick="this.outerHTML='&#10003; Sent from your Gmail (demo) — Thaw never touched it.'">${action}</button>
<p class="tag">This send fires from YOUR authenticated ColdReach session. Thaw only stored the draft.</p>
</div></body></html>`,
      );
    }

    json(res, 404, { error: "not found" });
  });
}

// CLI entry: `node mocks/coldreach/server.mjs`
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const port = Number(process.env.MOCK_PORT ?? 4000);
  const server = createColdReachMock();
  server.listen(port, () => {
    console.log(`[mock-coldreach] listening on http://localhost:${port}`);
    console.log("[mock-coldreach] endpoints: /api/external/handoff, /api/external/profile, /api/external/pending-draft, /chat/:id, /mint");
  });
}
