/**
 * Fiber AI client — the project's riskiest dependency (Task 0 spike).
 *
 * OWNER: Brandon. Goal: reliably get a real person's recent LinkedIn/X posts so
 * hooks/enrich can run on live social data. Every method is defensive:
 *   - no `FIBER_API_KEY` configured  -> returns `{ available: false }` (caller falls back)
 *   - network error / non-2xx / timeout -> returns `{ available: false, reason }`
 * Callers (hooks/enrich) MUST treat `available: false` as "use the fallback path"
 * so the demo can never faceplant on flaky social data (§9 guardrail).
 *
 * The endpoint paths are best-effort guesses for Fiber's REST surface and are
 * easy to retarget once the sponsor confirms the real routes / MCP. Until a key
 * is present the spike resolves to the FALLBACK branch by design.
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

const DEFAULT_TIMEOUT_MS = 8000;

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

async function fiberFetch<T>(
  path: string,
  body: unknown,
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
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.key}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        available: false,
        data: null,
        reason: `Fiber responded ${response.status} ${response.statusText}`,
      };
    }

    const data = (await response.json()) as T;
    return { available: true, data };
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? `Fiber request timed out after ${DEFAULT_TIMEOUT_MS}ms`
        : `Fiber request failed: ${
            error instanceof Error ? error.message : String(error)
          }`;
    return { available: false, data: null, reason };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getCompanies(
  criteria: CompanyCriteria,
): Promise<FiberResult<FiberCompany[]>> {
  const result = await fiberFetch<{ companies?: FiberCompany[] }>(
    "/v1/companies/search",
    { query: criteria.query, limit: criteria.limit ?? 10 },
  );
  return {
    available: result.available,
    reason: result.reason,
    data: result.data?.companies ?? [],
  };
}

export async function getPeople(
  criteria: PeopleCriteria,
): Promise<FiberResult<FiberPerson[]>> {
  const result = await fiberFetch<{ people?: FiberPerson[] }>(
    "/v1/people/search",
    { query: criteria.query, limit: criteria.limit ?? 10 },
  );
  return {
    available: result.available,
    reason: result.reason,
    data: result.data?.people ?? [],
  };
}

/**
 * THE CRITICAL ONE. Recent LinkedIn/X posts for a person. If this is reliable,
 * live social hooks become the demo closer; if not, hooks/enrich fall back to
 * news + Apollo bio + the curated dataset.
 */
export async function getRecentPosts(
  person: FiberPerson,
): Promise<FiberResult<FiberPost[]>> {
  const result = await fiberFetch<{ posts?: FiberPost[] }>(
    "/v1/social/recent-posts",
    {
      name: person.name,
      linkedinUrl: person.linkedinUrl,
      xUrl: person.xUrl,
      company: person.company,
    },
  );
  return {
    available: result.available,
    reason: result.reason,
    data: result.data?.posts ?? [],
  };
}

export async function reverseEmailLookup(
  email: string,
): Promise<FiberResult<FiberPerson | null>> {
  const result = await fiberFetch<{ person?: FiberPerson }>(
    "/v1/contacts/reverse-email",
    { email },
  );
  return {
    available: result.available,
    reason: result.reason,
    data: result.data?.person ?? null,
  };
}

/**
 * Best-effort contact discovery for the no-email path: try multiple sources in
 * sequence and return whatever channels Fiber can resolve.
 */
export async function contactWaterfall(
  person: FiberPerson,
): Promise<FiberResult<FiberContact[]>> {
  const result = await fiberFetch<{ contacts?: FiberContact[] }>(
    "/v1/contacts/waterfall",
    {
      name: person.name,
      company: person.company,
      linkedinUrl: person.linkedinUrl,
    },
  );
  return {
    available: result.available,
    reason: result.reason,
    data: result.data?.contacts ?? [],
  };
}
