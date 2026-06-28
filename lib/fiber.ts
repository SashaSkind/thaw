/**
 * Fiber AI client — the project's riskiest dependency (Task 0 spike), now wired
 * to the REAL Fiber API (https://api.fiber.ai, discovered via /llms.txt + /ai-docs).
 *
 * OWNER: Brandon. Goal: reliably get a real person's recent LinkedIn/X posts so
 * hooks/enrich can run on live social data.
 *
 * Verified live (returns real data):
 *   - getRecentPosts -> LinkedIn `POST /v1/linkedin-live-fetch/profile-posts`
 *                       +  X     `POST /v1/twitter/user-tweets`
 *   - reverseEmailLookup -> `POST /v1/email-to-person/single`
 *   - getPeople -> `POST /v1/people-search`
 * Best-effort (correct endpoint, schema may need confirming) and not on the demo
 * critical path (narrow is Sasha's): getCompanies, contactWaterfall.
 *
 * Auth: Fiber takes the API key in the JSON body (`apiKey`); we also send the
 * `x-api-key` header. Every method stays defensive — no key / non-2xx / timeout
 * => `{ available: false }`, so callers fall back (the demo can never faceplant).
 */

export interface FiberPost {
  text: string;
  url?: string;
  platform: "linkedin" | "x" | "unknown";
  postedAt?: string;
}

export interface FiberPerson {
  id?: string;
  name: string;
  title?: string;
  company?: string;
  location?: string;
  email?: string;
  linkedinUrl?: string;
  xUrl?: string;
  slug?: string;
  /** Fiber relevance score for the search query (used for ranking). */
  relevanceScore?: number;
}

export interface FiberCompany {
  id?: string;
  name: string;
  domain?: string;
  description?: string;
}

export interface FiberContact {
  type: "email" | "phone" | "linkedin" | "x";
  value: string;
  confidence?: number;
}

export interface FiberResult<T> {
  available: boolean;
  data: T;
  reason?: string;
}

export interface PeopleCriteria {
  query: string;
  limit?: number;
}

export interface CompanyCriteria {
  query: string;
  limit?: number;
}

const DEFAULT_TIMEOUT_MS = 12000;
// Live LinkedIn/X fetches are slower (Fiber recommends ~1 minute).
const LIVE_FETCH_TIMEOUT_MS = 45000;

function fiberConfig(): { key: string; baseUrl: string } | null {
  const key = process.env.FIBER_API_KEY?.trim();
  if (!key) return null;
  const baseUrl = (
    process.env.FIBER_API_BASE_URL?.trim() || "https://api.fiber.ai"
  ).replace(/\/$/, "");
  return { key, baseUrl };
}

export function isFiberConfigured(): boolean {
  return fiberConfig() !== null;
}

/** Extract a LinkedIn slug from a profile URL (or pass a slug through). */
function linkedinSlug(linkedinUrl?: string): string | null {
  if (!linkedinUrl) return null;
  const match = linkedinUrl.match(/\/in\/([^/?#]+)/i);
  if (match) return match[1];
  // Already a bare slug?
  if (!linkedinUrl.includes("/")) return linkedinUrl.trim() || null;
  return null;
}

/** Extract an X/Twitter handle from a profile URL (or pass a handle through). */
function xHandle(xUrl?: string): string | null {
  if (!xUrl) return null;
  const match = xUrl.match(/(?:x\.com|twitter\.com)\/(@?[^/?#]+)/i);
  const raw = match ? match[1] : xUrl;
  const handle = raw.replace(/^@/, "").trim();
  return handle || null;
}

async function fiberCall<T>(
  path: string,
  body: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<FiberResult<T | null>> {
  const config = fiberConfig();
  if (!config) {
    return {
      available: false,
      data: null,
      reason: "FIBER_API_KEY not set — using fallback source.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.key,
      },
      // Fiber expects the key in the body as `apiKey`.
      body: JSON.stringify({ apiKey: config.key, ...body }),
      signal: controller.signal,
    });

    if (!response.ok) {
      let detail = `${response.status} ${response.statusText}`;
      try {
        const errBody = (await response.json()) as { message?: string };
        if (errBody?.message) detail += ` — ${errBody.message}`;
      } catch {
        // ignore non-JSON error bodies
      }
      return { available: false, data: null, reason: `Fiber responded ${detail}` };
    }

    const data = (await response.json()) as T;
    return { available: true, data };
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? `Fiber request timed out after ${timeoutMs}ms`
        : `Fiber request failed: ${
            error instanceof Error ? error.message : String(error)
          }`;
    return { available: false, data: null, reason };
  } finally {
    clearTimeout(timeout);
  }
}

interface LinkedInPostsResponse {
  output?: {
    data?: {
      caption?: string | null;
      subText?: string | null;
      postUrl?: string | null;
      postedAt?: { noLaterThan?: string | null } | null;
      author?: { name?: string | null } | null;
    }[];
  };
}

interface XTweetsResponse {
  output?: {
    tweets?: {
      id?: string;
      text?: string;
      handle?: string;
      createdAt?: string;
      isRetweet?: boolean;
    }[];
  };
}

/**
 * THE CRITICAL ONE. Recent LinkedIn/X posts for a person. Pulls LinkedIn profile
 * posts and/or X tweets (whichever identifiers the person has), merges them, and
 * returns original-authored content only (skips empty reshares / retweets).
 */
export async function getRecentPosts(
  person: FiberPerson,
): Promise<FiberResult<FiberPost[]>> {
  const config = fiberConfig();
  if (!config) {
    return {
      available: false,
      data: [],
      reason: "FIBER_API_KEY not set — using fallback source.",
    };
  }

  const posts: FiberPost[] = [];
  const reasons: string[] = [];

  const slug = linkedinSlug(person.linkedinUrl);
  if (slug) {
    const res = await fiberCall<LinkedInPostsResponse>(
      "/v1/linkedin-live-fetch/profile-posts",
      { identifier: slug },
      LIVE_FETCH_TIMEOUT_MS,
    );
    if (res.available) {
      for (const p of res.data?.output?.data ?? []) {
        const text = (p.caption ?? p.subText ?? "").trim();
        if (!text) continue; // skip bare reshares with no commentary
        posts.push({
          text,
          url: p.postUrl ?? undefined,
          platform: "linkedin",
          postedAt: p.postedAt?.noLaterThan ?? undefined,
        });
      }
    } else if (res.reason) {
      reasons.push(`LinkedIn: ${res.reason}`);
    }
  }

  const handle = xHandle(person.xUrl);
  if (handle) {
    const res = await fiberCall<XTweetsResponse>("/v1/twitter/user-tweets", {
      handle,
    });
    if (res.available) {
      for (const t of res.data?.output?.tweets ?? []) {
        const text = (t.text ?? "").trim();
        if (!text || t.isRetweet || text.startsWith("RT @")) continue;
        posts.push({
          text,
          url: t.id ? `https://x.com/${handle}/status/${t.id}` : undefined,
          platform: "x",
          postedAt: t.createdAt,
        });
      }
    } else if (res.reason) {
      reasons.push(`X: ${res.reason}`);
    }
  }

  if (posts.length > 0) {
    return { available: true, data: posts.slice(0, 8) };
  }
  return {
    available: false,
    data: [],
    reason:
      reasons.join("; ") ||
      (slug || handle
        ? "No recent posts returned."
        : "No LinkedIn/X identifier for this person."),
  };
}

interface PeopleSearchResponse {
  output?: {
    data?: {
      name?: string | null;
      full_name?: string | null;
      headline?: string | null;
      primary_slug?: string | null;
      slugs?: (string | null)[] | null;
      url?: string | null;
      locality?: string | null;
      inferred_location?: { city?: string | null; state_name?: string | null } | null;
      current_job?: { company_name?: string | null } | null;
      relevance_score?: number | null;
    }[];
  };
}

/** Derive a company name from a LinkedIn headline like "Founder at Acme". */
function companyFromHeadline(headline?: string | null): string | undefined {
  if (!headline) return undefined;
  const atMatch = headline.match(/\bat\s+(.+?)(?:\s*[|·]|$)/i);
  if (atMatch) return atMatch[1].trim();
  return undefined;
}

function locationString(p: {
  locality?: string | null;
  inferred_location?: { city?: string | null; state_name?: string | null } | null;
}): string | undefined {
  if (p.locality) return p.locality;
  const city = p.inferred_location?.city;
  const state = p.inferred_location?.state_name;
  const parts = [city, state].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

export async function getPeople(
  criteria: PeopleCriteria,
): Promise<FiberResult<FiberPerson[]>> {
  const res = await fiberCall<PeopleSearchResponse>("/v1/people-search", {
    searchParams: { keywords: { anyOf: [criteria.query] } },
  });
  const people: FiberPerson[] = (res.data?.output?.data ?? [])
    .slice(0, criteria.limit ?? 12)
    .map((p) => {
      const slug = p.primary_slug ?? p.slugs?.find(Boolean) ?? undefined;
      const company =
        p.current_job?.company_name?.trim() || companyFromHeadline(p.headline);
      return {
        name: p.name ?? p.full_name ?? "Unknown",
        title: p.headline ?? undefined,
        company: company || undefined,
        location: locationString(p),
        slug: slug ?? undefined,
        linkedinUrl: slug
          ? `https://www.linkedin.com/in/${slug}`
          : p.url ?? undefined,
        relevanceScore: p.relevance_score ?? undefined,
      } satisfies FiberPerson;
    });
  return { available: res.available, reason: res.reason, data: people };
}

interface CompanySearchResponse {
  output?: {
    data?: {
      name?: string | null;
      domain?: string | null;
      description?: string | null;
    }[];
  };
}

export async function getCompanies(
  criteria: CompanyCriteria,
): Promise<FiberResult<FiberCompany[]>> {
  const res = await fiberCall<CompanySearchResponse>("/v1/company-search", {
    searchParams: { keywords: { anyOf: [criteria.query] } },
  });
  const companies: FiberCompany[] = (res.data?.output?.data ?? [])
    .slice(0, criteria.limit ?? 10)
    .map((c) => ({
      name: c.name ?? "Unknown",
      domain: c.domain ?? undefined,
      description: c.description ?? undefined,
    }));
  return { available: res.available, reason: res.reason, data: companies };
}

interface EmailToPersonResponse {
  output?: {
    data?: { full_name?: string | null; name?: string | null }[];
  };
}

export async function reverseEmailLookup(
  email: string,
): Promise<FiberResult<FiberPerson | null>> {
  const res = await fiberCall<EmailToPersonResponse>(
    "/v1/email-to-person/single",
    { email },
  );
  const first = res.data?.output?.data?.[0];
  const person: FiberPerson | null = first
    ? { name: first.full_name ?? first.name ?? "Unknown", email }
    : null;
  return { available: res.available && Boolean(person), reason: res.reason, data: person };
}

interface ContactRevealResponse {
  output?: {
    emails?: { email?: string }[];
    phones?: { phone?: string }[];
  };
}

/**
 * Best-effort contact discovery for the no-email path (syncQuickContactReveal).
 * Endpoint is correct; body schema is best-effort and degrades gracefully.
 */
export async function contactWaterfall(
  person: FiberPerson,
): Promise<FiberResult<FiberContact[]>> {
  const slug = linkedinSlug(person.linkedinUrl);
  const res = await fiberCall<ContactRevealResponse>(
    "/v1/contact-details/single",
    slug ? { linkedinIdentifier: slug } : { name: person.name, company: person.company },
  );
  const contacts: FiberContact[] = [];
  for (const e of res.data?.output?.emails ?? []) {
    if (e.email) contacts.push({ type: "email", value: e.email });
  }
  for (const p of res.data?.output?.phones ?? []) {
    if (p.phone) contacts.push({ type: "phone", value: p.phone });
  }
  return { available: res.available, reason: res.reason, data: contacts };
}
