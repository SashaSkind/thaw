"use client";

// Client bootstrapper for /start. Reads the token from the URL, POSTs it to the
// session route (which verifies + sets the httpOnly cookie + returns the sender
// profile), stashes the profile in SESSION-ONLY storage (never a DB, never a
// URL), then routes into the discovery flow. (docs/integration.md §3.2)

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export const HANDOFF_SESSION_KEY = "thaw_handoff_session";

interface SessionResponse {
  ok: boolean;
  userId?: string;
  name?: string;
  profile?: unknown;
  profileWarning?: string | null;
  reason?: string;
}

export function StartClient({ name }: { name: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // run once (StrictMode double-invoke guard)
    started.current = true;

    // One-time handoff bootstrap; the error setState here is intentional.
    /* eslint-disable react-hooks/set-state-in-effect */
    const token = new URLSearchParams(window.location.search).get("t");
    if (!token) {
      setError("Missing handoff token.");
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/integration/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ t: token }),
        });
        const data = (await res.json()) as SessionResponse;
        if (!res.ok || !data.ok) {
          setError(data.reason ?? "Couldn't establish your session.");
          return;
        }
        // Session-only: cleared when the tab closes; never persisted to a DB.
        sessionStorage.setItem(
          HANDOFF_SESSION_KEY,
          JSON.stringify({
            userId: data.userId,
            name: data.name,
            profile: data.profile,
            profileWarning: data.profileWarning ?? null,
          }),
        );
        router.replace("/demo?handoff=1");
      } catch {
        setError("Network error while connecting to ColdReach.");
      }
    })();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [router]);

  if (error) {
    return (
      <main className="shell">
        <div className="card">
          <h1>Couldn&apos;t start your session</h1>
          <p className="muted">{error}</p>
          <p className="faint">
            Return to ColdReach and try the handoff again.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="card">
        <h1>Welcome{name ? `, ${name.split(" ")[0]}` : ""} 👋</h1>
        <p className="muted">
          <span className="spinner" /> Connecting you from ColdReach…
        </p>
      </div>
    </main>
  );
}
