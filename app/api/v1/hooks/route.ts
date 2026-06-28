// app/api/v1/hooks/route.ts  — STUB for Brandon
// Real auth + Zod validation, but returns realistic mock JSON matching the
// HooksResponse contract so the demo UI / integration aren't blocked.
// TODO(Brandon): real impl (Fiber AI hook discovery).

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSecret } from "@/lib/auth";
import type { HooksResponse } from "@/lib/types";

const hooksRequestSchema = z.object({
  personId: z.string().min(1, "personId is required"),
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

  const parsed = hooksRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const mock: HooksResponse = {
    hooks: [
      {
        id: "hook_mock_1",
        text: "Also went through YC — congrats on the recent Series B.",
        source: "mock:company_news",
        needsUserConfirmation: true,
      },
      {
        id: "hook_mock_2",
        text: "Loved your recent post on payments fraud tooling.",
        source: "mock:linkedin_post",
        needsUserConfirmation: true,
      },
    ],
  };

  return NextResponse.json(mock);
}
