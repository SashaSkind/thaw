// scripts/test-fallback.ts
// Exercises the non-Fiber fallbacks with a sample person and prints output.
//   npx tsx scripts/test-fallback.ts
//
// These are NOT wired into the live routes (Brandon owns route wiring). This
// just proves the modules degrade gracefully and never fabricate: with no
// sources -> nothing; with real sources but no OPENAI_API_KEY -> context is
// preserved but no extracted hooks/angles (no fabrication).

import { generateHooksFallback } from "../lib/hooks-fallback";
import { generateEnrichFallback } from "../lib/enrich-fallback";
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
  console.log("Non-Fiber fallback test");
  console.log(
    `(OPENAI_API_KEY=${process.env.OPENAI_API_KEY ? "set" : "unset"}, APOLLO_API_KEY=${process.env.APOLLO_API_KEY ? "set" : "unset"})\n`,
  );

  // Scenario A: no sources available (no keys, no extra sources).
  console.log("Scenario A: no sources (thin)");
  const hooksA = await generateHooksFallback({ person: sample });
  const enrichA = await generateEnrichFallback({ person: sample });
  console.log("    hooks:", JSON.stringify(hooksA));
  console.log("    enrich:", JSON.stringify(enrichA));
  check("hooks is an array", Array.isArray(hooksA), `len=${hooksA.length}`);
  check(
    "no fabricated hooks when sources are thin",
    hooksA.length === 0,
    `len=${hooksA.length}`,
  );
  check(
    "enrich has recentContext[] + suggestedAngles[]",
    Array.isArray(enrichA.recentContext) && Array.isArray(enrichA.suggestedAngles),
    `context=${enrichA.recentContext.length} angles=${enrichA.suggestedAngles.length}`,
  );

  // Scenario B: real source snippets provided, but no OpenAI key in this env.
  console.log("\nScenario B: real sources provided (caller-supplied)");
  const extraSources = [
    "news — Northgate Pay raised a $40M Series B led by a major fintech fund.",
    "post — Maya spoke about payments fraud tooling at a NYC fintech meetup.",
  ];
  const hooksB = await generateHooksFallback({ person: sample, extraSources });
  const enrichB = await generateEnrichFallback({ person: sample, extraSources });
  console.log("    hooks:", JSON.stringify(hooksB));
  console.log("    enrich:", JSON.stringify(enrichB));
  check("hooks is an array", Array.isArray(hooksB), `len=${hooksB.length}`);
  check(
    "recentContext preserves the real sources (no fabrication)",
    enrichB.recentContext.length === extraSources.length,
    `context=${enrichB.recentContext.length}`,
  );
  if (!process.env.OPENAI_API_KEY) {
    check(
      "without OPENAI_API_KEY: no extracted hooks/angles (no fabrication)",
      hooksB.length === 0 && enrichB.suggestedAngles.length === 0,
      `hooks=${hooksB.length} angles=${enrichB.suggestedAngles.length}`,
    );
  } else {
    check(
      "with OPENAI_API_KEY: hooks grounded in sources (<=3) and confirmation flag set",
      hooksB.length <= 3 && hooksB.every((h) => h.needsUserConfirmation === true),
      `hooks=${hooksB.length}`,
    );
  }

  console.log(
    `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`,
  );
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("test-fallback crashed:", err);
  process.exit(1);
});
