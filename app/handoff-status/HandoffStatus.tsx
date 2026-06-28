"use client";

// Failure-UX surfaces for the ColdReach -> Thaw handoff. ADDITIVE + standalone:
// these are presentational components only and are NOT wired into the working
// /start flow (editing app/start is out of scope for this branch). A future
// change can render <HandoffStatus> (or redirect to /handoff-status?state=...)
// from the handoff flow once that wiring is in scope.

import { useState } from "react";

export type HandoffStatusVariant =
  | "coldreach-unreachable"
  | "token-expired"
  | "error";

interface Copy {
  emoji: string;
  title: string;
  message: string;
  hint: string;
  retryLabel: string;
}

const COPY: Record<HandoffStatusVariant, Copy> = {
  "coldreach-unreachable": {
    emoji: "🔌",
    title: "Can’t reach ColdReach",
    message:
      "We couldn’t reach ColdReach to load your sender details or hand off your draft. This is usually temporary.",
    hint: "Your work isn’t lost — try again in a moment.",
    retryLabel: "Try again",
  },
  "token-expired": {
    emoji: "⏳",
    title: "Your handoff link expired",
    message:
      "For security, handoff links from ColdReach expire 15 minutes after they’re created.",
    hint: "Return to ColdReach and click “Find prospects with Thaw” again to get a fresh link.",
    retryLabel: "Start a new handoff",
  },
  error: {
    emoji: "⚠️",
    title: "Something went wrong",
    message: "We hit an unexpected error starting your session.",
    hint: "Try again, or head back to ColdReach and re-launch Thaw.",
    retryLabel: "Try again",
  },
};

export function HandoffStatus({
  variant,
  detail,
  retryHref,
}: {
  variant: HandoffStatusVariant;
  /** Optional technical detail (e.g. the failure reason) shown subtly. */
  detail?: string;
  /** If set, Retry navigates here; otherwise Retry reloads the page. */
  retryHref?: string;
}) {
  const copy = COPY[variant] ?? COPY.error;
  const [retrying, setRetrying] = useState(false);

  const handleRetry = () => {
    setRetrying(true);
    if (retryHref) {
      window.location.assign(retryHref);
    } else {
      window.location.reload();
    }
  };

  return (
    <main className="shell">
      <div className="card">
        <h1>
          <span aria-hidden style={{ marginRight: 8 }}>
            {copy.emoji}
          </span>
          {copy.title}
        </h1>
        <p className="muted">{copy.message}</p>
        <div className="banner">
          <span className="dot" />
          {copy.hint}
        </div>
        {detail && (
          <p className="faint" style={{ marginTop: 10 }}>
            Details: {detail}
          </p>
        )}
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn" onClick={handleRetry} disabled={retrying}>
            {retrying ? "…" : copy.retryLabel}
          </button>
        </div>
      </div>
    </main>
  );
}
