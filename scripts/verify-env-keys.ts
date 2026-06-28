/**
 * Verify API keys from .env without printing secrets.
 * Usage: npx tsx --env-file=.env scripts/verify-env-keys.ts
 */

import { getPeople, isFiberConfigured } from "@/lib/fiber";
import { getBio, isApolloConfigured, searchApollo } from "@/lib/apollo";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

interface Check {
  name: string;
  configured: boolean;
  ok: boolean;
  detail: string;
}

const checks: Check[] = [];

function report(check: Check): void {
  checks.push(check);
  const icon = !check.configured ? "—" : check.ok ? "✓" : "✗";
  console.log(`${icon} ${check.name}: ${check.detail}`);
}

async function testOpenAI(): Promise<void> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    report({
      name: "OPENAI_API_KEY",
      configured: false,
      ok: false,
      detail: "not set (heuristic fallback)",
    });
    return;
  }

  try {
    const openai = createOpenAI({ apiKey: key });
    const { text } = await generateText({
      model: openai(process.env.OPENAI_MODEL || "gpt-4o-mini"),
      prompt: 'Reply with exactly the word OK.',
      maxOutputTokens: 16,
    });
    const ok = text.trim().toUpperCase().includes("OK");
    report({
      name: "OPENAI_API_KEY",
      configured: true,
      ok,
      detail: ok
        ? `live (${process.env.OPENAI_MODEL || "gpt-4o-mini"})`
        : `unexpected response: ${text.slice(0, 40)}`,
    });
  } catch (error) {
    report({
      name: "OPENAI_API_KEY",
      configured: true,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

async function testFiber(): Promise<void> {
  if (!isFiberConfigured()) {
    report({
      name: "FIBER_API_KEY",
      configured: false,
      ok: false,
      detail: "not set (curated dataset fallback)",
    });
    return;
  }

  const result = await getPeople({ query: "Stripe founder", limit: 1 });
  report({
    name: "FIBER_API_KEY",
    configured: true,
    ok: result.available,
    detail: result.available
      ? `people-search OK (${result.data.length} result(s))`
      : result.reason ?? "unavailable",
  });
}

async function testApollo(): Promise<void> {
  if (!isApolloConfigured()) {
    report({
      name: "APOLLO_API_KEY",
      configured: false,
      ok: false,
      detail: "not set (dataset fallback)",
    });
    return;
  }

  const search = await searchApollo(
    {
      rawQuery: "fintech founders NYC",
      industry: ["fintech"],
      geography: ["New York"],
      roles: ["CEO", "Founder"],
      stage: [],
      companyType: [],
      exclusions: [],
    },
    1,
  );

  const bio = await getBio({
    name: "Patrick Collison",
    company: "Stripe",
    linkedinUrl: "https://www.linkedin.com/in/patrickcollison",
  });

  const searchOk = search !== null && search.people.length >= 0;
  const bioOk = bio.available;

  report({
    name: "APOLLO_API_KEY",
    configured: true,
    ok: searchOk || bioOk,
    detail: [
      `search: ${searchOk ? `OK (${search?.people.length ?? 0} people)` : "failed"}`,
      `bio: ${bioOk ? "OK" : bio.reason ?? "failed"}`,
    ].join("; "),
  });
}

async function testColdReachUrl(): Promise<void> {
  const url = process.env.COLDREACH_URL?.trim();
  const secret = process.env.INTEGRATION_SHARED_SECRET?.trim();
  if (!url) {
    report({
      name: "COLDREACH_URL",
      configured: false,
      ok: false,
      detail: "not set (integration handoff disabled)",
    });
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    report({
      name: "COLDREACH_URL",
      configured: true,
      ok: res.ok || res.status < 500,
      detail: `reachable (HTTP ${res.status})${secret ? "; INTEGRATION_SHARED_SECRET set" : "; no INTEGRATION_SHARED_SECRET"}`,
    });
  } catch (error) {
    report({
      name: "COLDREACH_URL",
      configured: true,
      ok: false,
      detail: `unreachable — ${error instanceof Error ? error.message : String(error)} (start mock: npm run mock:coldreach)`,
    });
  }
}

async function main(): Promise<void> {
  console.log("Env key verification (secrets redacted)\n");

  report({
    name: "SERVICE_SHARED_SECRET",
    configured: Boolean(process.env.SERVICE_SHARED_SECRET?.trim()),
    ok: true,
    detail: process.env.SERVICE_SHARED_SECRET?.trim()
      ? "set (auth required on /v1/*)"
      : "empty — open demo mode",
  });

  await testOpenAI();
  await testFiber();
  await testApollo();
  await testColdReachUrl();

  const configured = checks.filter((c) => c.configured);
  const failed = configured.filter((c) => !c.ok);

  console.log("");
  if (failed.length === 0) {
    console.log(
      configured.length === 0
        ? "No API keys configured — demo fallbacks only."
        : "All configured keys passed.",
    );
  } else {
    console.log(`${failed.length} configured key(s) failed: ${failed.map((c) => c.name).join(", ")}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
