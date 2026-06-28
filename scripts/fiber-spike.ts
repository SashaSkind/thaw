/**
 * Task 0 — the Fiber spike (run FIRST).
 *
 * OWNER: Brandon. One question: can we reliably get a real person's recent
 * LinkedIn/X posts? Run with `pnpm fiber:spike`. It hits `getRecentPosts` on a
 * handful of test people and prints the decision gate:
 *   ✅ posts come back reliably -> live social hooks become the demo closer
 *   ⚠️ empty / rate-limited / flaky -> PIVOT to news + Apollo + curated fallback
 *
 * The script never throws on a thin/absent Fiber — that's an expected outcome
 * the result table reports, exactly like an on-stage run would behave.
 */

import {
  contactWaterfall,
  getPeople,
  getRecentPosts,
  isFiberConfigured,
  reverseEmailLookup,
  type FiberPerson,
} from "@/lib/fiber";

const TEST_PEOPLE: FiberPerson[] = [
  {
    name: "Patrick Collison",
    company: "Stripe",
    linkedinUrl: "https://www.linkedin.com/in/patrickcollison",
    xUrl: "https://x.com/patrickc",
  },
  {
    name: "Immad Akhund",
    company: "Mercury",
    xUrl: "https://x.com/immad",
  },
  {
    name: "Henrique Dubugras",
    company: "Brex",
    linkedinUrl: "https://www.linkedin.com/in/henriquedubugras",
  },
  {
    name: "Zach Perret",
    company: "Plaid",
    xUrl: "https://x.com/zachperret",
  },
];

async function main(): Promise<void> {
  console.log("=".repeat(64));
  console.log("FIBER SPIKE — can we get real recent LinkedIn/X posts?");
  console.log("=".repeat(64));
  console.log(
    `Fiber configured (FIBER_API_KEY present): ${isFiberConfigured() ? "yes" : "NO"}`,
  );
  console.log("");

  let peopleWithPosts = 0;
  const reasons = new Set<string>();

  for (const person of TEST_PEOPLE) {
    const result = await getRecentPosts(person);
    const count = result.data.length;
    if (result.available && count > 0) peopleWithPosts += 1;
    if (result.reason) reasons.add(result.reason);

    const status = result.available
      ? count > 0
        ? `✅ ${count} posts`
        : "⚠️  available but 0 posts"
      : "⚠️  unavailable";
    console.log(`- ${person.name.padEnd(20)} ${status}`);
    if (result.reason) console.log(`    reason: ${result.reason}`);
  }

  // Exercise the no-email path helpers too (so the spike covers the full surface).
  const sample = TEST_PEOPLE[0];
  const waterfall = await contactWaterfall(sample);
  const peopleSearch = await getPeople({ query: "YC fintech founder", limit: 3 });
  const reverse = await reverseEmailLookup("founder@example.com");

  console.log("");
  console.log("Surface check (no-email path):");
  console.log(
    `- contactWaterfall: ${waterfall.available ? `${waterfall.data.length} contacts` : "unavailable"}`,
  );
  console.log(
    `- getPeople:        ${peopleSearch.available ? `${peopleSearch.data.length} people` : "unavailable"}`,
  );
  console.log(
    `- reverseEmail:     ${reverse.available ? "resolved" : "unavailable"}`,
  );

  console.log("");
  console.log("-".repeat(64));
  const reliable = peopleWithPosts >= Math.ceil(TEST_PEOPLE.length * 0.6);
  if (reliable) {
    console.log(
      `DECISION GATE: ✅ REAL SOCIAL — ${peopleWithPosts}/${TEST_PEOPLE.length} people returned posts.`,
    );
    console.log("Hooks/enrich run on live social data; live hook = demo closer.");
  } else {
    console.log(
      `DECISION GATE: ⚠️  PIVOT TO FALLBACK — only ${peopleWithPosts}/${TEST_PEOPLE.length} people returned posts.`,
    );
    console.log(
      "Hooks/enrich use news + Apollo bio + curated dataset; live social is best-effort.",
    );
    console.log(
      "Human-in-the-loop hook capture carries the demo. (This is the expected branch with no FIBER_API_KEY.)",
    );
  }
  if (reasons.size > 0) {
    console.log("");
    console.log("Reasons observed:");
    for (const reason of reasons) console.log(`  - ${reason}`);
  }
  console.log("-".repeat(64));
  console.log("TELL THE TEAM THIS RESULT (this shapes the rest of the night).");
}

main().catch((error) => {
  console.error("Spike crashed unexpectedly:", error);
  process.exit(1);
});
