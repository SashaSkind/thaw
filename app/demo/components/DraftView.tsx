"use client";

/**
 * Step 5 — draft view. Thaw writes the FINISHED email (subject + body incl. the
 * sender's closing) using the sender profile fetched at handoff; the Send action
 * POSTs that finished draft to ColdReach (pending draft) and deep-links the user
 * back to ColdReach to send from their own authenticated session. Thaw never
 * touches Gmail. (docs/integration.md §3.3-§3.5)
 */

import { useMemo, useState } from "react";
import type { Channel, ProspectPerson } from "@/lib/types";
import type { SenderProfile } from "@/lib/coldreach-integration";
import { TONES, type Tone, composeFinishedDraft } from "@/lib/draft";

function availableChannels(person: ProspectPerson): Channel[] {
  const channels: Channel[] = [];
  if (person.channels.email) channels.push("email");
  if (person.channels.linkedin) channels.push("linkedin");
  if (person.channels.x) channels.push("x");
  return channels.length > 0 ? channels : ["email"];
}

function channelLabel(channel: Channel): string {
  if (channel === "email") return "Email";
  if (channel === "linkedin") return "LinkedIn DM";
  return "X DM";
}

type SendState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "redirecting"; deepLink: string }
  | { status: "error"; message: string };

export function DraftView({
  person,
  confirmedHook,
  angles,
  recentContext,
  sender,
  onRestart,
}: {
  person: ProspectPerson;
  confirmedHook: string;
  angles: string[];
  recentContext: string[];
  sender: SenderProfile | null;
  onRestart: () => void;
}) {
  const channels = useMemo(() => availableChannels(person), [person]);
  const [tone, setTone] = useState<Tone>("professional");
  const [channel, setChannel] = useState<Channel>(channels[0]);
  const [send, setSend] = useState<SendState>({ status: "idle" });

  const draft = useMemo(
    () => composeFinishedDraft({ person, confirmedHook, tone, channel, sender }),
    [person, confirmedHook, tone, channel, sender],
  );

  const rendered = draft.subject
    ? `Subject: ${draft.subject}\n\n${draft.body}`
    : draft.body;

  const handoff = async () => {
    setSend({ status: "sending" });
    try {
      const res = await fetch("/api/integration/pending-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contact: {
            name: person.name,
            email: person.email,
            company: person.company,
            title: person.title,
            linkedinUrl: person.linkedinUrl,
            xUrl: person.xUrl,
          },
          channel,
          subject: channel === "email" ? draft.subject : undefined,
          body: draft.body,
        }),
      });
      const data = (await res.json()) as { ok: boolean; deepLink?: string; reason?: string };
      if (res.ok && data.ok && data.deepLink) {
        setSend({ status: "redirecting", deepLink: data.deepLink });
        window.location.assign(data.deepLink);
        return;
      }
      setSend({ status: "error", message: data.reason ?? "Handoff failed." });
    } catch {
      setSend({ status: "error", message: "Network error reaching ColdReach." });
    }
  };

  const sendLabel = channel === "email" ? "Send via ColdReach →" : "Save to ColdReach →";

  return (
    <div className="card">
      <button className="btn secondary small" onClick={onRestart}>
        ↺ Start over
      </button>

      <div className="section">
        <h2>Draft handoff → ColdReach</h2>
        <div className="banner">
          <span className="dot" />
          Thaw writes the finished message. ColdReach sends it from your own
          inbox — Thaw never touches Gmail.
        </div>
      </div>

      <div className="section">
        <b>Confirmed hook</b>
        <p className="muted" style={{ marginTop: 4 }}>
          &ldquo;{confirmedHook}&rdquo;
        </p>
      </div>

      {angles.length > 0 && (
        <div className="section">
          <b>Suggested angles (ingredients)</b>
          <ul className="list">
            {angles.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="section">
        <b>Channel</b>
        <div className="channel-tabs">
          {channels.map((c) => (
            <button
              key={c}
              className={`tone ${channel === c ? "active" : ""}`}
              onClick={() => setChannel(c)}
            >
              {channelLabel(c)}
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <b>Tone</b>
        <div className="tones">
          {TONES.map((t) => (
            <button
              key={t}
              className={`tone ${tone === t ? "active" : ""}`}
              onClick={() => setTone(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="draft-box">{rendered}</div>
        {!sender?.emailClosing && (
          <p className="faint" style={{ marginTop: 6 }}>
            Using a default closing — connect via ColdReach so your saved email
            closing is woven in.
          </p>
        )}
      </div>

      {recentContext.length > 0 && (
        <div className="section">
          <b>Recent context used</b>
          <ul className="list">
            {recentContext.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="row">
        <button
          className="btn"
          onClick={handoff}
          disabled={send.status === "sending" || send.status === "redirecting"}
        >
          {send.status === "sending"
            ? "Saving to ColdReach…"
            : send.status === "redirecting"
              ? "Redirecting…"
              : sendLabel}
        </button>
      </div>

      {send.status === "redirecting" && (
        <div className="toast">
          ✓ Saved to ColdReach — taking you there to send from your own inbox…
        </div>
      )}
      {send.status === "error" && (
        <div className="toast">⚠ {send.message}</div>
      )}
    </div>
  );
}
