// app/api/v1/narrow/route.ts  — SASHA owns (real)
// POST -> requireSecret -> Zod validate -> narrow() -> JSON.

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSecret } from "@/lib/auth";
import { narrow } from "@/lib/narrow";
import type { NarrowRequest } from "@/lib/types";

const narrowRequestSchema = z.object({
  query: z.string().min(1, "query is required"),
  userBackground: z.string().optional(),
  limit: z.number().int().positive().max(50).optional(),
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

  const parsed = narrowRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await narrow(parsed.data as NarrowRequest);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/v1/narrow] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal error while narrowing prospects." },
      { status: 500 },
    );
  }
}
