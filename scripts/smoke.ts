// scripts/smoke.ts
// Smoke test for POST /v1/narrow against a locally running dev server.
//   npx tsx scripts/smoke.ts
//
// Override target/secret via env if needed:
//   BASE_URL=http://localhost:3000 SERVICE_SHARED_SECRET=... npx tsx scripts/smoke.ts
//
// Exits non-zero if ANY assertion fails. Assertions are NOT loosened to pass —
// a failure is a real finding.

import type { NarrowResponse, ProspectPerson } from "@/lib/types";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.SERVICE_SHARED_SECRET ?? "dev-secret-coldreach";

interface Check {
  name: string;
  pass: boolean;
  detail?: string;
}

let failures = 0;

function record(checks: Check[]): void {
  for (const c of checks) {
    const tag = c.pass ? "PASS" : "FAIL";
    if (!c.pass) failures++;
    console.log(`    [${tag}] ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  }
}

function isSortedDesc(people: ProspectPerson[]): boolean {
  for (let i = 1; i < people.length; i++) {
    if (people[i - 1].matchScore < people[i].matchScore) return false;
  }
  return true;
}

function intentNonEmpty(res: NarrowResponse): boolean {
  const { intent } = res;
  // rawQuery always present; "non-empty" means parsing produced >=1 structured field.
  const structuredKeys = [
    intent.industry,
    intent.geography,
    intent.stage,
    intent.companyType,
    intent.roles,
    intent.exclusions,
  ];
  return structuredKeys.some((v) => Array.isArray(v) && v.length > 0);
}

async function callNarrow(query: string, limit?: number): Promise<NarrowResponse> {
  const res = await fetch(`${BASE_URL}/api/v1/narrow`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-service-secret": SECRET,
    },
    body: JSON.stringify(limit ? { query, limit } : { query }),
  });
  if (!res.ok) {
    throw new Error(`POST /v1/narrow returned HTTP ${res.status} for "${query}"`);
  }
  return (await res.json()) as NarrowResponse;
}

async function main(): Promise<void> {
  console.log(`Smoke test: ${BASE_URL}/api/v1/narrow\n`);

  // 1) Specific happy-path query.
  const q1 = "founders at YC fintechs in NYC around Series B";
  console.log(`Query 1 (specific): "${q1}"`);
  const r1 = await callNarrow(q1);
  console.log(
    `    returned ${r1.people.length} people, ${r1.companies.length} companies`,
  );
  record([
    { name: "people sorted by matchScore desc", pass: isSortedDesc(r1.people) },
    { name: "intent non-empty (structured criteria parsed)", pass: intentNonEmpty(r1) },
    {
      name: "at least one person has a truthy email",
      pass: r1.people.some((p) => Boolean(p.email)),
      detail: `${r1.people.filter((p) => Boolean(p.email)).length} with email`,
    },
  ]);

  // 2) Intentionally vague query — must still return results, not crash.
  const q2 = "fintech founders";
  console.log(`\nQuery 2 (vague): "${q2}"`);
  const r2 = await callNarrow(q2);
  console.log(`    returned ${r2.people.length} people`);
  record([
    { name: "people sorted by matchScore desc", pass: isSortedDesc(r2.people) },
    { name: "intent non-empty (structured criteria parsed)", pass: intentNonEmpty(r2) },
    {
      name: "vague query returns >=1 person (fallback path works)",
      pass: r2.people.length >= 1,
      detail: `${r2.people.length} people`,
    },
  ]);

  // 3) Query expected to surface at least one person with no email.
  const q3 = "CTOs at fintech startups in New York";
  console.log(`\nQuery 3 (no-email surfacing): "${q3}"`);
  const r3 = await callNarrow(q3);
  console.log(`    returned ${r3.people.length} people`);
  record([
    { name: "people sorted by matchScore desc", pass: isSortedDesc(r3.people) },
    { name: "intent non-empty (structured criteria parsed)", pass: intentNonEmpty(r3) },
    {
      name: "at least one person has channels.email === false",
      pass: r3.people.some((p) => p.channels.email === false),
      detail: `${r3.people.filter((p) => p.channels.email === false).length} without email`,
    },
  ]);

  console.log(
    `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`,
  );
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("\nSmoke test crashed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
