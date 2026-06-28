/**
 * Apollo bio/contact fallback client.
 *
 * OWNER: Brandon (fallback wiring). Used when Fiber social is thin: pulls a
 * person's bio/headline as context for hook extraction. Same defensive contract
 * as the Fiber client — no `APOLLO_API_KEY` => `{ available: false }`, so callers
 * continue down to the curated dataset.
 */

export interface ApolloBio {
  headline?: string;
  bio?: string;
}

export interface ApolloResult {
  available: boolean;
  data: ApolloBio | null;
  reason?: string;
}

const TIMEOUT_MS = 8000;

export function isApolloConfigured(): boolean {
  return Boolean(process.env.APOLLO_API_KEY?.trim());
}

export async function getBio(person: {
  name: string;
  company?: string;
  linkedinUrl?: string;
}): Promise<ApolloResult> {
  const key = process.env.APOLLO_API_KEY?.trim();
  if (!key) {
    return {
      available: false,
      data: null,
      reason: "APOLLO_API_KEY not set — skipping Apollo bio.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch("https://api.apollo.io/v1/people/match", {
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
      data: {
        headline: json.person?.headline,
        bio: json.person?.bio,
      },
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
