// app/api/v1/enrich/route.ts  — STUB for Brandon
// Real auth + Zod validation, but returns realistic mock JSON matching the
// EnrichResponse contract so the demo UI / integration aren't blocked.
// TODO(Brandon): real impl (Fiber AI enrichment + recent context).

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSecret } from "@/lib/auth";
import type { EnrichResponse } from "@/lib/types";

const enrichRequestSchema = z.object({
  personId: z.string().min(1, "personId is required"),
  confirmedHook: z.string().optional(),
});

export async function POST(req: Request) {
  const unauthorized = requireSecret(req);
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = enrichRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const mock: EnrichResponse = {
    recentContext: [
      "Announced a Series B led by a top fintech investor (mock).",
      "Spoke on a panel about embedded finance last month (mock).",
    ],
    suggestedAngles: [
      "Reference their recent funding and tie it to scaling pains you solve.",
      "Lead with the shared YC connection, then a specific product observation.",
    ],
  };

  return NextResponse.json(mock);
}
