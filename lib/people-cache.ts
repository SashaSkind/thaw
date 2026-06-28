/**
 * Short-lived, in-process resolution cache for people surfaced by `/v1/narrow`.
 *
 * OWNER: Brandon. The contract's `HooksRequest`/`EnrichRequest` carry only a
 * `personId`, so hooks/enrich must resolve a person's identifiers (LinkedIn
 * slug / X handle) from somewhere. When narrow returns LIVE Fiber search results
 * (real people not in any static dataset), we cache their identifiers here so the
 * subsequent hooks/enrich calls can fetch that person's real posts.
 *
 * This is an allowed "short-lived cache for external lookups" (no user data, no
 * sessions). Entries expire after TTL. Note: it's per-process — fine for the
 * single-process dev server / demo; a multi-instance deployment would back this
 * with a shared store (Redis), which is Sasha's spine concern.
 */

export interface ResolvedPerson {
  id: string;
  name: string;
  title?: string;
  company?: string;
  location?: string;
  email?: string;
  linkedinUrl?: string;
  xUrl?: string;
}

interface Entry {
  person: ResolvedPerson;
  expiresAt: number;
}

const TTL_MS = 30 * 60 * 1000; // 30 minutes
const store = new Map<string, Entry>();

export function cachePerson(person: ResolvedPerson): void {
  store.set(person.id, { person, expiresAt: Date.now() + TTL_MS });
}

export function cachePeople(people: ResolvedPerson[]): void {
  for (const person of people) cachePerson(person);
}

export function resolvePerson(id: string): ResolvedPerson | undefined {
  const entry = store.get(id);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    store.delete(id);
    return undefined;
  }
  return entry.person;
}
