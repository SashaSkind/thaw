// lib/draft.ts
// Thaw now writes the FINISHED outreach text (subject + body incl. closing) —
// ColdReach only stores + sends (docs/integration.md §0.2, §3.3). Deterministic
// composer so drafting works with or without OpenAI. It MUST use the sender's
// resumeText / comments / emailClosing from the fetched profile.

import type { ProspectPerson } from "@/lib/types";
import type { DraftChannel, SenderProfile } from "@/lib/coldreach-integration";

export const TONES = ["casual", "professional", "efficient"] as const;
export type Tone = (typeof TONES)[number];

export interface FinishedDraft {
  subject?: string;
  body: string;
}

export interface DraftInputs {
  person: ProspectPerson;
  confirmedHook: string;
  tone: Tone;
  channel: DraftChannel;
  sender: SenderProfile | null;
}

function firstSentence(text: string, maxWords = 16): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const sentence = clean.split(/(?<=[.!?])\s/)[0];
  const words = sentence.split(" ");
  return words.length <= maxWords ? sentence : `${words.slice(0, maxWords).join(" ")}…`;
}

/** Sender credibility clause derived from the resume (never fabricated). */
function senderClause(sender: SenderProfile | null): string {
  const resume = firstSentence(sender?.resumeText ?? "");
  if (!resume) return "";
  return resume.replace(/\.$/, "");
}

/** What the sender offers — drawn from their onboarding comments if present. */
function valueLine(sender: SenderProfile | null, company: string, tone: Tone): string {
  const comments = (sender?.comments ?? "").replace(/\s+/g, " ").trim();
  if (comments) {
    return tone === "efficient"
      ? `${firstSentence(comments)}`
      : `I'm reaching out because ${lowerFirst(firstSentence(comments))}`;
  }
  // No comments on file -> generic, honest value line.
  const fallback: Record<Tone, string> = {
    casual: `I'm working on something I think could genuinely help with what you're building at ${company}.`,
    professional: `I'd love to share something relevant to what you're focused on at ${company}.`,
    efficient: `Built something relevant to ${company}.`,
  };
  return fallback[tone];
}

/** Finished closing: the sender's own emailClosing, or a tone fallback + name. */
function closingBlock(sender: SenderProfile | null, tone: Tone): string {
  const closing = (sender?.emailClosing ?? "").trim();
  if (closing) return closing;
  const signoff: Record<Tone, string> = {
    casual: "Cheers,",
    professional: "Best regards,",
    efficient: "Thanks,",
  };
  return sender?.name ? `${signoff[tone]}\n${sender.name}` : signoff[tone];
}

function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

/**
 * Compose the FINISHED message. Email -> subject + multi-paragraph body with the
 * closing woven in. LinkedIn/X -> one tight DM (closing reduced to the name).
 */
export function composeFinishedDraft(inputs: DraftInputs): FinishedDraft {
  const { person, confirmedHook, tone, channel, sender } = inputs;
  const firstName = person.name.split(" ")[0];
  const hook = confirmedHook.trim().replace(/\.$/, "");
  const hookLower = lowerFirst(hook);
  const clause = senderClause(sender);

  const opener: Record<Tone, string> = {
    casual: `Hey ${firstName} — noticed ${hookLower}, so I wanted to reach out.`,
    professional: `Hi ${firstName}, I came across your work at ${person.company} — and ${hookLower}.`,
    efficient: `${firstName} — ${hook}.`,
  };
  const value = valueLine(sender, person.company, tone);
  const credibility = clause
    ? tone === "efficient"
      ? `(${clause}.)`
      : `For context, ${lowerFirst(clause)}.`
    : "";
  const ask: Record<Tone, string> = {
    casual: "Open to swapping notes this week?",
    professional: "Would you be open to a short conversation?",
    efficient: "Worth 10 minutes?",
  };

  if (channel === "email") {
    const subject: Record<Tone, string> = {
      casual: `quick idea for ${person.company}`,
      professional: `A relevant note for ${firstName} at ${person.company}`,
      efficient: `${person.company} — 10 min?`,
    };
    const paragraphs = [
      opener[tone],
      [value, credibility].filter(Boolean).join(" "),
      ask[tone],
      closingBlock(sender, tone),
    ].filter(Boolean);
    return { subject: subject[tone], body: paragraphs.join("\n\n") };
  }

  // LinkedIn / X DM — one tight line; sign with first name only.
  const dm = `${opener[tone]} ${value} ${ask[tone]}`.replace(/\s+/g, " ").trim();
  const signed = sender?.name ? `${dm}\n— ${sender.name.split(" ")[0]}` : dm;
  return { body: signed };
}
