/**
 * Email send bridge for the demo email page.
 * If COLDREACH_SEND_URL is configured, forwards the final email to that service;
 * otherwise records a demo-safe send result without pretending Gmail was used.
 */

import { z } from "zod";
import { badRequest, json } from "@/lib/http";

const sendEmailSchema = z.object({
  to: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  channel: z.enum(["email", "linkedin", "x"]),
  person: z.object({
    id: z.string(),
    name: z.string(),
    company: z.string(),
  }),
});

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("invalid JSON body");
  }

  const parsed = sendEmailSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
  }

  const sendUrl = process.env.COLDREACH_SEND_URL?.trim();
  if (!sendUrl) {
    return json({
      ok: true,
      mode: "demo",
      reason: "COLDREACH_SEND_URL not configured",
    });
  }

  try {
    const response = await fetch(sendUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.COLDREACH_SHARED_SECRET
          ? { "x-service-secret": process.env.COLDREACH_SHARED_SECRET }
          : {}),
      },
      body: JSON.stringify(parsed.data),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return json(
        {
          ok: false,
          mode: "demo",
          reason: `send service returned ${response.status}`,
        },
        502,
      );
    }

    return json({ ok: true, mode: "sent" });
  } catch (error) {
    return json(
      {
        ok: false,
        mode: "demo",
        reason: error instanceof Error ? error.message : "send failed",
      },
      502,
    );
  }
}
