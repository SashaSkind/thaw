/**
 * `/v1/narrow` — broad goal → ranked, REAL people (+ parsed intent + companies).
 *
 * OWNER: Sasha owns the real `/v1/narrow`; this is the integrated stand-in. It
 * returns REAL people only:
 *   1. live Fiber `peopleSearch` results for the goal (real profiles from the API), and
 *   2. a verified real fintech cohort (`REAL_PEOPLE`) whose live posts are known-good.
 * Intent is parsed with Sasha's `parseIntent` (shows the user "we understood X").
 * Every returned person is cached (id → identifiers) so `/v1/hooks` + `/v1/enrich`
 * can fetch that person's actual posts. No fabricated prospects are ever returned.
 *
 * Data layer (Gate 1 decision, see PROGRESS.md): live Fiber → verified real
 * cohort → curated `lib/dataset/yc-fintech.ts` dataset as the always-present
 * STATIC floor. The curated floor is kept because the real cohort has no
 * email-channel people, and the demo needs the email/no-email mix; it cannot
 * fail on stage. Live/cohort results rank above the curated floor.
 */

import type {
  NarrowRequest,
  NarrowResponse,
  ProspectCompany,
  ProspectPerson,
} from "@/lib/types";
import { parseIntent } from "@/lib/parse-intent";
import { getPeople, isFiberConfigured } from "@/lib/fiber";
import { cohortProspects } from "@/lib/mock-data";
import { cachePeople } from "@/lib/people-cache";
import { filterPeople } from "@/lib/dataset/yc-fintech";
import { rankPerson } from "@/lib/rank";

/** De-dupe people by a stable identity (linkedin slug → email → name+company). */
function dedupePeople(people: ProspectPerson[]): ProspectPerson[] {
  const seen = new Set<string>();
  const out: ProspectPerson[] = [];
  for (const p of people) {
    const key = (
      p.linkedinUrl?.match(/\/in\/([^/?#]+)/i)?.[1] ??
      p.email ??
      `${p.name}|${p.company}`
    ).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

const DEFAULT_LIMIT = 8;
const EXACT_QUERY_BOOST = 100;

export interface NarrowPeopleResult {
  people: ProspectPerson[];
  /** "fiber" when live search contributed results, else "cohort". */
  source: "fiber" | "cohort";
  notes: string[];
}

function slugId(slug: string): string {
  return `fiber_${slug}`;
}

function slugFromLinkedin(linkedinUrl?: string): string | undefined {
  return linkedinUrl?.match(/\/in\/([^/?#]+)/i)?.[1];
}

function normalizedText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function hasExactQueryMatch(person: ProspectPerson, query: string): boolean {
  const normalizedQuery = normalizedText(query);
  if (!normalizedQuery) return false;

  const fullName = normalizedText(person.name);
  const company = normalizedText(person.company);
  const nameParts = fullName.split(" ").filter(Boolean);
  const allNamePartsMatch =
    nameParts.length > 0 && nameParts.every((part) => normalizedQuery.includes(part));

  return (
    (fullName.length > 0 && normalizedQuery.includes(fullName)) ||
    (company.length > 0 && normalizedQuery.includes(company)) ||
    (allNamePartsMatch && company.length > 0 && normalizedQuery.includes(company))
  );
}

function applyExactQueryBoost(
  people: ProspectPerson[],
  query: string,
): ProspectPerson[] {
  return people.map((person) => {
    if (!hasExactQueryMatch(person, query)) return person;
    return {
      ...person,
      matchScore: EXACT_QUERY_BOOST,
      evidence: `${person.name} at ${person.company} directly matches the search query.`,
    };
  });
}

/** Map Fiber's relevance score (a small positive float) into a 0..100 match. */
function toMatchScore(relevance?: number): number {
  if (relevance == null) return 70;
  return Math.max(45, Math.min(92, Math.round(50 + relevance * 5)));
}

/** Real people for the goal: verified cohort first, then live Fiber search. */
export async function narrowPeople(
  goal: string,
  limit = 12,
): Promise<NarrowPeopleResult> {
  const notes: string[] = [];
  const cohort = cohortProspects();
  const seenSlugs = new Set(
    cohort
      .map((p) => slugFromLinkedin(p.linkedinUrl))
      .filter(Boolean) as string[],
  );

  const livePeople: ProspectPerson[] = [];

  if (isFiberConfigured()) {
    const res = await getPeople({ query: goal, limit });
    if (res.available) {
      for (const fp of res.data) {
        if (!fp.slug || seenSlugs.has(fp.slug)) continue;
        seenSlugs.add(fp.slug);
        livePeople.push({
          id: slugId(fp.slug),
          name: fp.name,
          title: fp.title ?? "",
          company: fp.company ?? "",
          companyId: "",
          location: fp.location,
          linkedinUrl: fp.linkedinUrl,
          evidence:
            fp.title?.trim() ||
            `${fp.name} — found via live Fiber people search.`,
          matchScore: toMatchScore(fp.relevanceScore),
          channels: { email: false, linkedin: Boolean(fp.linkedinUrl), x: false },
        });
      }
    } else if (res.reason) {
      notes.push(`Fiber peopleSearch: ${res.reason}`);
    }
  } else {
    notes.push("Fiber not configured — returning verified cohort only.");
  }

  // Cache identifiers for everyone so hooks/enrich can resolve them.
  cachePeople(
    [...cohort, ...livePeople].map((p) => ({
      id: p.id,
      name: p.name,
      title: p.title,
      company: p.company,
      location: p.location,
      email: p.email,
      linkedinUrl: p.linkedinUrl,
      xUrl: p.xUrl,
    })),
  );

  const people = [
    ...cohort,
    ...livePeople.sort((a, b) => b.matchScore - a.matchScore),
  ];

  return {
    people,
    source: livePeople.length > 0 ? "fiber" : "cohort",
    notes,
  };
}

/** Derive `ProspectCompany[]` (contract-valid) from the returned people. */
function buildCompanies(people: ProspectPerson[], goal: string): ProspectCompany[] {
  const seen = new Map<string, ProspectCompany>();
  for (const p of people) {
    const name = p.company?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.set(key, {
      id: p.companyId || `co_${key.replace(/[^a-z0-9]+/g, "_")}`,
      name,
      location: p.location,
      stage: "unknown",
      matchReason: `Employer of a prospect matched for "${goal}".`,
    });
  }
  return Array.from(seen.values());
}

export async function narrow(req: NarrowRequest): Promise<NarrowResponse> {
  const limit = req.limit && req.limit > 0 ? req.limit : DEFAULT_LIMIT;
  const intent = await parseIntent(req.query, req.userBackground);

  // Live Fiber + verified real cohort (#7 data layer).
  const { people: realPeople } = await narrowPeople(req.query, Math.max(limit, 12));

  // Gate 1 floor: curated yc-fintech dataset (static, has the email mix, cannot
  // fail). Ranked so it carries evidence + a score; sits below live/cohort.
  const curatedFloor = filterPeople(intent).map((p) => rankPerson(p, intent));

  const merged = applyExactQueryBoost(
    dedupePeople([...realPeople, ...curatedFloor]),
    req.query,
  ).sort(
    (a, b) => b.matchScore - a.matchScore,
  );

  // Cache everyone so /v1/hooks + /v1/enrich can resolve identifiers.
  cachePeople(
    merged.map((p) => ({
      id: p.id,
      name: p.name,
      title: p.title,
      company: p.company,
      location: p.location,
      email: p.email,
      linkedinUrl: p.linkedinUrl,
      xUrl: p.xUrl,
    })),
  );

  let limited = merged.slice(0, limit);

  // Gate 1: guarantee the email mix is visible for the demo. Live Fiber + the
  // real cohort are all no-email and outrank the curated floor, so an email
  // prospect can get sliced out — ensure at least one stays in the result.
  if (limit > 0 && !limited.some((p) => p.channels.email)) {
    const bestEmail = merged.find((p) => p.channels.email);
    if (bestEmail) limited = [...limited.slice(0, limit - 1), bestEmail];
  }

  return {
    intent,
    companies: buildCompanies(limited, req.query),
    people: limited,
  };
}
