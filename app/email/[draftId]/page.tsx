"use client";

/**
 * Email review and send page for a drafted coffee-chat message.
 * Reads the stateless demo draft from browser storage and records send state.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTheme } from "next-themes";
import {
  availableChannels,
  channelLabel,
  composeDraft,
  DEFAULT_OUTREACH_SETTINGS,
  makeId,
  readDraftThread,
  saveDraftThread,
  TONES,
  type ProspectThread,
  type SentEmail,
  type Tone,
} from "@/app/demo/draft-state";
import type { Channel } from "@/lib/types";

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // next-themes resolves the active theme only after client mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) return <span style={{ width: 96 }} />;
  const isDark = resolvedTheme === "dark";

  return (
    <button
      className="theme-toggle"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      type="button"
    >
      {isDark ? "Light" : "Dark"}
    </button>
  );
}

export default function EmailPage() {
  const params = useParams<{ draftId: string }>();
  const [thread, setThread] = useState<ProspectThread | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [sendStatus, setSendStatus] = useState<string | null>(null);

  useEffect(() => {
    // Drafts are stored in browser storage because the demo service is stateless.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThread(readDraftThread(params.draftId));
    setHasLoaded(true);
  }, [params.draftId]);

  const updateThread = (updater: (current: ProspectThread) => ProspectThread) => {
    setThread((current) => {
      if (!current) return current;
      const next = updater(current);
      saveDraftThread(next);
      return next;
    });
  };

  const regenerateDraft = (tone: Tone, channel: Channel) => {
    updateThread((current) => {
      const draft = composeDraft(
        current.person,
        current.confirmedHook,
        tone,
        channel,
        current.settings ?? DEFAULT_OUTREACH_SETTINGS,
        current.confirmedHookSource ?? "confirmed hook",
        current.recentContext,
      );
      return { ...current, tone, channel, subject: draft.subject, body: draft.body };
    });
  };

  const sendDraft = async () => {
    if (!thread) return;
    setSendStatus("Sending...");

    const response = await fetch("/api/email/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        to:
          thread.person.email ??
          thread.person.linkedinUrl ??
          thread.person.xUrl ??
          thread.person.name,
        subject: thread.subject || `${thread.person.company} coffee chat`,
        body: thread.body,
        channel: thread.channel,
        person: {
          id: thread.person.id,
          name: thread.person.name,
          company: thread.person.company,
        },
      }),
    });
    const result = (await response.json()) as {
      ok: boolean;
      mode?: "sent" | "demo";
      reason?: string;
    };

    updateThread((current) => {
      const sentEmail: SentEmail = {
        id: makeId("sent"),
        to:
          current.person.email ??
          current.person.linkedinUrl ??
          current.person.xUrl ??
          current.person.name,
        subject: current.subject || `${current.person.company} coffee chat`,
        body: current.body,
        channel: current.channel,
        sentAt: new Date().toLocaleString(),
      };

      return {
        ...current,
        status: "sent",
        sentEmails: [sentEmail, ...current.sentEmails],
      };
    });

    setSendStatus(
      result.mode === "sent"
        ? "Email sent."
        : `Demo send recorded${result.reason ? ` (${result.reason})` : ""}.`,
    );
  };

  if (!hasLoaded) {
    return (
      <main className="email-page-shell">
        <div className="draft-loading">Loading email...</div>
      </main>
    );
  }

  if (!thread) {
    return (
      <main className="email-page-shell">
        <div className="draft-empty card">
          <h1>Email draft not found</h1>
          <p className="muted">
            Drafts are stored in browser storage for this stateless demo. Start
            from chat to create another email.
          </p>
          <Link className="btn" href="/chat">
            Back to chat
          </Link>
        </div>
      </main>
    );
  }

  const channels = availableChannels(thread.person);

  return (
    <main className="email-page-shell">
      <header className="email-page-topbar">
        <Link className="draft-back-link" href="/chat">
          Back to chat
        </Link>
        <div className="chat-sidebar-brand inline">
          <span className="paper-plane-mark">▱</span>
          <span>ColdReach</span>
          <small>BETA</small>
        </div>
        <ThemeToggle />
      </header>

      <section className="email-page-grid">
        <aside className="email-context-card">
          <div className="sidebar-kicker">Recipient</div>
          <h1>{thread.person.name}</h1>
          <p className="muted">{thread.subtitle}</p>
          <div className="draft-contact-meta">
            {thread.person.email && <span>{thread.person.email}</span>}
            {thread.person.linkedinUrl && (
              <a href={thread.person.linkedinUrl} target="_blank" rel="noreferrer">
                LinkedIn
              </a>
            )}
            {thread.person.xUrl && (
              <a href={thread.person.xUrl} target="_blank" rel="noreferrer">
                X
              </a>
            )}
          </div>
          <div className="section">
            <b>Warm hook</b>
            <p className="muted">{thread.confirmedHook}</p>
          </div>
          <div className="section">
            <b>Your context</b>
            <p className="muted">
              {(thread.settings ?? DEFAULT_OUTREACH_SETTINGS).projectName}:{" "}
              {(thread.settings ?? DEFAULT_OUTREACH_SETTINGS).outreachGoal}
            </p>
            <Link className="draft-back-link" href="/settings">
              Edit settings
            </Link>
          </div>
          {thread.angles.length > 0 && (
            <div className="section">
              <b>Agent angles</b>
              <ul className="list">
                {thread.angles.map((angle) => (
                  <li key={angle}>{angle}</li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        <section className="email-editor-card">
          <div className="email-editor-header">
            <div>
              <div className="sidebar-kicker">Email ready</div>
              <h2>{thread.status === "sent" ? "Sent and saved" : "Review before sending"}</h2>
              <p className="muted">
                This is where the final email is edited and sent.
              </p>
            </div>
            <span className={`draft-status ${thread.status}`}>{thread.status}</span>
          </div>

          <div className="email-control-grid">
            <div>
              <b>Channel</b>
              <div className="channel-tabs">
                {channels.map((channel) => (
                  <button
                    key={channel}
                    className={`tone ${thread.channel === channel ? "active" : ""}`}
                    onClick={() => regenerateDraft(thread.tone, channel)}
                    type="button"
                  >
                    {channelLabel(channel)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <b>Tone</b>
              <div className="tones">
                {TONES.map((tone) => (
                  <button
                    key={tone}
                    className={`tone ${thread.tone === tone ? "active" : ""}`}
                    onClick={() => regenerateDraft(tone, thread.channel)}
                    type="button"
                  >
                    {tone}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {thread.channel === "email" && (
            <label className="draft-field">
              Subject
              <input
                type="text"
                value={thread.subject}
                onChange={(event) =>
                  updateThread((current) => ({
                    ...current,
                    subject: event.target.value,
                  }))
                }
              />
            </label>
          )}

          <label className="draft-field">
            Message
            <textarea
              rows={12}
              value={thread.body}
              onChange={(event) =>
                updateThread((current) => ({
                  ...current,
                  body: event.target.value,
                }))
              }
            />
          </label>

          <div className="draft-actions">
            <button className="btn" onClick={sendDraft} type="button">
              Send email →
            </button>
            <Link className="btn secondary" href="/chat">
              Back to chat
            </Link>
          </div>
          {sendStatus && <div className="toast">{sendStatus}</div>}

          {thread.sentEmails.length > 0 && (
            <div className="sent-history">
              <b>Sent emails</b>
              {thread.sentEmails.map((email) => (
                <div className="sent-preview" key={email.id}>
                  <span>
                    {email.sentAt} via {channelLabel(email.channel)}
                  </span>
                  <b>{email.subject}</b>
                  <p>{email.body}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
