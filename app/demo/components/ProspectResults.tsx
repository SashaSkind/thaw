"use client";

/** Step 2 — ranked prospect cards with evidence + a confidence indicator. */

import type { ProspectPerson } from "@/lib/types";

function Channels({ person }: { person: ProspectPerson }) {
  return (
    <div className="channels">
      <span className={`channel ${person.channels.email ? "on" : ""}`}>email</span>
      <span className={`channel ${person.channels.linkedin ? "on" : ""}`}>
        in
      </span>
      <span className={`channel ${person.channels.x ? "on" : ""}`}>x</span>
    </div>
  );
}

export function ProspectResults({
  people,
  onSelect,
}: {
  people: ProspectPerson[];
  onSelect: (person: ProspectPerson) => void;
}) {
  return (
    <div className="card">
      <h2>{people.length} ranked prospects</h2>
      <p className="faint">Sorted by fit. Pick one to find a hook.</p>
      <div className="results-grid">
        {people.map((person) => (
          <div
            key={person.id}
            className="prospect"
            role="button"
            tabIndex={0}
            onClick={() => onSelect(person)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSelect(person);
            }}
          >
            <div>
              <div className="name">{person.name}</div>
              <div className="role">
                {person.title} · {person.company}
                {person.location ? ` · ${person.location}` : ""}
              </div>
              <div className="evidence">{person.evidence}</div>
              <Channels person={person} />
            </div>
            <div className="score">
              <div className="num">{person.matchScore}</div>
              <div className="lbl">match</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
