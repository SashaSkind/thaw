// POST /api/integration/session
// Establishes the short-lived Thaw handoff session: verify the JWT, fetch the
// sender profile from ColdReach, and stash the token in an httpOnly session
// cookie (kept off client JS). Returns the decoded identity + profile for the
// client to hold in session-only state. Never persists PII server-side.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  fetchSenderProfile,
  verifyToken,
  type SenderProfile,
} from "@/lib/coldreach-integration";

export const HANDOFF_COOKIE = "thaw_handoff";

export async function POST(request: Request) {
  let token = "";
  try {
    const body = (await request.json()) as { t?: unknown };
    token = typeof body.t === "string" ? body.t : "";
  } catch {
    return NextResponse.json(
      { ok: false, reason: "Invalid request body." },
      { status: 400 },
    );
  }

  const identity = await verifyToken(token);
  if (!identity) {
    return NextResponse.json(
      { ok: false, reason: "Invalid or expired handoff token." },
      { status: 401 },
    );
  }

  // Token is valid -> establish the httpOnly session cookie (session-scoped).
  const jar = await cookies();
  jar.set(HANDOFF_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  // Fetch sender context. If ColdReach is unreachable, degrade to a minimal
  // fallback profile (name from the token) and surface a non-blocking warning.
  const result = await fetchSenderProfile(token);
  let profile: SenderProfile;
  let profileWarning: string | null = null;
  if (result.ok) {
    profile = result.profile;
  } else {
    profile = {
      userId: identity.userId,
      name: identity.name,
      resumeText: "",
      comments: "",
      emailClosing: "",
    };
    profileWarning = `Couldn't load sender context from ColdReach (${result.reason}). Using a minimal profile.`;
  }

  return NextResponse.json({
    ok: true,
    userId: identity.userId,
    name: identity.name,
    profile,
    profileWarning,
  });
}
