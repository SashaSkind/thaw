// lib/coldreach-integration.ts
// Thaw side of the Thaw <-> ColdReach handoff (see docs/integration.md §2-§3).
//
// SERVER-ONLY. Uses INTEGRATION_SHARED_SECRET (HS256) + COLDREACH_URL. Holds the
// signed handoff token (identity only) — NEVER Gmail credentials/tokens. Every
// network call degrades gracefully (timeout + try/catch) and returns a typed
// result; it never throws to a blank screen.

import { jwtVerify } from "jose";

const REQUEST_TIMEOUT_MS = 8000;

// ---- shared contract shapes (match docs/integration.md §2 exactly) ----

export interface HandoffIdentity {
  userId: string;
  name: string;
}

export interface SenderProfile {
  userId: string;
  name: string;
  resumeText: string;
  comments: string;
  emailClosing: string;
}

export type DraftChannel = "email" | "linkedin" | "x";

export interface PendingDraftContact {
  name: string;
  email?: string;
  company: string;
  title: string;
  linkedinUrl?: string;
  xUrl?: string;
}

export interface PendingDraftInput {
  contact: PendingDraftContact;
  channel: DraftChannel;
  subject?: string; // present when channel === "email"
  body: string; // FINISHED text, closing included
}

export type Result<T> =
  | ({ ok: true } & T)
  | { ok: false; reason: string };

function coldreachBaseUrl(): string | null {
  const url = process.env.COLDREACH_URL?.trim();
  return url ? url.replace(/\/$/, "") : null;
}

function secretKey(): Uint8Array | null {
  const secret = process.env.INTEGRATION_SHARED_SECRET?.trim();
  return secret ? new TextEncoder().encode(secret) : null;
}

/**
 * Verify + decode the handoff JWT (HS256, INTEGRATION_SHARED_SECRET).
 * Returns the identity on success, or null on any failure (bad sig, expired,
 * missing secret). ColdReach remains the authority and re-verifies server-side.
 */
export async function verifyToken(jwt: string): Promise<HandoffIdentity | null> {
  const key = secretKey();
  if (!key || !jwt) return null;

  try {
    const { payload } = await jwtVerify(jwt, key, { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return {
      userId: String(payload.sub),
      name: typeof payload.name === "string" ? payload.name : "",
    };
  } catch {
    return null;
  }
}

/** GET ColdReach /api/external/profile with the bearer token. Never throws. */
export async function fetchSenderProfile(
  jwt: string,
): Promise<Result<{ profile: SenderProfile }>> {
  const base = coldreachBaseUrl();
  if (!base) {
    return { ok: false, reason: "COLDREACH_URL not configured" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/api/external/profile`, {
      method: "GET",
      headers: { authorization: `Bearer ${jwt}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, reason: `ColdReach profile responded ${res.status}` };
    }
    const data = (await res.json()) as Partial<SenderProfile>;
    return {
      ok: true,
      profile: {
        userId: String(data.userId ?? ""),
        name: String(data.name ?? ""),
        resumeText: String(data.resumeText ?? ""),
        comments: String(data.comments ?? ""),
        emailClosing: String(data.emailClosing ?? ""),
      },
    };
  } catch (err) {
    return {
      ok: false,
      reason: aborted(err)
        ? `ColdReach profile timed out after ${REQUEST_TIMEOUT_MS}ms`
        : `ColdReach profile request failed: ${message(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST the FINISHED draft to ColdReach /api/external/pending-draft. ColdReach
 * STORES it (keyed to the user) and returns a deep link back to the draft. This
 * call never sends — the send fires when the user clicks Send in their own
 * authenticated ColdReach session. Never throws.
 */
export async function postPendingDraft(
  jwt: string,
  draft: PendingDraftInput,
): Promise<Result<{ draftId: string; deepLink: string }>> {
  const base = coldreachBaseUrl();
  if (!base) {
    return { ok: false, reason: "COLDREACH_URL not configured" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/api/external/pending-draft`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify(draft),
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        ok: false,
        reason: `ColdReach pending-draft responded ${res.status}`,
      };
    }
    const data = (await res.json()) as { draftId?: string; deepLink?: string };
    if (!data.deepLink) {
      return { ok: false, reason: "ColdReach did not return a deepLink" };
    }
    return {
      ok: true,
      draftId: String(data.draftId ?? ""),
      deepLink: data.deepLink,
    };
  } catch (err) {
    return {
      ok: false,
      reason: aborted(err)
        ? `ColdReach pending-draft timed out after ${REQUEST_TIMEOUT_MS}ms`
        : `ColdReach pending-draft request failed: ${message(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

function aborted(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}
function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
