// Minimal service index. The real demo UI is Brandon's separate, disposable
// app (see AGENTS.md §9 — no UI in this repo). This is just a human-readable
// status page for the stateless intelligence service.

export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "48px auto", padding: "0 20px", lineHeight: 1.5 }}>
      <h1>ColdReach Intelligence Service</h1>
      <p>
        Stateless prospect-discovery layer. It researches; ColdReach acts. All
        endpoints are versioned and require an <code>x-service-secret</code> header.
      </p>
      <h2>Endpoints</h2>
      <ul>
        <li>
          <code>POST /api/v1/narrow</code> — broad targeting goal → ranked people + companies + parsed intent
        </li>
        <li>
          <code>POST /api/v1/hooks</code> — hook candidates (stubbed; Brandon owns real impl)
        </li>
        <li>
          <code>POST /api/v1/enrich</code> — recent context + angles (stubbed; Brandon owns real impl)
        </li>
      </ul>
    </main>
  );
}
