// POST /api/integration/pending-draft
// Proxies a FINISHED draft to ColdReach using the httpOnly handoff token (read
// from the session cookie, never from the client). ColdReach STORES the draft
// and returns a deep link back; the actual send happens in the user's own
// authenticated ColdReach session. This route never sends and never sees Gmail.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  postPendingDraft,
  verifyToken,
  type PendingDraftInput,
} from "@/lib/coldreach-integration";
import { HANDOFF_COOKIE } from "../session/route";

const pendingDraftSchema = z.object({
  contact: z.object({
    name: z.string().min(1),
    email: z.string().optional(),
    company: z.string(),
    title: z.string(),
    linkedinUrl: z.string().optional(),
    xUrl: z.string().optional(),
  }),
  channel: z.enum(["email", "linkedin", "x"]),
  subject: z.string().optional(),
  body: z.string().min(1),
});

export async function POST(request: Request) {
  const jar = await cookies();
  const token = jar.get(HANDOFF_COOKIE)?.value;
  if (!token || !(await verifyToken(token))) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          "No active ColdReach handoff session. Start from ColdReach (\u201cFind prospects with Thaw\u201d) to enable Send.",
      },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const parsed = pendingDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, reason: "Invalid draft payload.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await postPendingDraft(token, parsed.data as PendingDraftInput);
  if (!result.ok) {
    // Graceful: ColdReach unreachable -> clear message, no blank screen.
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    draftId: result.draftId,
    deepLink: result.deepLink,
  });
}
