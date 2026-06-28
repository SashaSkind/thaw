// lib/coldreach.ts
// Outbound handoff to ColdReach. The service researches; ColdReach acts.
//
// We hand a chosen prospect (+ optional confirmed hook) to ColdReach's external
// draft endpoint. ColdReach does the 3-tone drafting and any (test-mode) send.
// We NEVER touch Gmail and NEVER write the final email prose here.

import type { ProspectPerson } from "@/lib/types";

const HANDOFF_TIMEOUT_MS = 5000;

export type ColdReachHandoffResult =
  | { ok: true; status: number }
  | { ok: false; reason: string; status?: number };

/**
 * Hand a prospect to ColdReach. MUST NEVER throw or block the demo flow:
 * unset URL / non-200 / timeout all degrade to a logged `{ ok: false, reason }` no-op.
 */
export async function sendToColdReach(
  prospect: ProspectPerson,
  hook?: string,
): Promise<ColdReachHandoffResult> {
  const url = process.env.COLDREACH_DRAFT_URL;
  if (!url) {
    console.warn(
      `[coldreach] COLDREACH_DRAFT_URL not set — handoff is a no-op (would have sent prospect ${prospect.id})`,
    );
    return { ok: false, reason: "COLDREACH_DRAFT_URL not configured" };
  }

  const payload = {
    contact: {
      name: prospect.name,
      title: prospect.title,
      company: prospect.company,
      email: prospect.email,
      linkedinUrl: prospect.linkedinUrl,
      xUrl: prospect.xUrl,
      channels: prospect.channels,
    },
    hooks: hook ? [hook] : [],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HANDOFF_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.COLDREACH_SHARED_SECRET
          ? { "x-service-secret": process.env.COLDREACH_SHARED_SECRET }
          : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[coldreach] handoff non-OK response: ${res.status}`);
      return { ok: false, reason: `non-OK response (${res.status})`, status: res.status };
    }

    return { ok: true, status: res.status };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    const reason = aborted
      ? `timed out after ${HANDOFF_TIMEOUT_MS}ms`
      : err instanceof Error
        ? err.message
        : "request failed";
    console.warn(`[coldreach] handoff failed (degrading to no-op): ${reason}`);
    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
  }
}
