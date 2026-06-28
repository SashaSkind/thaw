"use client";

/**
 * Shared draft helpers for the chat workflow and standalone draft page.
 * Persists draft state in browser storage because this demo service is stateless.
 */

import type { Channel, ProspectPerson } from "@/lib/types";

export type Tone = "casual" | "professional" | "efficient";
export type ThreadStatus = "draft" | "sent";

export interface DraftParts {
  subject: string;
  body: string;
}

export interface SentEmail {
  id: string;
  to: string;
  subject: string;
  body: string;
  channel: Channel;
  sentAt: string;
}

export interface ProspectThread {
  id: string;
  title: string;
  subtitle: string;
  status: ThreadStatus;
  person: ProspectPerson;
  confirmedHook: string;
  confirmedHookSource: string;
  recentContext: string[];
  angles: string[];
  settings: OutreachSettings;
  tone: Tone;
  channel: Channel;
  subject: string;
  body: string;
  sentEmails: SentEmail[];
}

export const TONES: Tone[] = ["casual", "professional", "efficient"];

const STORAGE_PREFIX = "coldreach-demo-draft";
const SETTINGS_KEY = "coldreach-demo-settings";

export interface OutreachSettings {
  senderName: string;
  projectName: string;
  projectDescription: string;
  outreachGoal: string;
  opportunityContext: string;
}

export const DEFAULT_OUTREACH_SETTINGS: OutreachSettings = {
  senderName: "Brandon",
  projectName: "ColdReach",
  projectDescription:
    "a workflow that turns public context into thoughtful coffee-chat intros",
  outreachGoal:
    "how founder-led devtools teams think about warm outbound and developer education",
  opportunityContext:
    "whether there is a partnership, customer, or investor conversation worth exploring",
};

export function makeId(prefix: string): string {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}_${id}`;
}

export function draftStorageKey(draftId: string): string {
  return `${STORAGE_PREFIX}:${draftId}`;
}

export function channelLabel(channel: Channel): string {
  if (channel === "email") return "Email";
  if (channel === "linkedin") return "LinkedIn DM";
  return "X DM";
}

export function availableChannels(person: ProspectPerson): Channel[] {
  const channels: Channel[] = [];
  if (person.channels.email) channels.push("email");
  if (person.channels.linkedin) channels.push("linkedin");
  if (person.channels.x) channels.push("x");
  return channels.length ? channels : ["email"];
}

function splitEmailDraft(draft: string, fallbackSubject: string): DraftParts {
  const lines = draft.split("\n");
  const firstLine = lines[0] ?? "";
  if (!firstLine.toLowerCase().startsWith("subject:")) {
    return { subject: fallbackSubject, body: draft };
  }

  return {
    subject: firstLine.replace(/^subject:\s*/i, "").trim() || fallbackSubject,
    body: lines.slice(2).join("\n").trim(),
  };
}

function cleanHookText(confirmedHook: string, recentContext: string[] = []): string {
  const withoutPrefix = confirmedHook
    .replace(/^Recently posted:\s*/i, "")
    .replace(/^Connection to\s+/i, "your connection to ")
    .replace(/^MIT alum$/i, "your MIT founder background")
    .replace(/^NYU alum$/i, "your NYU background")
    .trim();
  const unquoted = withoutPrefix
    .replace(/^["“”]+|["“”]+$/g, "")
    .replace(/…$/g, "")
    .trim();
  if (unquoted.length > 0) return unquoted;
  return recentContext[0] ?? confirmedHook;
}

function sourceLabel(
  person: ProspectPerson,
  hookSource: string,
): { phrase: string; link?: string } {
  const source = hookSource.toLowerCase();
  if (source.includes("linkedin")) {
    return { phrase: "your LinkedIn post", link: person.linkedinUrl };
  }
  if (source.includes("x/") || source.includes(" x ") || source.includes("post news")) {
    return { phrase: "your X post", link: person.xUrl };
  }
  if (source.includes("fiber")) {
    if (person.linkedinUrl) {
      return { phrase: "your LinkedIn post", link: person.linkedinUrl };
    }
    if (person.xUrl) return { phrase: "your X post", link: person.xUrl };
  }
  if (source.includes("interview")) return { phrase: "an interview" };
  if (source.includes("profile")) return { phrase: "your public profile" };
  return {
    phrase: person.linkedinUrl ? "your LinkedIn profile" : "public context",
    link: person.linkedinUrl,
  };
}

function askLine(settings: OutreachSettings, tone: Tone): string {
  if (tone === "efficient") {
    return "Are you open to a quick chat?";
  }
  if (tone === "casual") {
    return "Are you down for a quick chat?";
  }
  return "Would you be open to a quick chat?";
}

export function composeDraft(
  person: ProspectPerson,
  confirmedHook: string,
  tone: Tone,
  channel: Channel,
  settings: OutreachSettings = readOutreachSettings(),
  hookSource = "confirmed hook",
  recentContext: string[] = [],
): DraftParts {
  const firstName = person.name.split(" ")[0] ?? person.name;
  const hookTopic = cleanHookText(confirmedHook, recentContext);
  const source = sourceLabel(person, hookSource);
  const sourceSuffix = source.link ? ` (${source.link})` : "";
  const contextLine = `I saw ${
    source.phrase
  }${sourceSuffix} about ${hookTopic.replace(/\.$/, "")}.`;
  const projectLine = `I am building ${settings.projectName}, ${settings.projectDescription}.`;
  const opportunityLine = `I wanted to talk about ${settings.outreachGoal}, and ${settings.opportunityContext}.`;
  const closing = askLine(settings, tone);
  const signoff: Record<Tone, string> = {
    casual: "Best,",
    professional: "Best regards,",
    efficient: "Thanks,",
  };

  if (channel !== "email") {
    const dmIntro = tone === "efficient" ? `${firstName} -` : `Hi ${firstName},`;
    return {
      subject: "",
      body: `${dmIntro} ${contextLine} ${projectLine} ${closing}`,
    };
  }

  const subject: Record<Tone, string> = {
    casual: `quick chat about ${person.company}`,
    professional: `Coffee chat with ${firstName}?`,
    efficient: `${person.company} - quick chat?`,
  };
  return splitEmailDraft(
    `Subject: ${subject[tone]}\n\nHi ${firstName},\n\n${contextLine}\n\n${projectLine} ${opportunityLine}\n\n${closing}\n\n${signoff[tone]}\n${settings.senderName}`,
    subject[tone],
  );
}

export function readOutreachSettings(): OutreachSettings {
  if (typeof window === "undefined") return DEFAULT_OUTREACH_SETTINGS;
  const raw = window.localStorage.getItem(SETTINGS_KEY);
  if (!raw) return DEFAULT_OUTREACH_SETTINGS;
  try {
    return { ...DEFAULT_OUTREACH_SETTINGS, ...(JSON.parse(raw) as OutreachSettings) };
  } catch {
    return DEFAULT_OUTREACH_SETTINGS;
  }
}

export function saveOutreachSettings(settings: OutreachSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function readDraftThread(draftId: string): ProspectThread | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(draftStorageKey(draftId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ProspectThread;
  } catch {
    return null;
  }
}

export function saveDraftThread(thread: ProspectThread): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(draftStorageKey(thread.id), JSON.stringify(thread));
}
