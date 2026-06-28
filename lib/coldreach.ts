// lib/coldreach.ts
// Outbound handoff to ColdReach. The service researches; ColdReach acts.
//
// We hand a chosen prospect (+ optional confirmed hook) to ColdReach's external
// draft endpoint. ColdReach does the 3-tone drafting and any (test-mode) send.
// We NEVER touch Gmail and NEVER write the final email prose here.
//
// If ColdReach isn't configured/up, this degrades to a logged no-op so it can
// never break our demo.

import type { ProspectPerson } from "@/lib/types";

export interface ColdReachHandoffResult {
  delivered: boolean;
  reason?: string;
  status?: number;
}

export async function sendToColdReach(
  prospect: ProspectPerson,
  hook?: string,
): Promise<ColdReachHandoffResult> {
  const url = process.env.COLDREACH_DRAFT_URL;
  if (!url) {
    console.info(
      "[coldreach] COLDREACH_DRAFT_URL not set — handoff is a no-op (would have sent prospect %s)",
      prospect.id,
    );
    return { delivered: false, reason: "COLDREACH_DRAFT_URL not configured" };
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
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.warn(`[coldreach] handoff non-OK: ${res.status}`);
      return { delivered: false, reason: "non-OK response", status: res.status };
    }
    return { delivered: true, status: res.status };
  } catch (err) {
    console.warn(
      "[coldreach] handoff failed (degrading to no-op):",
      err instanceof Error ? err.message : err,
    );
    return {
      delivered: false,
      reason: err instanceof Error ? err.message : "request failed",
    };
  }
}
