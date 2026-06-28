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
  recentContext: string[];
  angles: string[];
  tone: Tone;
  channel: Channel;
  subject: string;
  body: string;
  sentEmails: SentEmail[];
}

export const TONES: Tone[] = ["casual", "professional", "efficient"];

const STORAGE_PREFIX = "coldreach-demo-draft";

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

export function composeDraft(
  person: ProspectPerson,
  confirmedHook: string,
  tone: Tone,
  channel: Channel,
): DraftParts {
  const firstName = person.name.split(" ")[0] ?? person.name;
  const hook = confirmedHook.replace(/\.$/, "");
  const hookLower = hook.charAt(0).toLowerCase() + hook.slice(1);

  const opener: Record<Tone, string> = {
    casual: `Hey ${firstName} - noticed ${hookLower}, so I figured I'd reach out.`,
    professional: `Hi ${firstName}, I came across your work at ${person.company} - and ${hookLower}.`,
    efficient: `${firstName} - ${hook}.`,
  };
  const body: Record<Tone, string> = {
    casual:
      "I'm working on something that may be relevant to what you're building. Open to swapping notes over coffee or a quick virtual chat?",
    professional: `I'd love to share something relevant to what you are focused on at ${person.company}. Would you be open to a short coffee chat?`,
    efficient: `Built something relevant to ${person.company}. Worth a 10-minute coffee chat?`,
  };
  const signoff: Record<Tone, string> = {
    casual: "Cheers!",
    professional: "Best regards,",
    efficient: "Thanks,",
  };

  if (channel !== "email") {
    return {
      subject: "",
      body: `${opener[tone]} ${body[tone]}`,
    };
  }

  const subject: Record<Tone, string> = {
    casual: `quick coffee chat re: ${person.company}`,
    professional: `Coffee chat with ${firstName}?`,
    efficient: `${person.company} - 10 min?`,
  };
  return splitEmailDraft(
    `Subject: ${subject[tone]}\n\n${opener[tone]}\n\n${body[tone]}\n\n${signoff[tone]}\nColdReach`,
    subject[tone],
  );
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
