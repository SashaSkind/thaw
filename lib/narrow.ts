/**
 * `/v1/narrow` logic (a stand-in for Sasha's endpoint).
 *
 * OWNER: Sasha owns the real `/v1/narrow`; this is Brandon's stand-in so the demo
 * has data. It returns REAL people only:
 *   1. live Fiber `peopleSearch` results for the goal (real profiles from the API), and
 *   2. a verified real fintech cohort (`REAL_PEOPLE`) whose live posts are known-good.
 * Every returned person is cached (id → identifiers) so `/v1/hooks` + `/v1/enrich`
 * can fetch that person's actual posts. No fabricated prospects are ever returned.
 *
 * If Fiber is unconfigured/unavailable, narrow returns just the verified cohort
 * (still real). It never invents people.
 */

import { getPeople, isFiberConfigured } from "@/lib/fiber";
import { cohortProspects } from "@/lib/mock-data";
import { cachePeople } from "@/lib/people-cache";
import type { ProspectPerson } from "@/lib/types";

export interface NarrowResult {
  people: ProspectPerson[];
  /** "fiber" when live search contributed results, else "cohort". */
  source: "fiber" | "cohort";
  notes: string[];
}

function slugId(slug: string): string {
  return `fiber_${slug}`;
}

/** Map Fiber's relevance score (a small positive float) into a 0..100 match. */
function toMatchScore(relevance?: number): number {
  if (relevance == null) return 70;
  return Math.max(45, Math.min(92, Math.round(50 + relevance * 5)));
}

export async function narrowPeople(goal: string): Promise<NarrowResult> {
  const notes: string[] = [];
  const cohort = cohortProspects();
  const seenSlugs = new Set(
    cohort
      .map((p) => p.linkedinUrl?.match(/\/in\/([^/?#]+)/i)?.[1])
      .filter(Boolean) as string[],
  );

  let liveCount = 0;
  const livePeople: ProspectPerson[] = [];

  if (isFiberConfigured()) {
    const res = await getPeople({ query: goal, limit: 12 });
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
      liveCount = livePeople.length;
    } else if (res.reason) {
      notes.push(`Fiber peopleSearch: ${res.reason}`);
    }
  } else {
    notes.push("Fiber not configured — returning verified cohort only.");
  }

  // Cache identifiers for everyone we return so hooks/enrich can resolve them.
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

  // Cohort first (known-good live posts), then live results by match score.
  const people = [
    ...cohort,
    ...livePeople.sort((a, b) => b.matchScore - a.matchScore),
  ];

  return {
    people,
    source: liveCount > 0 ? "fiber" : "cohort",
    notes,
  };
}
