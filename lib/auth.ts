// lib/auth.ts
// Single shared-secret auth for every endpoint. The service holds no
// user-owned data, so a shared header secret is sufficient (see AGENTS.md §2).

import { NextResponse } from "next/server";

const HEADER = "x-service-secret";

/**
 * Verify the shared-secret header. Call this FIRST in every route handler.
 *
 * Returns a 401 `NextResponse` when the request is unauthorized (the caller
 * should return it immediately), or `null` when the request is authorized.
 */
export function requireSecret(req: Request): NextResponse | null {
  const expected = process.env.SERVICE_SHARED_SECRET;

  if (!expected) {
    // Misconfiguration: refuse rather than silently allowing everything.
    return NextResponse.json(
      { error: "Service secret is not configured." },
      { status: 401 },
    );
  }

  const provided = req.headers.get(HEADER);
  if (!provided || provided !== expected) {
    return NextResponse.json(
      { error: "Unauthorized: missing or invalid x-service-secret header." },
      { status: 401 },
    );
  }

  return null;
}
