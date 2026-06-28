import Link from "next/link";

export default function Home() {
  return (
    <main className="shell">
      <div className="topbar">
        <div className="brand">
          <span className="brand-dot" />
          <div>
            ColdReach Intelligence
            <small>prospect discovery layer</small>
          </div>
        </div>
      </div>

      <div className="card">
        <h1>Find the right person, then a real hook.</h1>
        <p className="muted">
          ColdReach knows <i>how</i> to write the email. This service finds{" "}
          <i>who</i> to reach and a genuine human hook — same hometown, shared
          school, a recent post — then hands off to ColdReach&apos;s drafting.
        </p>

        <div className="hero-points">
          <div className="pt">
            <b>Broad goal → ranked people.</b>{" "}
            <span className="muted">
              Describe who you want to reach; get specific, ranked candidates.
            </span>
          </div>
          <div className="pt">
            <b>Human-in-the-loop hooks.</b>{" "}
            <span className="muted">
              The service proposes hooks; you confirm the real one. Never
              auto-injected.
            </span>
          </div>
          <div className="pt">
            <b>Ingredients, not prose.</b>{" "}
            <span className="muted">
              Returns recent context + angles. ColdReach drafts and sends.
            </span>
          </div>
        </div>

        <div className="row">
          <Link className="btn" href="/demo">
            Launch the demo →
          </Link>
        </div>
      </div>
    </main>
  );
}
