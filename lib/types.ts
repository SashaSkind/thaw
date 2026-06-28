// lib/types.ts
// The contract. Single source of truth for the shapes the service returns and
// that ColdReach / the demo UI consume. LOCK THIS FIRST.

export type CompanyStage =
  | "seed"
  | "series_a"
  | "series_b"
  | "series_c"
  | "growth"
  | "unknown";
export type Channel = "email" | "linkedin" | "x";

// Structured version of the user's broad ask (output of prompt parsing)
export interface TargetingIntent {
  rawQuery: string;
  industry?: string[]; // e.g. ["fintech"]
  geography?: string[]; // e.g. ["New York, NY"]
  stage?: CompanyStage[]; // e.g. ["series_b"]
  companyType?: string[]; // e.g. ["YC-backed"]
  roles?: string[]; // e.g. ["founder", "CEO"]
  exclusions?: string[]; // e.g. ["crypto"]
}

export interface ProspectCompany {
  id: string;
  name: string;
  domain?: string;
  category?: string; // industry/category
  location?: string;
  stage: CompanyStage;
  matchReason: string; // why THIS company matched the intent
}

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
  email?: string; // present only if found
  linkedinUrl?: string;
  xUrl?: string;
  evidence: string; // why this person matches the goal
  matchScore: number; // 0..100, see ranking
  channels: ChannelAvailability;
}

// Brandon's endpoints return these; I only need the shape to mock them.
export interface HookCandidate {
  id: string;
  text: string; // e.g. "Also from Queens"
  source: string; // where it came from (post, bio, etc.)
  needsUserConfirmation: true; // human-in-the-loop always
}

// ---- endpoint payloads ----

// POST /v1/narrow
export interface NarrowRequest {
  query: string; // the broad targeting goal
  userBackground?: string; // optional resume/context to improve ranking
  limit?: number; // default 8
}
export interface NarrowResponse {
  intent: TargetingIntent; // the parsed criteria (show the user we understood)
  companies: ProspectCompany[];
  people: ProspectPerson[]; // ranked, highest matchScore first
}

// POST /v1/hooks  (Brandon — I only stub it)
export interface HooksRequest {
  personId: string;
}
export interface HooksResponse {
  hooks: HookCandidate[];
}

// POST /v1/enrich (Brandon — I only stub it)
export interface EnrichRequest {
  personId: string;
  confirmedHook?: string;
}
export interface EnrichResponse {
  recentContext: string[]; // recent posts/news snippets
  suggestedAngles: string[]; // angles ColdReach's drafting can use
}
