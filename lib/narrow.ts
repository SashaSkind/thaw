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
 * The fake `lib/dataset/yc-fintech.ts` is intentionally NOT used as a data source
 * here — the live path is real. If Fiber is unconfigured/unavailable, narrow
 * returns just the verified cohort (still real), never invented people.
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

const DEFAULT_LIMIT = 8;

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
  const { people } = await narrowPeople(req.query, Math.max(limit, 12));
  const limited = people.slice(0, limit);
  return {
    intent,
    companies: buildCompanies(limited, req.query),
    people: limited,
  };
}
