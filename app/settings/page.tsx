"use client";

/**
 * No-auth outreach settings page for the hackathon demo.
 * Saves user/project context locally so drafts can reference what the sender is building.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  DEFAULT_OUTREACH_SETTINGS,
  readOutreachSettings,
  saveOutreachSettings,
  type OutreachSettings,
} from "@/app/demo/draft-state";

export default function SettingsPage() {
  const [settings, setSettings] = useState<OutreachSettings>(
    DEFAULT_OUTREACH_SETTINGS,
  );
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Settings are browser-local for the no-auth hackathon prototype.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(readOutreachSettings());
  }, []);

  const updateField = (field: keyof OutreachSettings, value: string) => {
    setSaved(false);
    setSettings((current) => ({ ...current, [field]: value }));
  };

  const save = () => {
    saveOutreachSettings(settings);
    setSaved(true);
  };

  return (
    <main className="settings-page-shell">
      <section className="settings-card">
        <div className="chat-sidebar-brand inline">
          <span className="paper-plane-mark">▱</span>
          <span>ColdReach</span>
          <small>BETA</small>
        </div>
        <div className="settings-heading">
          <div className="sidebar-kicker">Settings</div>
          <h1>Tell the agent what you are building.</h1>
          <p className="muted">
            This context is saved locally and injected into coffee-chat drafts.
            No auth or user accounts needed for the hackathon demo.
          </p>
        </div>

        <label className="draft-field">
          Your name
          <input
            type="text"
            value={settings.senderName}
            onChange={(event) => updateField("senderName", event.target.value)}
          />
        </label>

        <label className="draft-field">
          Project name
          <input
            type="text"
            value={settings.projectName}
            onChange={(event) => updateField("projectName", event.target.value)}
          />
        </label>

        <label className="draft-field">
          What are you building?
          <textarea
            rows={3}
            value={settings.projectDescription}
            onChange={(event) =>
              updateField("projectDescription", event.target.value)
            }
          />
        </label>

        <label className="draft-field">
          What do you want to talk about?
          <textarea
            rows={3}
            value={settings.outreachGoal}
            onChange={(event) => updateField("outreachGoal", event.target.value)}
          />
        </label>

        <label className="draft-field">
          Opportunity context
          <textarea
            rows={3}
            value={settings.opportunityContext}
            onChange={(event) =>
              updateField("opportunityContext", event.target.value)
            }
          />
        </label>

        <div className="draft-actions">
          <button className="btn" onClick={save} type="button">
            Save settings
          </button>
          <Link className="btn secondary" href="/chat">
            Back to chat
          </Link>
        </div>
        {saved && <div className="toast">Settings saved for future drafts.</div>}
      </section>
    </main>
  );
}
