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

/**
 * Local stand-in for ColdReach's drafting. Renders a NATURAL message from the
 * ingredients — note it does NOT paste the suggested angles verbatim (those are
 * ColdReach's drafting input, shown separately); it uses the confirmed hook and
 * a short value line derived from the prospect. Tone changes the voice; channel
 * changes the format (email = subject + sign-off; DM = one tight line).
 */
function composeDraft(
  person: ProspectPerson,
  confirmedHook: string,
  tone: Tone,
  channel: Channel,
): string {
  const firstName = person.name.split(" ")[0];
  const hook = confirmedHook.trim().replace(/[.?!]+$/, "");
  const hookLower = hook.charAt(0).toLowerCase() + hook.slice(1);
  const company = person.company?.trim();
  const atCompany = company ? ` at ${company}` : "";
  const companyRef = company ?? "your work";

  const opener: Record<Tone, string> = {
    casual: `Hey ${firstName} — noticed ${hookLower}, so I figured I'd reach out.`,
    professional: `Hi ${firstName}, I came across your work${atCompany} — and ${hookLower}.`,
    efficient: `${firstName} — ${hook}.`,
  };
  const body: Record<Tone, string> = {
    casual: `I'm working on something I think could genuinely help with what you're building. Open to swapping notes this week?`,
    professional: `I'd love to share something relevant to what you're focused on${atCompany}. Would you be open to a short conversation?`,
    efficient: `Built something relevant to ${companyRef}. Worth 10 minutes?`,
  };
  const signoff: Record<Tone, string> = {
    casual: "Cheers!",
    professional: "Best regards,",
    efficient: "Thanks,",
  };

  if (channel === "email") {
    const subject: Record<Tone, string> = {
      casual: company ? `quick idea for ${company}` : `quick idea for you`,
      professional: `A relevant note for ${firstName}${atCompany}`,
      efficient: company ? `${company} — 10 min?` : `${firstName} — 10 min?`,
    };
    return `Subject: ${subject[tone]}\n\n${opener[tone]}\n\n${body[tone]}\n\n${signoff[tone]}\n— Sent via ColdReach`;
  }

  // LinkedIn / X DM: one tight line, no subject.
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

  const draft = composeDraft(person, confirmedHook, tone, channel);

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
