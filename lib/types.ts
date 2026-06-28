/**
 * Shared service contract.
 *
 * OWNER: Sasha (service spine + `/v1/narrow`).
 * STATUS: read-only contract for Brandon's slice. This is a local stand-in that
 * mirrors §4 of AGENTS.md exactly so Brandon's endpoints + demo UI compile and
 * run before Sasha has pushed the real `lib/types.ts`. Do NOT extend or redefine
 * these shapes here — coordinate any contract change with Sasha.
 */

export type Channel = "email" | "linkedin" | "x";

export interface ChannelAvailability {
  email: boolean;
  linkedin: boolean;
  x: boolean;
}

export interface ProspectPerson {
  id: string;
  name: string;
  title: string;
  company: string;
  companyId: string;
  location?: string;
  email?: string;
  linkedinUrl?: string;
  xUrl?: string;
  evidence: string;
  matchScore: number; // 0..100
  channels: ChannelAvailability;
}

// ---- Brandon's endpoints ----

// POST /v1/hooks
export interface HookCandidate {
  id: string;
  text: string; // e.g. "Also from Queens"
  source: string; // where it came from (post, bio, etc.)
  needsUserConfirmation: true; // ALWAYS human-in-the-loop
}
export interface HooksRequest {
  personId: string;
}
export interface HooksResponse {
  hooks: HookCandidate[];
}

// POST /v1/enrich
export interface EnrichRequest {
  personId: string;
  confirmedHook?: string;
}
export interface EnrichResponse {
  recentContext: string[]; // recent posts/news snippets
  suggestedAngles: string[]; // angles ColdReach's drafting can use
}

// Consumed by the demo UI:
export interface NarrowResponse {
  intent: unknown; // parsed criteria (display "we understood X")
  companies: unknown[];
  people: ProspectPerson[]; // ranked, highest matchScore first
}
