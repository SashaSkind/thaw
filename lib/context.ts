/**
 * Context gathering: Fiber-primary, then news/Apollo/curated fallback.
 *
 * OWNER: Brandon. Single source of truth for "what do we know about this person"
 * so both `/v1/hooks` and `/v1/enrich` share identical fallback behavior (§6).
 * Order: Fiber recent posts -> Apollo bio -> curated dataset signals. The demo
 * always has the curated layer, so context is never empty for a known person.
 */

import { getBio } from "@/lib/apollo";
import { getRecentPosts, type FiberPerson } from "@/lib/fiber";
import { getCuratedPerson } from "@/lib/mock-data";
import type { ContextSignal } from "@/lib/ai";

export interface GatheredContext {
  signals: ContextSignal[];
  /** Which source carried the context, for honest UI/debug display. */
  primarySource: "fiber" | "fallback";
  notes: string[];
}

export async function gatherContext(personId: string): Promise<GatheredContext> {
  const person = getCuratedPerson(personId);
  const notes: string[] = [];

  // Build the Fiber person handle from whatever we know (curated record here).
  const fiberPerson: FiberPerson | null = person
    ? {
        name: person.name,
        company: person.company,
        linkedinUrl: person.linkedinUrl,
        xUrl: person.xUrl,
      }
    : null;

  // 1) Fiber recent posts (primary).
  if (fiberPerson) {
    const posts = await getRecentPosts(fiberPerson);
    if (posts.available && posts.data.length > 0) {
      return {
        signals: posts.data.map((p) => ({
          text: p.text,
          source: `${p.platform} post (fiber)`,
        })),
        primarySource: "fiber",
        notes: ["Live social via Fiber."],
      };
    }
    if (posts.reason) notes.push(`Fiber: ${posts.reason}`);
  }

  // 2) Fallback: Apollo bio + curated dataset signals.
  const signals: ContextSignal[] = [];

  if (fiberPerson) {
    const apollo = await getBio(fiberPerson);
    if (apollo.available && apollo.data) {
      if (apollo.data.headline)
        signals.push({ text: apollo.data.headline, source: "apollo headline" });
      if (apollo.data.bio)
        signals.push({ text: apollo.data.bio, source: "apollo bio" });
    } else if (apollo.reason) {
      notes.push(`Apollo: ${apollo.reason}`);
    }
  }

  if (person) {
    signals.push({ text: person.context.bio, source: "curated dataset bio" });
    for (const signal of person.context.signals) {
      signals.push({ text: signal.text, source: signal.source });
    }
  }

  return { signals, primarySource: "fallback", notes };
}
