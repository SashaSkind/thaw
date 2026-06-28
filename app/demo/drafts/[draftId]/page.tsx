"use client";

/**
 * Standalone draft email page.
 * Reads stateless demo draft data from browser storage and lets the user edit,
 * switch tone/channel, and record a send event.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTheme } from "next-themes";
import {
  availableChannels,
  channelLabel,
  composeDraft,
  makeId,
  readDraftThread,
  saveDraftThread,
  TONES,
  type ProspectThread,
  type SentEmail,
  type Tone,
} from "../../draft-state";
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

export default function DraftPage() {
  const params = useParams<{ draftId: string }>();
  const [thread, setThread] = useState<ProspectThread | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

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
      const draft = composeDraft(current.person, current.confirmedHook, tone, channel);
      return { ...current, tone, channel, subject: draft.subject, body: draft.body };
    });
  };

  const sendDraft = () => {
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
  };

  if (!hasLoaded) {
    return (
      <main className="draft-page-shell">
        <div className="draft-loading">Loading draft...</div>
      </main>
    );
  }

  if (!thread) {
    return (
      <main className="draft-page-shell">
        <div className="draft-empty card">
          <h1>Draft not found</h1>
          <p className="muted">
            This demo stores draft pages in browser storage. Start a new chat
            workflow to create another draft.
          </p>
          <Link className="btn" href="/demo">
            Back to chat
          </Link>
        </div>
      </main>
    );
  }

  const channels = availableChannels(thread.person);

  return (
    <main className="draft-page-shell">
      <header className="draft-page-topbar">
        <Link className="draft-back-link" href="/demo">
          Back to chat
        </Link>
        <div className="brand">
          <span className="brand-dot" />
          <div>
            ColdReach Draft
            <small>edit, choose tone, send</small>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <section className="draft-page-grid">
        <aside className="draft-contact-card">
          <div className="sidebar-kicker">Coffee chat target</div>
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
          {thread.recentContext.length > 0 && (
            <div className="section">
              <b>Context used</b>
              <ul className="list">
                {thread.recentContext.map((context) => (
                  <li key={context}>{context}</li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        <section className="draft-editor-card">
          <div className="draft-editor-header">
            <div>
              <div className="sidebar-kicker">Drafted coffee chat email</div>
              <h2>{thread.status === "sent" ? "Sent and saved" : "Ready to edit"}</h2>
            </div>
            <span className={`draft-status ${thread.status}`}>{thread.status}</span>
          </div>

          <div className="draft-control-grid">
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
              Send
            </button>
            <Link className="btn secondary" href="/demo">
              Back to search
            </Link>
          </div>

          {thread.sentEmails.length > 0 && (
            <div className="sent-history">
              <b>Sent emails on this draft</b>
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
