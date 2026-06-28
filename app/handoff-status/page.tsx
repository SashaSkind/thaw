// /handoff-status — preview + future target route for handoff failure UX.
//
// Renders a HandoffStatus variant from ?state=. This is an ADDITIVE surface; it
// is intentionally NOT wired into the working /start flow on this branch (that
// would require editing app/start, which is out of scope here). Once wiring is
// in scope, the handoff flow can redirect here, e.g.
//   /handoff-status?state=token-expired
//   /handoff-status?state=coldreach-unreachable&detail=<reason>

import Link from "next/link";
import { HandoffStatus, type HandoffStatusVariant } from "./HandoffStatus";

const VARIANTS: HandoffStatusVariant[] = [
  "coldreach-unreachable",
  "token-expired",
  "error",
];

function isVariant(v: string | undefined): v is HandoffStatusVariant {
  return Boolean(v) && (VARIANTS as string[]).includes(v as string);
}

export default async function HandoffStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; detail?: string }>;
}) {
  const { state, detail } = await searchParams;

  if (isVariant(state)) {
    return <HandoffStatus variant={state} detail={detail} />;
  }

  // No/unknown state -> a small index so the states are browsable/previewable.
  return (
    <main className="shell">
      <div className="card">
        <h1>Handoff status screens</h1>
        <p className="muted">
          Failure-UX states for the ColdReach → Thaw handoff. Append{" "}
          <code>?state=</code> to preview each:
        </p>
        <ul className="list">
          {VARIANTS.map((v) => (
            <li key={v}>
              <Link href={`/handoff-status?state=${v}`}>{v}</Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
