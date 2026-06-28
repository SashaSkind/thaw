// lib/enrich-fallback.ts
// NON-FIBER fallback for enrichment. Brandon owns the Fiber path and the route
// wiring — this is only a standalone data path he can wire in if the Fiber
// spike fails. It satisfies the existing EnrichResponse shape from lib/types.ts
// (which is NOT modified here).
//
// recentContext comes straight from real non-Fiber source snippets; angles are
// INGREDIENTS (not finished prose) extracted by OpenAI from those same sources.
// Thin sources / no OpenAI key => empty arrays. Never fabricates, never throws.

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { EnrichResponse, ProspectPerson } from "@/lib/types";
import {
  gatherProspectSources,
  type HookFallbackInput,
} from "@/lib/hooks-fallback";

export interface EnrichFallbackInput {
  person: ProspectPerson;
  /** Real source text the caller already has (e.g. news/post snippets). */
  extraSources?: string[];
  confirmedHook?: string;
}

const anglesSchema = z.object({
  suggestedAngles: z.array(z.string()).max(4),
});

const ANGLES_SYSTEM_PROMPT =
  "You suggest 2-4 outreach ANGLES (ingredients for a drafting step, not " +
  "finished email prose) STRICTLY grounded in the provided source snippets. " +
  "Do NOT invent facts. If the sources don't support a specific angle, return " +
  "fewer or none. Keep each angle to one short phrase.";

/**
 * Produce non-Fiber EnrichResponse for a prospect. recentContext is the raw
 * real sources; suggestedAngles are extracted from them. Empty arrays when
 * sources are thin or OpenAI is unavailable. Never fabricates, never throws.
 */
export async function generateEnrichFallback(
  input: EnrichFallbackInput,
): Promise<EnrichResponse> {
  const hookInput: HookFallbackInput = {
    person: input.person,
    extraSources: input.extraSources,
  };
  const sources = await gatherProspectSources(hookInput);

  const recentContext = sources;

  if (sources.length === 0 || !process.env.OPENAI_API_KEY) {
    if (sources.length === 0) {
      console.warn(
        `[enrich-fallback] no non-Fiber sources for ${input.person.id} — empty enrichment (not fabricating)`,
      );
    } else {
      console.warn(
        "[enrich-fallback] OPENAI_API_KEY missing — returning context only, no angles",
      );
    }
    return { recentContext, suggestedAngles: [] };
  }

  try {
    const { object } = await generateObject({
      model: openai(process.env.OPENAI_MODEL || "gpt-4o-mini"),
      schema: anglesSchema,
      system: ANGLES_SYSTEM_PROMPT,
      prompt:
        `Prospect: ${input.person.name}, ${input.person.title} at ${input.person.company}.\n` +
        (input.confirmedHook ? `Confirmed hook: ${input.confirmedHook}\n` : "") +
        `\nSource snippets (each line is "label — text"):\n${sources.join("\n")}`,
    });

    return { recentContext, suggestedAngles: object.suggestedAngles.slice(0, 4) };
  } catch (err) {
    console.warn(
      "[enrich-fallback] angle extraction failed (degrading to context only):",
      err instanceof Error ? err.message : err,
    );
    return { recentContext, suggestedAngles: [] };
  }
}
