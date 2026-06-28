// scripts/test-handoff.ts
// Confirms sendToColdReach degrades gracefully (never throws, returns ok:false)
// when (a) COLDREACH_DRAFT_URL is unset and (b) the URL is bogus.
//   npx tsx scripts/test-handoff.ts

import { sendToColdReach } from "../lib/coldreach";
import type { ProspectPerson } from "../lib/types";

const sample: ProspectPerson = {
  id: "p_sample",
  name: "Maya Chen",
  title: "Co-Founder & CEO",
  company: "Northgate Pay",
  companyId: "co_northgate",
  location: "New York, NY",
  email: "maya@northgatepay.com",
  linkedinUrl: "https://linkedin.com/in/mayachen",
  evidence: "sample",
  matchScore: 100,
  channels: { email: true, linkedin: true, x: false },
};

let failures = 0;

function check(name: string, pass: boolean, detail: string): void {
  const tag = pass ? "PASS" : "FAIL";
  if (!pass) failures++;
  console.log(`  [${tag}] ${name} — ${detail}`);
}

async function main(): Promise<void> {
  console.log("Handoff degradation test\n");

  // (a) COLDREACH_DRAFT_URL unset
  delete process.env.COLDREACH_DRAFT_URL;
  console.log("Case (a): COLDREACH_DRAFT_URL unset");
  let threw = false;
  let resultA: Awaited<ReturnType<typeof sendToColdReach>> | undefined;
  try {
    resultA = await sendToColdReach(sample, "shared YC connection");
  } catch {
    threw = true;
  }
  check("did not throw", !threw, threw ? "threw" : "no throw");
  check(
    "returned ok:false",
    resultA?.ok === false,
    JSON.stringify(resultA),
  );

  // (b) bogus URL (connection refused) — must still degrade, not throw
  process.env.COLDREACH_DRAFT_URL = "http://127.0.0.1:1/coldreach-does-not-exist";
  console.log("\nCase (b): bogus COLDREACH_DRAFT_URL");
  threw = false;
  let resultB: Awaited<ReturnType<typeof sendToColdReach>> | undefined;
  try {
    resultB = await sendToColdReach(sample);
  } catch {
    threw = true;
  }
  check("did not throw", !threw, threw ? "threw" : "no throw");
  check(
    "returned ok:false",
    resultB?.ok === false,
    JSON.stringify(resultB),
  );

  console.log(
    `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`,
  );
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("test-handoff crashed:", err);
  process.exit(1);
});
