// lib/hooks-fallback.ts
// NON-FIBER fallback for hook discovery. Brandon owns the Fiber path and the
// route wiring — this is only a standalone data path he can wire in if the
// Fiber spike fails. It satisfies the existing HookCandidate[] shape from
// lib/types.ts (which is NOT modified here).
//
// Sources are non-Fiber only: Apollo bio/headline fields (when APOLLO_API_KEY
// is present) and any real source snippets the caller passes in. OpenAI is used
// ONLY to extract hooks that are grounded in those sources. If sources are thin
// (or no OpenAI key), we return fewer hooks or none — NEVER a fabricated hook.

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { HookCandidate, ProspectPerson } from "@/lib/types";

export interface HookFallbackInput {
  person: ProspectPerson;
  /** Real source text the caller already has (e.g. news/post snippets). */
  extraSources?: string[];
}

const APOLLO_MATCH_URL = "https://api.apollo.io/api/v1/people/match";

/**
 * Gather non-Fiber source snippets for a prospect. Returns [] when nothing real
 * is available — callers must treat an empty result as "no hooks", not a cue to
 * invent one. Never throws.
 */
export async function gatherProspectSources(
  input: HookFallbackInput,
): Promise<string[]> {
  const sources: string[] = [...(input.extraSources ?? [])];

  const apolloBio = await fetchApolloBio(input.person);
  sources.push(...apolloBio);

  return sources
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function fetchApolloBio(person: ProspectPerson): Promise<string[]> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return [];

  try {
    const matchUrl = new URL(APOLLO_MATCH_URL);
    addApolloParam(matchUrl, "name", person.name);
    addApolloParam(matchUrl, "organization_name", person.company);
    addApolloParam(matchUrl, "linkedin_url", person.linkedinUrl);
    matchUrl.searchParams.set("reveal_personal_emails", "false");
    matchUrl.searchParams.set("reveal_phone_number", "false");

    const res = await fetch(matchUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        accept: "application/json",
        "X-Api-Key": apiKey,
      },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as { person?: Record<string, unknown> };
    const p = data.person ?? {};
    const snippets: string[] = [];
    for (const key of ["headline", "bio", "title"]) {
      const v = p[key];
      if (typeof v === "string" && v.trim()) snippets.push(`apollo:${key} — ${v.trim()}`);
    }
    return snippets;
  } catch (err) {
    console.warn(
      "[hooks-fallback] Apollo bio lookup failed (degrading):",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

function addApolloParam(url: URL, key: string, value?: string): void {
  const trimmed = value?.trim();
  if (trimmed) url.searchParams.set(key, trimmed);
}

const hookExtractionSchema = z.object({
  hooks: z
    .array(
      z.object({
        text: z.string(),
        source: z.string(),
      }),
    )
    .max(3),
});

const HOOK_SYSTEM_PROMPT =
  "You extract 2-3 short, specific cold-outreach hooks that are STRICTLY " +
  "grounded in the provided source snippets. Do NOT invent facts, companies, " +
  "events, or shared experiences. If the sources do not support a concrete " +
  "hook, return fewer hooks or an empty list. Each hook must cite the source " +
  "label (the text before ' — ') it was derived from. Hooks are conversation " +
  "openers, not finished email prose.";

/**
 * Produce non-Fiber HookCandidates for a prospect. Returns [] when sources are
 * thin or OpenAI is unavailable — never fabricates. Never throws.
 */
export async function generateHooksFallback(
  input: HookFallbackInput,
): Promise<HookCandidate[]> {
  const sources = await gatherProspectSources(input);

  if (sources.length === 0) {
    console.warn(
      `[hooks-fallback] no non-Fiber sources for ${input.person.id} — returning no hooks (not fabricating)`,
    );
    return [];
  }

  if (!process.env.OPENAI_API_KEY) {
    console.warn(
      "[hooks-fallback] OPENAI_API_KEY missing — cannot extract hooks from sources without fabricating; returning none",
    );
    return [];
  }

  try {
    const { object } = await generateObject({
      model: openai(process.env.OPENAI_MODEL || "gpt-4o-mini"),
      schema: hookExtractionSchema,
      system: HOOK_SYSTEM_PROMPT,
      prompt:
        `Prospect: ${input.person.name}, ${input.person.title} at ${input.person.company}.\n\n` +
        `Source snippets (each line is "label — text"):\n${sources.join("\n")}`,
    });

    return object.hooks.slice(0, 3).map((h, i) => ({
      id: `hook_fb_${input.person.id}_${i}`,
      text: h.text,
      source: h.source,
      needsUserConfirmation: true as const,
    }));
  } catch (err) {
    console.warn(
      "[hooks-fallback] extraction failed (degrading to no hooks):",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}
