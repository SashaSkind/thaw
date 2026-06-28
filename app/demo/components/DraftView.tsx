"use client";

/**
 * Step 5 — draft view. The service returns INGREDIENTS (confirmed hook + angles +
 * recent context); ColdReach owns the actual drafting + send. For the demo we
 * render the 3-tone handoff locally and run in DEMO MODE (no real outbound send).
 *
 * PATTERN FROM coldreach/* three-tone draft UI — dedupe post-hackathon.
 */

import { useMemo, useState } from "react";
import type { Channel, ProspectPerson } from "@/lib/types";

const TONES = ["casual", "professional", "efficient"] as const;
type Tone = (typeof TONES)[number];

function availableChannels(person: ProspectPerson): Channel[] {
  const channels: Channel[] = [];
  if (person.channels.email) channels.push("email");
  if (person.channels.linkedin) channels.push("linkedin");
  if (person.channels.x) channels.push("x");
  return channels;
}

function channelLabel(channel: Channel): string {
  if (channel === "email") return "Email";
  if (channel === "linkedin") return "LinkedIn DM";
  return "X DM";
}

/** Local stand-in for ColdReach's drafting — composes from the ingredients. */
function composeDraft(
  person: ProspectPerson,
  confirmedHook: string,
  angles: string[],
  tone: Tone,
  channel: Channel,
): string {
  const firstName = person.name.split(" ")[0];
  const angle = angles[0] ?? "I think there could be a strong fit here.";
  const opener: Record<Tone, string> = {
    casual: `Hey ${firstName} — ${confirmedHook.toLowerCase()}, so I had to reach out.`,
    professional: `Hi ${firstName}, ${confirmedHook} — which is partly why I'm reaching out.`,
    efficient: `${firstName} — ${confirmedHook}.`,
  };
  const body: Record<Tone, string> = {
    casual: `${angle} Would love to swap notes if you're open to it.`,
    professional: `${angle} Would you be open to a brief conversation?`,
    efficient: `${angle} Worth a quick chat?`,
  };

  if (channel === "email") {
    return `Subject: Quick note for ${firstName}\n\n${opener[tone]}\n\n${body[tone]}\n\n— Sent via ColdReach`;
  }
  return `${opener[tone]} ${body[tone]}`;
}

export function DraftView({
  person,
  confirmedHook,
  angles,
  recentContext,
  onRestart,
}: {
  person: ProspectPerson;
  confirmedHook: string;
  angles: string[];
  recentContext: string[];
  onRestart: () => void;
}) {
  const channels = useMemo(() => availableChannels(person), [person]);
  const [tone, setTone] = useState<Tone>("professional");
  const [channel, setChannel] = useState<Channel>(channels[0] ?? "email");
  const [sent, setSent] = useState(false);

  const draft = composeDraft(person, confirmedHook, angles, tone, channel);

  return (
    <div className="card">
      <button className="btn secondary small" onClick={onRestart}>
        ↺ Start over
      </button>

      <div className="section">
        <h2>Draft handoff → ColdReach</h2>
        <div className="banner">
          <span className="dot" />
          Demo mode — drafting only. No real outbound message is sent.
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
        <div className="draft-box">{draft}</div>
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
        <button className="btn" onClick={() => setSent(true)}>
          Send (demo · to yourself)
        </button>
      </div>
      {sent && (
        <div className="toast">
          ✓ Demo send simulated. In production, ColdReach sends this from your
          own Gmail after your final review.
        </div>
      )}
    </div>
  );
}
