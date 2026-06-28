/**
 * POST /v1/hooks — Brandon owns this (replaces Sasha's stub).
 * auth -> Zod-validate HooksRequest -> findHooks -> JSON.
 */

import { z } from "zod";
import { badRequest, guard, json } from "@/lib/http";
import { findHooks } from "@/lib/hooks";
import type { HooksResponse } from "@/lib/types";

const HooksRequestSchema = z.object({
  personId: z.string().min(1, "personId is required"),
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

  const parsed = HooksRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join("; "));
  }

  const result = await findHooks(parsed.data.personId);
  const response: HooksResponse & { primarySource: string; notes: string[] } = {
    hooks: result.hooks,
    primarySource: result.primarySource,
    notes: result.notes,
  };

  return json(response);
}
