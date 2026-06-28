"use client";

/** Step 1 — one input: "who do you want to reach?" Kicks off narrowing. */

import { useState } from "react";

const SUGGESTIONS = [
  "YC fintech founders hiring their first GTM person",
  "Heads of growth at Series A payments startups",
  "Engineering leaders at growth-stage fintechs",
];

export function TargetingPrompt({
  onSubmit,
  disabled,
}: {
  onSubmit: (goal: string) => void;
  disabled: boolean;
}) {
  const [goal, setGoal] = useState("");

  const submit = () => {
    const trimmed = goal.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <div className="card">
      <h2>Who do you want to reach?</h2>
      <p className="faint">
        Describe the kind of person — not a name. We&apos;ll find specific,
        ranked candidates.
      </p>
      <div className="prompt-row">
        <input
          type="text"
          value={goal}
          placeholder="e.g. YC fintech founders hiring their first GTM hire"
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          disabled={disabled}
          aria-label="Targeting goal"
        />
        <button className="btn" onClick={submit} disabled={disabled || !goal.trim()}>
          Find people
        </button>
      </div>
      <div className="suggestions">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            className="chip"
            onClick={() => setGoal(s)}
            disabled={disabled}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
