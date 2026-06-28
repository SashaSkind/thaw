"use client";

/**
 * Step 4 — human-in-the-loop hook capture. Show proposed candidates to confirm,
 * plus a free-text box for the user's own hook. The user MUST confirm one before
 * we proceed (anti-hallucination: never auto-inject an unconfirmed hook).
 */

import { useState } from "react";
import type { HookCandidate } from "@/lib/types";

export function HookCapture({
  hooks,
  primarySource,
  onConfirm,
  onBack,
}: {
  hooks: HookCandidate[];
  primarySource: string;
  onConfirm: (hook: string) => void;
  onBack: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [own, setOwn] = useState("");

  const selectedCandidate = hooks.find((h) => h.id === selectedId);
  const ownTrimmed = own.trim();
  const confirmText = ownTrimmed || selectedCandidate?.text || "";
  const canConfirm = confirmText.length > 0;

  return (
    <div className="card">
      <button className="btn secondary small" onClick={onBack}>
        ← Back to person
      </button>
      <div className="section">
        <h2>
          Confirm the hook
          <span className="badge">human-in-the-loop</span>
        </h2>
        <p className="faint">
          We propose candidates from real context. You confirm the true one (or
          add your own). Nothing goes into a draft until you confirm.
        </p>
      </div>

      {hooks.length === 0 && (
        <p className="muted">
          Context was thin — no candidates proposed. Add your own hook below.
        </p>
      )}

      {hooks.map((hook) => (
        <div
          key={hook.id}
          className={`hook ${selectedId === hook.id ? "selected" : ""}`}
          onClick={() => {
            setSelectedId(hook.id);
            setOwn("");
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setSelectedId(hook.id);
              setOwn("");
            }
          }}
        >
          <span className="radio" />
          <div>
            <div className="htext">{hook.text}</div>
            <div className="hsource">source: {hook.source}</div>
          </div>
        </div>
      ))}

      <div className="section">
        <b>…or add your own</b>
        <textarea
          rows={2}
          placeholder='e.g. "We&apos;re both from Queens"'
          value={own}
          onChange={(e) => {
            setOwn(e.target.value);
            if (e.target.value.trim()) setSelectedId(null);
          }}
          style={{ marginTop: 8 }}
        />
      </div>

      <div className="source-tag">context source: {primarySource}</div>

      <div className="row">
        <button
          className="btn"
          disabled={!canConfirm}
          onClick={() => onConfirm(confirmText)}
        >
          Confirm hook → draft
        </button>
      </div>
    </div>
  );
}
