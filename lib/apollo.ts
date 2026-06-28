// lib/apollo.ts
// PATTERN FROM coldreach/lib/apollo.ts — dedupe post-hackathon.
//
// Thin, optional Apollo wrapper. Apollo is an ENHANCEMENT, never a dependency:
// if APOLLO_API_KEY is missing or any call fails, this returns null and the
// caller falls back to the curated dataset. This module never throws.

import type {
  CompanyStage,
  ProspectCompany,
  ProspectPerson,
  TargetingIntent,
} from "@/lib/types";

const APOLLO_BASE = "https://api.apollo.io/api/v1";
const APOLLO_MATCH_PATH = "/people/match";

export interface ApolloResult {
  companies: ProspectCompany[];
  people: ProspectPerson[];
}

export interface ApolloContactInput {
  name: string;
  company?: string;
  domain?: string;
  linkedinUrl?: string;
}

export interface ApolloContactEmailResult {
  available: boolean;
  email?: string;
  emailStatus: ProspectPerson["emailStatus"];
  reason?: string;
}

interface ApolloPersonPayload {
  email?: unknown;
  email_status?: unknown;
  headline?: unknown;
  bio?: unknown;
}

export function isApolloEnabled(): boolean {
  return Boolean(process.env.APOLLO_API_KEY);
}

/**
 * Look up companies + people for an intent. Returns `null` when Apollo is not
 * configured or the request fails — the caller should then use the dataset.
 */
export async function searchApollo(
  intent: TargetingIntent,
  limit: number,
): Promise<ApolloResult | null> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(`${APOLLO_BASE}/mixed_people/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({
        page: 1,
        per_page: limit,
        person_titles: intent.roles,
        person_locations: intent.geography,
        q_organization_keyword_tags: intent.industry,
      }),
      // Short timeout-ish behavior via AbortSignal so a slow Apollo can't hang
      // the demo. (Node 18+/Next runtime supports AbortSignal.timeout.)
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
      console.warn(`[apollo] non-OK response: ${res.status}`);
      return null;
    }

    const data: unknown = await res.json();
    return normalizeApollo(data);
  } catch (err) {
    console.warn(
      "[apollo] lookup failed, falling back to dataset:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Verify a selected prospect's email with Apollo. Unverified or missing emails
 * are treated as unavailable so the UI never displays guessed fallback values.
 */
export async function getVerifiedContactEmail(
  person: ApolloContactInput,
): Promise<ApolloContactEmailResult> {
  const apiKey = process.env.APOLLO_API_KEY?.trim();
  if (!apiKey) {
    return {
      available: false,
      emailStatus: "unavailable",
      reason: "APOLLO_API_KEY not set — email verification skipped.",
    };
  }

  try {
    const response = await fetch(buildPeopleMatchUrl(person, true), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        accept: "application/json",
        "x-api-key": apiKey,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return {
        available: false,
        emailStatus: "unavailable",
        reason: `Apollo responded ${response.status}`,
      };
    }

    const data = (await response.json()) as { person?: ApolloPersonPayload };
    const apolloPerson = data.person;
    const email = readNonEmptyString(apolloPerson?.email);
    const emailStatus = readNonEmptyString(apolloPerson?.email_status);

    if (!email) {
      return {
        available: false,
        emailStatus: "unavailable",
        reason: "Apollo did not return an email for this contact.",
      };
    }

    if (emailStatus !== "verified") {
      return {
        available: false,
        emailStatus: "unavailable",
        reason: `Apollo returned email_status=${emailStatus || "unknown"}.`,
      };
    }

    return { available: true, email, emailStatus: "verified" };
  } catch (error) {
    return {
      available: false,
      emailStatus: "unavailable",
      reason: `Apollo request failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

// Defensive normalization: Apollo's shape is loosely typed here on purpose so a
// schema drift downgrades to the dataset instead of throwing.
function normalizeApollo(data: unknown): ApolloResult {
  const people: ProspectPerson[] = [];
  const companies = new Map<string, ProspectCompany>();

  const peopleArr =
    (data as { people?: unknown[] })?.people ??
    (data as { contacts?: unknown[] })?.contacts ??
    [];

  for (const raw of Array.isArray(peopleArr) ? peopleArr : []) {
    const p = raw as Record<string, unknown>;
    const org = (p.organization ?? {}) as Record<string, unknown>;
    const companyName = String(org.name ?? p["organization_name"] ?? "Unknown");
    const companyId = `apollo_co_${slug(companyName)}`;

    if (!companies.has(companyId)) {
      companies.set(companyId, {
        id: companyId,
        name: companyName,
        domain: org.primary_domain ? String(org.primary_domain) : undefined,
        category: org.industry ? String(org.industry) : undefined,
        location: org.city ? String(org.city) : undefined,
        stage: "unknown" as CompanyStage,
        matchReason: "Returned by Apollo search",
      });
    }

    const email = readNonEmptyString(p.email);
    const emailStatus = readNonEmptyString(p.email_status);
    const hasVerifiedEmail = Boolean(email) && emailStatus === "verified";
    const linkedinUrl = p.linkedin_url ? String(p.linkedin_url) : undefined;
    const name = String(p.name ?? `${p.first_name ?? ""} ${p.last_name ?? ""}`).trim();

    people.push({
      id: `apollo_p_${slug(name)}_${people.length}`,
      name: name || "Unknown",
      title: String(p.title ?? "Unknown"),
      company: companyName,
      companyId,
      location: p.city ? String(p.city) : undefined,
      email: hasVerifiedEmail ? email : undefined,
      emailStatus: email ? (hasVerifiedEmail ? "verified" : "unavailable") : undefined,
      emailSource: email ? "apollo" : undefined,
      linkedinUrl,
      evidence: "",
      matchScore: 0,
      channels: {
        email: hasVerifiedEmail,
        linkedin: Boolean(linkedinUrl),
        x: false,
      },
    });
  }

  return { companies: Array.from(companies.values()), people };
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

// ---- Apollo bio/contact fallback (used by Brandon's hooks/enrich context) ----
// PATTERN FROM coldreach/lib/apollo.ts — same defensive contract: no
// APOLLO_API_KEY => { available: false } so callers fall back to the dataset.

export interface ApolloBio {
  headline?: string;
  bio?: string;
}

export interface ApolloBioResult {
  available: boolean;
  data: ApolloBio | null;
  reason?: string;
}

const APOLLO_BIO_TIMEOUT_MS = 8000;

export function isApolloConfigured(): boolean {
  return Boolean(process.env.APOLLO_API_KEY?.trim());
}

/** Pull a person's bio/headline as hook context. Never throws. */
export async function getBio(person: {
  name: string;
  company?: string;
  linkedinUrl?: string;
}): Promise<ApolloBioResult> {
  const key = process.env.APOLLO_API_KEY?.trim();
  if (!key) {
    return {
      available: false,
      data: null,
      reason: "APOLLO_API_KEY not set — skipping Apollo bio.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), APOLLO_BIO_TIMEOUT_MS);
  try {
    const response = await fetch(
      buildPeopleMatchUrl(
        {
          name: person.name,
          company: person.company,
          linkedinUrl: person.linkedinUrl,
        },
        false,
      ),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cache-control": "no-cache",
          accept: "application/json",
          "x-api-key": key,
        },
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      return {
        available: false,
        data: null,
        reason: `Apollo responded ${response.status}`,
      };
    }
    const json = (await response.json()) as {
      person?: { headline?: string; bio?: string };
    };
    return {
      available: true,
      data: { headline: json.person?.headline, bio: json.person?.bio },
    };
  } catch (error) {
    return {
      available: false,
      data: null,
      reason: `Apollo request failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildPeopleMatchUrl(
  person: ApolloContactInput,
  shouldRevealPersonalEmails: boolean,
): string {
  const url = new URL(`${APOLLO_BASE}${APOLLO_MATCH_PATH}`);
  addSearchParam(url, "name", person.name);
  addSearchParam(url, "organization_name", person.company);
  addSearchParam(url, "domain", person.domain);
  addSearchParam(url, "linkedin_url", person.linkedinUrl);
  url.searchParams.set(
    "reveal_personal_emails",
    shouldRevealPersonalEmails ? "true" : "false",
  );
  url.searchParams.set("reveal_phone_number", "false");
  return url.toString();
}

function addSearchParam(url: URL, key: string, value?: string): void {
  const trimmed = value?.trim();
  if (trimmed) url.searchParams.set(key, trimmed);
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
