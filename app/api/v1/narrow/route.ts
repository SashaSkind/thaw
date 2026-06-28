/**
 * POST /v1/narrow — stand-in for Sasha's endpoint.
 *
 * Returns REAL people only: live Fiber `peopleSearch` results for the goal plus a
 * verified real fintech cohort (never fabricated prospects). Response shape
 * matches `NarrowResponse`. Replace with Sasha's real endpoint when it lands.
 */

import { z } from "zod";
import { badRequest, guard, json } from "@/lib/http";
import { narrowPeople } from "@/lib/narrow";
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

  const result = await narrowPeople(parsed.data.goal);

  const response: NarrowResponse & { source: string; notes: string[] } = {
    intent: {
      goal: parsed.data.goal,
      understood: `Targeting people related to: ${parsed.data.goal}`,
    },
    companies: Array.from(
      new Set(result.people.map((p) => p.company).filter(Boolean)),
    ).map((name) => ({ name })),
    people: result.people,
    source: result.source,
    notes: result.notes,
  };

  return json(response);
}
