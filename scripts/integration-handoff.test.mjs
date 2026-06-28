// scripts/integration-handoff.test.mjs
// Automated end-to-end test of the Thaw <-> ColdReach handoff against the mock
// ColdReach (mocks/coldreach). Covers the full happy path:
//   token -> session -> profile -> pending-draft -> deepLink
// plus invalid-token 401 and no-session 401.
//
// Run:  npm run test:integration
// (wraps `node --env-file-if-exists=.env.local scripts/integration-handoff.test.mjs`)
//
// PREREQUISITES (same model as scripts/smoke.ts):
//   - The Thaw dev server is running at THAW_URL (default http://localhost:3000)
//     with INTEGRATION_SHARED_SECRET set and COLDREACH_URL pointing at this
//     test's mock port (default http://localhost:4000).
//   - This test starts the mock ColdReach itself (or reuses one already on the
//     port). The mock + Thaw MUST share the same INTEGRATION_SHARED_SECRET.

import { createColdReachMock, mintToken, MOCK_PROFILE } from "../mocks/coldreach/server.mjs";

const SECRET = process.env.INTEGRATION_SHARED_SECRET || "dev-integration-secret";
const THAW_URL = (process.env.THAW_URL || "http://localhost:3000").replace(/\/$/, "");
const COLDREACH_URL = (process.env.COLDREACH_URL || "http://localhost:4000").replace(/\/$/, "");
const MOCK_PORT = Number(new URL(COLDREACH_URL).port || 4000);

let failures = 0;
function check(name, pass, detail = "") {
  const tag = pass ? "PASS" : "FAIL";
  if (!pass) failures++;
  console.log(`  [${tag}] ${name}${detail ? ` — ${detail}` : ""}`);
}

function cookieFrom(res) {
  const all = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const c of all) {
    const m = c.match(/^thaw_handoff=([^;]+)/);
    if (m) return `thaw_handoff=${m[1]}`;
  }
  return null;
}

function startMock() {
  return new Promise((resolve, reject) => {
    const server = createColdReachMock({ secret: SECRET, selfUrl: COLDREACH_URL, thawUrl: THAW_URL });
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.log(`  (mock port ${MOCK_PORT} already in use — reusing existing mock)`);
        resolve(null);
      } else {
        reject(err);
      }
    });
    server.listen(MOCK_PORT, () => {
      console.log(`  (started mock ColdReach on ${COLDREACH_URL})`);
      resolve(server);
    });
  });
}

async function thawReachable() {
  try {
    const res = await fetch(`${THAW_URL}/`, { method: "GET" });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function main() {
  console.log("Integration test: Thaw <-> ColdReach handoff");
  console.log(`  THAW_URL=${THAW_URL}  COLDREACH_URL=${COLDREACH_URL}\n`);

  if (!(await thawReachable())) {
    console.error(
      `\nERROR: Thaw server not reachable at ${THAW_URL}.\n` +
        `Start it first:  COLDREACH_URL=${COLDREACH_URL} INTEGRATION_SHARED_SECRET=${SECRET} npm run dev\n`,
    );
    process.exit(1);
  }

  const startedMock = await startMock();

  try {
    // 1) Mint a valid handoff token (as ColdReach would).
    const token = mintToken(SECRET, {});
    check("minted handoff token", typeof token === "string" && token.split(".").length === 3);

    // 2) Session: verify token + fetch profile + set httpOnly cookie.
    const sessionRes = await fetch(`${THAW_URL}/api/integration/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token }),
    });
    const sessionData = await sessionRes.json();
    check("session: 200 + ok", sessionRes.status === 200 && sessionData.ok === true, `status=${sessionRes.status}`);
    check("session: identity carried", sessionData.name === MOCK_PROFILE.name, `name=${sessionData.name}`);

    // 3) Profile fetched from ColdReach is complete (incl. emailClosing).
    const p = sessionData.profile || {};
    check(
      "profile: resume/comments/emailClosing present",
      Boolean(p.resumeText) && Boolean(p.comments) && p.emailClosing === MOCK_PROFILE.emailClosing,
      `emailClosing=${JSON.stringify(p.emailClosing)}`,
    );

    const cookie = cookieFrom(sessionRes);
    check("session: httpOnly handoff cookie set", Boolean(cookie));

    // 4) Pending-draft with the session cookie -> deepLink.
    const draftRes = await fetch(`${THAW_URL}/api/integration/pending-draft`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookie || "" },
      body: JSON.stringify({
        contact: { name: "Amara Okafor", email: "amara@ledgerly.com", company: "Ledgerly", title: "Co-founder & CEO" },
        channel: "email",
        subject: "Quick note",
        body: "Hi Amara,\n\n...\n\nWarmly,\nJordan Lee\nGTM Advisor",
      }),
    });
    const draftData = await draftRes.json();
    check("pending-draft: 200 + deepLink", draftRes.status === 200 && Boolean(draftData.deepLink), `deepLink=${draftData.deepLink}`);

    // 5) The deepLink renders the stored draft on ColdReach.
    if (draftData.deepLink) {
      const chatRes = await fetch(draftData.deepLink);
      const chatHtml = await chatRes.text();
      check(
        "deepLink: ColdReach renders stored draft",
        chatRes.status === 200 && chatHtml.includes("Amara Okafor") && chatHtml.includes("Warmly"),
      );
    }

    // 6) Invalid token -> session 401.
    const badRes = await fetch(`${THAW_URL}/api/integration/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: "not-a-valid-jwt" }),
    });
    check("invalid token -> session 401", badRes.status === 401, `status=${badRes.status}`);

    // 7) No session cookie -> pending-draft 401.
    const noSessionRes = await fetch(`${THAW_URL}/api/integration/pending-draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact: { name: "x", company: "y", title: "z" }, channel: "email", body: "hi" }),
    });
    check("no session -> pending-draft 401", noSessionRes.status === 401, `status=${noSessionRes.status}`);
  } finally {
    if (startedMock) startedMock.close();
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("integration test crashed:", err);
  process.exit(1);
});
