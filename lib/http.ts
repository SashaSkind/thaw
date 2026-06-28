/**
 * Tiny HTTP helpers shared by the thin `/v1` route handlers.
 * OWNER: Brandon (stand-in until Sasha's spine lands).
 */

import { authorize } from "@/lib/auth";

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function unauthorized(reason: string): Response {
  return json({ error: "unauthorized", reason }, 401);
}

export function badRequest(reason: string): Response {
  return json({ error: "bad_request", reason }, 400);
}

/** Returns a Response to short-circuit with, or null when authorized. */
export function guard(request: Request): Response | null {
  const result = authorize(request);
  if (!result.ok) return unauthorized(result.reason ?? "unauthorized");
  return null;
}
