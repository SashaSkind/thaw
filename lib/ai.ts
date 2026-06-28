/**
 * OpenAI reasoning wrapper (hook extraction + angle generation).
 *
 * OWNER: Brandon. Uses the Vercel AI SDK + OpenAI when `OPENAI_API_KEY` is set;
 * otherwise falls back to a deterministic, grounded heuristic so the demo runs
 * with zero keys. Critical guardrail (§9): we NEVER fabricate hooks. Both the
 * model path and the fallback path only surface text grounded in the supplied
 * context signals, and every hook carries the `source` it came from.
 */

import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

export interface ContextSignal {
  text: string;
  source: string;
}

export interface RawHook {
  text: string;
  source: string;
}

function openaiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

const SCHOOLS = [
  "NYU",
  "Columbia",
  "Carnegie Mellon",
  "CMU",
  "UT Austin",
  "TU Berlin",
  "Stanford",
  "MIT",
  "Harvard",
  "Berkeley",
];

const PLACES = [
  "Queens",
  "Brooklyn",
  "Manhattan",
  "Austin",
  "San Francisco",
  "New York",
  "Berlin",
  "Boston",
  "Chicago",
];

function truncate(text: string, words = 12): string {
  const parts = text.split(/\s+/);
  if (parts.length <= words) return text;
  return `${parts.slice(0, words).join(" ")}…`;
}

/**
 * Deterministic, grounded fallback. Scans the context signals for shared-ground
 * cues (school, place) and recent-topic cues, and proposes short candidate hooks
 * that always trace back to a real signal source.
 */
function heuristicHooks(signals: ContextSignal[]): RawHook[] {
  const hooks: RawHook[] = [];
  const seen = new Set<string>();

  const add = (text: string, source: string) => {
    const key = text.toLowerCase();
    if (!text || seen.has(key)) return;
    seen.add(key);
    hooks.push({ text, source });
  };

  for (const signal of signals) {
    for (const school of SCHOOLS) {
      if (signal.text.includes(school)) add(`${school} alum`, signal.source);
    }
    for (const place of PLACES) {
      if (signal.text.includes(place)) add(`Connection to ${place}`, signal.source);
    }
  }

  // Recent-topic hooks from post/news style signals.
  for (const signal of signals) {
    if (/post|news/i.test(signal.source)) {
      add(`Recently posted: "${truncate(signal.text)}"`, signal.source);
    }
    if (hooks.length >= 5) break;
  }

  return hooks.slice(0, 5);
}

export async function extractHooks(signals: ContextSignal[]): Promise<RawHook[]> {
  if (signals.length === 0) return [];

  if (!openaiConfigured()) {
    return heuristicHooks(signals);
  }

  try {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: z.object({
        hooks: z
          .array(
            z.object({
              text: z
                .string()
                .describe("A short, specific hook (max ~8 words). No prose."),
              sourceIndex: z
                .number()
                .int()
                .describe("Index into the provided signals this hook is grounded in."),
            }),
          )
          .max(5),
      }),
      system:
        "You extract candidate outreach hooks (shared hometown, school, mutual interest, " +
        "a recent post topic) from a person's public context. Rules: ground every hook in " +
        "exactly one provided signal; NEVER invent facts; if context is thin, return fewer or " +
        "none. Hooks are short fragments, not sentences.",
      prompt:
        "Signals (index: text):\n" +
        signals.map((s, i) => `${i}: ${s.text}`).join("\n") +
        "\n\nReturn up to 5 grounded candidate hooks.",
    });

    return object.hooks
      .filter((h) => h.sourceIndex >= 0 && h.sourceIndex < signals.length)
      .map((h) => ({ text: h.text, source: signals[h.sourceIndex].source }));
  } catch {
    // Any model/network failure -> deterministic fallback (demo must not break).
    return heuristicHooks(signals);
  }
}

function heuristicAngles(signals: ContextSignal[], confirmedHook?: string): string[] {
  const angles: string[] = [];
  if (confirmedHook) {
    angles.push(`Open with the shared context: "${confirmedHook}", then bridge to why you're reaching out.`);
  }
  const topic = signals.find((s) => /post|news/i.test(s.source));
  if (topic) {
    angles.push(`Reference their recent take — "${truncate(topic.text)}" — and tie it to the value you offer.`);
  }
  angles.push("Lead with a specific, relevant outcome for their role; keep it to one ask.");
  return angles.slice(0, 3);
}

export async function generateAngles(
  signals: ContextSignal[],
  confirmedHook?: string,
): Promise<string[]> {
  if (!openaiConfigured()) {
    return heuristicAngles(signals, confirmedHook);
  }

  try {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: z.object({ angles: z.array(z.string()).min(1).max(3) }),
      system:
        "You produce outreach ANGLES (ingredients for a message), never finished prose. " +
        "Each angle is one concise sentence describing what to say and why it resonates. " +
        "Ground angles in the provided context and the confirmed hook if present.",
      prompt:
        (confirmedHook ? `Confirmed hook: ${confirmedHook}\n\n` : "") +
        "Context:\n" +
        signals.map((s) => `- ${s.text}`).join("\n") +
        "\n\nReturn 2-3 angles.",
    });
    return object.angles.slice(0, 3);
  } catch {
    return heuristicAngles(signals, confirmedHook);
  }
}
