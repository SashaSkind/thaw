/**
 * Hook discovery (Task 1).
 *
 * OWNER: Brandon. `findHooks(personId)` resolves the person, gathers context
 * (Fiber primary -> news/Apollo/curated fallback), and uses the reasoning layer
 * to extract 3-5 GROUNDED candidate hooks. Hard rules (§9):
 *   - NEVER fabricate: every hook traces to a real signal `source`.
 *   - If context is thin, return fewer or none (the UI lets the user add their own).
 *   - Every candidate is `needsUserConfirmation: true` — the service proposes,
 *     the human confirms (anti-hallucination).
 */

import { extractHooks } from "@/lib/ai";
import { gatherContext } from "@/lib/context";
import { generateId } from "ai";
import type { HookCandidate } from "@/lib/types";

export interface FindHooksResult {
  hooks: HookCandidate[];
  primarySource: "fiber" | "fallback";
  notes: string[];
}

export async function findHooks(personId: string): Promise<FindHooksResult> {
  const context = await gatherContext(personId);
  const raw = await extractHooks(context.signals);

  const hooks: HookCandidate[] = raw.slice(0, 5).map((hook) => ({
    id: generateId(),
    text: hook.text,
    source: hook.source,
    needsUserConfirmation: true,
  }));

  return { hooks, primarySource: context.primarySource, notes: context.notes };
}
