// lib/auth.ts
// Single shared-secret auth for every /v1 endpoint (see AGENTS.md §2).
//
// Two call styles are supported so both slices share one source of truth:
//   - Sasha's /v1/narrow uses `requireSecret(req)` -> NextResponse | null
//   - Brandon's /v1/hooks, /v1/enrich, /api/demo/stream use `authorize(req)`
//     (via lib/http.ts `guard`) -> { ok, reason }
//
// Demo behavior: when SERVICE_SHARED_SECRET is unset the service runs in OPEN
// mode (auth skipped) so the local demo UI can call its own endpoints with zero
// configuration. Set the secret to require the `x-service-secret` header
// (matches production).

import { NextResponse } from "next/server";

const SECRET_HEADER = "x-service-secret";

export interface AuthResult {
  ok: boolean;
  reason?: string;
}

export function isAuthEnforced(): boolean {
  return Boolean(process.env.SERVICE_SHARED_SECRET?.trim());
}

export function authorize(request: Request): AuthResult {
  const expected = process.env.SERVICE_SHARED_SECRET?.trim();

  // No secret configured -> open demo mode.
  if (!expected) {
    return { ok: true };
  }

  const provided = request.headers.get(SECRET_HEADER)?.trim();
  if (!provided) {
    return { ok: false, reason: `Missing ${SECRET_HEADER} header` };
  }
  if (provided !== expected) {
    return { ok: false, reason: "Invalid shared secret" };
  }
  return { ok: true };
}

/**
 * Sasha-style helper for /v1/narrow. Returns a 401 `NextResponse` when the
 * request is unauthorized (the caller should return it immediately), or `null`
 * when authorized. Shares behavior with `authorize` (open mode when unset).
 */
export function requireSecret(req: Request): NextResponse | null {
  const result = authorize(req);
  if (result.ok) return null;
  return NextResponse.json(
    { error: `Unauthorized: ${result.reason}` },
    { status: 401 },
  );
}
