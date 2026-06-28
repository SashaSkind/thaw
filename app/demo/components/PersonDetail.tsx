"use client";

/** Step 3 — person detail: role/company/links, research prompts, Find hooks. */

import type { ProspectPerson } from "@/lib/types";

export function PersonDetail({
  person,
  onFindHooks,
  onBack,
  finding,
}: {
  person: ProspectPerson;
  onFindHooks: () => void;
  onBack: () => void;
  finding: boolean;
}) {
  return (
    <div className="card">
      <button className="btn secondary small" onClick={onBack}>
        ← Back to results
      </button>
      <div className="section">
        <h2>{person.name}</h2>
        <div className="role muted">
          {person.title} · {person.company}
          {person.location ? ` · ${person.location}` : ""}
        </div>
        <div className="detail-links">
          {person.linkedinUrl && (
            <a href={person.linkedinUrl} target="_blank" rel="noreferrer">
              LinkedIn ↗
            </a>
          )}
          {person.xUrl && (
            <a href={person.xUrl} target="_blank" rel="noreferrer">
              X ↗
            </a>
          )}
          {person.email && <span className="faint">{person.email}</span>}
        </div>
        <div className="evidence faint">{person.evidence}</div>
      </div>

      <div className="section">
        <b>Research prompts</b>
        <ul className="list">
          <li>What did they post about most recently?</li>
          <li>Any shared background — hometown, school, employer?</li>
          <li>What problem are they actively talking about?</li>
        </ul>
      </div>

      <div className="row">
        <button className="btn" onClick={onFindHooks} disabled={finding}>
          {finding ? "Finding hooks…" : "Find hooks →"}
        </button>
      </div>
    </div>
  );
}
