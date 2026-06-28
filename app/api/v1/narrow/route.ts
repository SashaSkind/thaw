/**
 * POST /v1/narrow — MOCK (Sasha owns the real one).
 *
 * STATUS: local stand-in per AGENTS.md ("mock its response if Sasha hasn't
 * pushed yet"). Returns ranked curated people so Brandon's demo UI has data to
 * render. Replace with Sasha's real endpoint when it lands — the response shape
 * already matches `NarrowResponse`.
 */

import { z } from "zod";
import { badRequest, guard, json } from "@/lib/http";
import { rankCuratedPeople } from "@/lib/mock-data";
import type { NarrowResponse } from "@/lib/types";

const NarrowRequestSchema = z.object({
  goal: z.string().min(1, "goal is required"),
});

export async function POST(request: Request): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("invalid JSON body");
  }

  const parsed = NarrowRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join("; "));
  }

  const people = rankCuratedPeople(parsed.data.goal);

  const response: NarrowResponse = {
    intent: {
      goal: parsed.data.goal,
      understood: `Targeting people related to: ${parsed.data.goal}`,
    },
    companies: Array.from(new Set(people.map((p) => p.company))).map((name) => ({
      name,
    })),
    people,
  };

  return json(response);
}
