// GET /start?t=<jwt>
// Entry point for the ColdReach -> Thaw handoff. Server-verifies the token for a
// fast, clear error, then hands to a client bootstrapper that establishes the
// httpOnly session and routes into the discovery flow. (docs/integration.md §3.2)

import { verifyToken } from "@/lib/coldreach-integration";
import { StartClient } from "./StartClient";

function StartError({ message }: { message: string }) {
  return (
    <main className="shell">
      <div className="card">
        <h1>Couldn&apos;t start your session</h1>
        <p className="muted">{message}</p>
        <p className="faint">
          Please return to ColdReach and click &ldquo;Find prospects with
          Thaw&rdquo; again — handoff links expire after 15 minutes.
        </p>
      </div>
    </main>
  );
}

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = params.t;
  const token = Array.isArray(raw) ? raw[0] : raw;

  if (!token) {
    return <StartError message="This page requires a handoff token from ColdReach." />;
  }

  const identity = await verifyToken(token);
  if (!identity) {
    return <StartError message="This handoff link is invalid or has expired." />;
  }

  return <StartClient name={identity.name} />;
}
