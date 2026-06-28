/**
 * POST /v1/enrich — Brandon owns this (replaces Sasha's stub).
 * auth -> Zod-validate EnrichRequest -> enrich -> JSON.
 * Returns ingredients (recentContext + suggestedAngles), never finished prose.
 */

import { z } from "zod";
import { badRequest, guard, json } from "@/lib/http";
import { enrich } from "@/lib/enrich";
import type { EnrichResponse } from "@/lib/types";

const EnrichRequestSchema = z.object({
  personId: z.string().min(1, "personId is required"),
  confirmedHook: z.string().optional(),
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

  const parsed = EnrichRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join("; "));
  }

  const result = await enrich(parsed.data.personId, parsed.data.confirmedHook);
  const response: EnrichResponse & { primarySource: string } = {
    recentContext: result.recentContext,
    suggestedAngles: result.suggestedAngles,
    primarySource: result.primarySource,
  };

  return json(response);
}
