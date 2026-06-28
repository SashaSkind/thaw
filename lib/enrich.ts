/**
 * Enrichment (Task 2).
 *
 * OWNER: Brandon. `enrich(personId, confirmedHook?)` returns INGREDIENTS, not
 * prose (§9): a few real recent-context snippets plus 2-3 outreach angles that
 * ColdReach's drafting can use. Angles incorporate the user-confirmed hook when
 * present, and degrade to grounded fallback when Fiber/OpenAI are unavailable.
 */

import { generateAngles } from "@/lib/ai";
import { gatherContext } from "@/lib/context";
import type { EnrichResponse } from "@/lib/types";

export interface EnrichResult extends EnrichResponse {
  primarySource: "fiber" | "fallback";
}

export async function enrich(
  personId: string,
  confirmedHook?: string,
): Promise<EnrichResult> {
  const context = await gatherContext(personId);

  // recentContext: a handful of real snippets (deduped, capped).
  const recentContext = Array.from(
    new Set(context.signals.map((s) => s.text)),
  ).slice(0, 4);

  const suggestedAngles = await generateAngles(context.signals, confirmedHook);

  return {
    recentContext,
    suggestedAngles,
    primarySource: context.primarySource,
  };
}
