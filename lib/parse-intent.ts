// lib/parse-intent.ts
// Turn a broad targeting goal into structured TargetingIntent.
//
// Primary path: Vercel AI SDK + OpenAI `generateObject` (OpenAI is the sponsor
// model for this repo's reasoning). Fallback path: a deterministic keyword
// heuristic so the live demo NEVER depends on a key being present or the model
// being up — same reliability principle the spec applies to Apollo.

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { CompanyStage, TargetingIntent } from "@/lib/types";

const stageEnum = z.enum([
  "seed",
  "series_a",
  "series_b",
  "series_c",
  "growth",
  "unknown",
]);

const intentSchema = z.object({
  industry: z.array(z.string()).optional(),
  geography: z.array(z.string()).optional(),
  stage: z.array(stageEnum).optional(),
  companyType: z.array(z.string()).optional(),
  roles: z.array(z.string()).optional(),
  exclusions: z.array(z.string()).optional(),
});

const SYSTEM_PROMPT =
  "Extract structured B2B prospecting criteria from the user's targeting goal. " +
  "Return only the fields you're confident about. Normalize company funding " +
  "stage to one of: seed, series_a, series_b, series_c, growth, unknown. " +
  "Geography should be human-readable (e.g. 'New York, NY'). Roles should be " +
  "lowercased job functions (e.g. 'founder', 'ceo'). Exclusions are things the " +
  "user explicitly wants to avoid.";

export async function parseIntent(
  query: string,
  userBackground?: string,
): Promise<TargetingIntent> {
  if (process.env.OPENAI_API_KEY) {
    try {
      const { object } = await generateObject({
        model: openai(process.env.OPENAI_MODEL || "gpt-4o-mini"),
        schema: intentSchema,
        system: SYSTEM_PROMPT,
        prompt: userBackground
          ? `Targeting goal: ${query}\n\nUser background (for context, may refine targeting): ${userBackground}`
          : `Targeting goal: ${query}`,
      });
      return { rawQuery: query, ...object };
    } catch (err) {
      // Never throw to the caller because the model is down / misconfigured.
      console.warn(
        "[parse-intent] OpenAI parse failed, using heuristic fallback:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return heuristicParse(query);
}

// ---- deterministic fallback ----

const INDUSTRY_KEYWORDS: Record<string, string> = {
  fintech: "fintech",
  "financial technology": "fintech",
  payments: "fintech",
  banking: "fintech",
  insurtech: "insurtech",
  insurance: "insurtech",
  healthtech: "healthtech",
  health: "healthtech",
  crypto: "crypto",
  web3: "crypto",
  saas: "saas",
};

const STAGE_KEYWORDS: Array<[RegExp, CompanyStage]> = [
  [/series\s*c/i, "series_c"],
  [/series\s*b/i, "series_b"],
  [/series\s*a/i, "series_a"],
  [/seed/i, "seed"],
  [/growth|late.?stage/i, "growth"],
];

const ROLE_KEYWORDS: Array<[RegExp, string]> = [
  [/founders?|co-?founders?/i, "founder"],
  [/\bceos?\b/i, "ceo"],
  [/\bctos?\b/i, "cto"],
  [/\bcoos?\b/i, "coo"],
  [/\bcmos?\b/i, "cmo"],
  [/heads? of/i, "head"],
  [/\bvps?\b|vice president/i, "vp"],
];

export function heuristicParse(query: string): TargetingIntent {
  const q = query.toLowerCase();

  const industry = uniq(
    Object.entries(INDUSTRY_KEYWORDS)
      .filter(([k]) => q.includes(k))
      .map(([, v]) => v),
  );

  const geography: string[] = [];
  if (/\bny\b|new york|nyc|manhattan|brooklyn/.test(q)) {
    geography.push("New York, NY");
  }
  if (/\bsf\b|san francisco|bay area/.test(q)) geography.push("San Francisco, CA");
  if (/boston/.test(q)) geography.push("Boston, MA");

  const stage = uniq(
    STAGE_KEYWORDS.filter(([re]) => re.test(q)).map(([, s]) => s),
  ) as CompanyStage[];

  const roles = uniq(
    ROLE_KEYWORDS.filter(([re]) => re.test(q)).map(([, r]) => r),
  );

  const companyType: string[] = [];
  if (/\byc\b|y combinator|y-combinator/.test(q)) companyType.push("YC-backed");

  const exclusions: string[] = [];
  // "no crypto", "not crypto", "excluding crypto", "no web3"
  const exclMatch = q.match(
    /(?:no|not|exclud\w*|without|avoid)\s+([a-z0-9 ]+)/g,
  );
  if (exclMatch) {
    for (const m of exclMatch) {
      if (/crypto|web3/.test(m)) exclusions.push("crypto");
      if (/insurance|insurtech/.test(m)) exclusions.push("insurtech");
      if (/health/.test(m)) exclusions.push("healthtech");
    }
  }

  return {
    rawQuery: query,
    ...(industry.length ? { industry } : {}),
    ...(geography.length ? { geography: uniq(geography) } : {}),
    ...(stage.length ? { stage } : {}),
    ...(companyType.length ? { companyType } : {}),
    ...(roles.length ? { roles } : {}),
    ...(exclusions.length ? { exclusions: uniq(exclusions) } : {}),
  };
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
