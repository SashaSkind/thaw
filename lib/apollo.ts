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

const APOLLO_BASE = "https://api.apollo.io/v1";

export interface ApolloResult {
  companies: ProspectCompany[];
  people: ProspectPerson[];
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

    const email = p.email ? String(p.email) : undefined;
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

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}
