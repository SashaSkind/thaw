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

export interface ApolloResult {
  companies: ProspectCompany[];
  people: ProspectPerson[];
}

export interface ApolloEmailEnrichmentResult {
  people: ProspectPerson[];
  available: boolean;
  reason?: string;
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
    const res = await fetch(`${APOLLO_BASE}/mixed_people/api_search`, {
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

    // People API Search intentionally does not return email addresses. If Apollo
    // ever includes one here, only trust it when it explicitly says verified.
    const emailStatus = p.email_status ? String(p.email_status) : undefined;
    const email =
      emailStatus === "verified" && p.email ? String(p.email) : undefined;
    const linkedinUrl = p.linkedin_url ? String(p.linkedin_url) : undefined;
    const name = String(p.name ?? `${p.first_name ?? ""} ${p.last_name ?? ""}`).trim();

    people.push({
      id: `apollo_p_${slug(name)}_${people.length}`,
      name: name || "Unknown",
      title: String(p.title ?? "Unknown"),
      company: companyName,
      companyId,
      location: p.city ? String(p.city) : undefined,
      email,
      emailStatus: email ? "verified" : "unavailable",
      emailSource: email ? "apollo" : undefined,
      linkedinUrl,
      evidence: "",
      matchScore: 0,
      channels: {
        email: Boolean(email),
        linkedin: Boolean(linkedinUrl),
        x: false,
      },
    });
  }

  return { companies: Array.from(companies.values()), people };
}

export async function enrichPeopleEmailsWithApollo(
  people: ProspectPerson[],
  companies: ProspectCompany[],
): Promise<ApolloEmailEnrichmentResult> {
  const key = process.env.APOLLO_API_KEY?.trim();
  if (!key) {
    return {
      available: false,
      people,
      reason: "APOLLO_API_KEY not set — emails not enriched by Apollo.",
    };
  }

  const companyById = new Map(companies.map((company) => [company.id, company]));
  const details = people.slice(0, 10).map((person) => {
    const company = companyById.get(person.companyId);
    return {
      name: person.name,
      organization_name: person.company,
      domain: company?.domain,
      linkedin_url: person.linkedinUrl,
    };
  });

  try {
    const response = await fetch(
      `${APOLLO_BASE}/people/bulk_match?reveal_personal_emails=false&reveal_phone_number=false`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cache-control": "no-cache",
          "x-api-key": key,
        },
        body: JSON.stringify({ details }),
        signal: AbortSignal.timeout(8000),
      },
    );

    if (!response.ok) {
      return {
        available: false,
        people,
        reason: `Apollo bulk enrichment responded ${response.status}`,
      };
    }

    const data = (await response.json()) as { matches?: unknown[] };
    const matches = Array.isArray(data.matches) ? data.matches : [];
    const enriched = people.map((person, index) => {
      const match = findApolloMatch(person, matches[index], matches);
      const email = verifiedApolloEmail(match);
      if (!email && person.emailSource === "fiber" && person.email) {
        return person;
      }
      if (!email) {
        return {
          ...person,
          email: undefined,
          emailStatus: "unavailable" as const,
          emailSource: undefined,
          channels: { ...person.channels, email: false },
        };
      }

      return {
        ...person,
        email,
        emailStatus: "verified" as const,
        emailSource: "apollo" as const,
        channels: { ...person.channels, email: true },
      };
    });

    return { available: true, people: enriched };
  } catch (error) {
    return {
      available: false,
      people,
      reason: `Apollo bulk enrichment failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

function findApolloMatch(
  person: ProspectPerson,
  indexedMatch: unknown,
  matches: unknown[],
): Record<string, unknown> | null {
  const indexed = asRecord(indexedMatch);
  if (isLikelyApolloMatch(person, indexed)) return indexed;
  return (
    matches.map(asRecord).find((match) => isLikelyApolloMatch(person, match)) ??
    null
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function isLikelyApolloMatch(
  person: ProspectPerson,
  match: Record<string, unknown> | null,
): match is Record<string, unknown> {
  if (!match) return false;
  const matchName = String(match.name ?? "").toLowerCase();
  const matchLinkedin = String(match.linkedin_url ?? "").toLowerCase();
  const personLinkedin = (person.linkedinUrl ?? "").toLowerCase();
  if (personLinkedin && matchLinkedin && matchLinkedin === personLinkedin) {
    return true;
  }
  return matchName === person.name.toLowerCase();
}

function verifiedApolloEmail(match: Record<string, unknown> | null): string | undefined {
  if (!match) return undefined;
  const emailStatus = String(match.email_status ?? "").toLowerCase();
  const email = match.email ? String(match.email) : undefined;
  if (emailStatus !== "verified" || !email || !isValidEmail(email)) {
    return undefined;
  }
  return email;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
    const response = await fetch(`${APOLLO_BASE}/people/match`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key },
      body: JSON.stringify({
        name: person.name,
        organization_name: person.company,
        linkedin_url: person.linkedinUrl,
      }),
      signal: controller.signal,
    });
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
