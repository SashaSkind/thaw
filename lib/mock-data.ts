/**
 * Verified real people for the demo.
 *
 * No fabricated/fictional prospects live here. `REAL_PEOPLE` are real, public
 * fintech founders with verified LinkedIn slugs / X handles, confirmed against
 * Fiber's live endpoints (`profile-posts` / `user-tweets`). They serve two roles:
 *   1. a relevant, high-quality seed cohort for `/v1/narrow` (alongside live
 *      Fiber `peopleSearch` results), and
 *   2. resolvable identifiers so `/v1/hooks` + `/v1/enrich` fetch each person's
 *      ACTUAL recent posts.
 *
 * `context.signals` are intentionally empty — we never fabricate personal hooks;
 * live Fiber data supplies the grounded signals. If Fiber is unavailable, hooks
 * correctly returns few/none rather than inventing anything.
 *
 * Ranking/selection (`/v1/narrow`) is Sasha's domain; this is a stand-in.
 */

import type { ProspectPerson } from "@/lib/types";

export interface PersonContext {
  bio: string;
  signals: { text: string; source: string }[];
}

export interface CuratedPerson extends ProspectPerson {
  context: PersonContext;
}

export const REAL_PEOPLE: CuratedPerson[] = [
  {
    id: "p_henrique_dubugras",
    name: "Henrique Dubugras",
    title: "Co-founder & CEO",
    company: "Brex",
    companyId: "c_brex",
    location: "San Francisco, CA",
    linkedinUrl: "https://www.linkedin.com/in/henriquedubugras",
    evidence:
      "Co-founder of Brex (YC S17 fintech); posts about building and company strategy on LinkedIn.",
    matchScore: 97,
    channels: { email: false, linkedin: true, x: false },
    context: {
      bio: "Co-founder & CEO of Brex; previously co-founded Pagar.me. (public profile)",
      signals: [],
    },
  },
  {
    id: "p_immad_akhund",
    name: "Immad Akhund",
    title: "Co-founder & CEO",
    company: "Mercury",
    companyId: "c_mercury",
    location: "San Francisco, CA",
    xUrl: "https://x.com/immad",
    evidence:
      "Founder/CEO of Mercury (fintech for startups) and active seed investor; posts founder learnings on X.",
    matchScore: 96,
    channels: { email: false, linkedin: false, x: true },
    context: {
      bio: "Co-founder & CEO of Mercury; prior founder (Heyzap, YC W11) and angel investor. (public profile)",
      signals: [],
    },
  },
  {
    id: "p_patrick_collison",
    name: "Patrick Collison",
    title: "Co-founder & CEO",
    company: "Stripe",
    companyId: "c_stripe",
    location: "San Francisco, CA",
    xUrl: "https://x.com/patrickc",
    evidence:
      "Co-founder & CEO of Stripe (payments infrastructure); posts on technology, science, and progress on X.",
    matchScore: 95,
    channels: { email: false, linkedin: false, x: true },
    context: {
      bio: "Co-founder & CEO of Stripe. (public profile)",
      signals: [],
    },
  },
  {
    id: "p_zach_perret",
    name: "Zach Perret",
    title: "Co-founder & CEO",
    company: "Plaid",
    companyId: "c_plaid",
    location: "San Francisco, CA",
    xUrl: "https://x.com/zachperret",
    evidence:
      "Co-founder & CEO of Plaid (financial data connectivity); posts on fintech and company building on X.",
    matchScore: 94,
    channels: { email: false, linkedin: false, x: true },
    context: {
      bio: "Co-founder & CEO of Plaid. (public profile)",
      signals: [],
    },
  },
];

/** Alias retained for any external reference; the demo dataset is all-real. */
export const CURATED_PEOPLE: CuratedPerson[] = REAL_PEOPLE;

const PEOPLE_BY_ID = new Map(CURATED_PEOPLE.map((p) => [p.id, p]));

export function getCuratedPerson(personId: string): CuratedPerson | undefined {
  return PEOPLE_BY_ID.get(personId);
}

/** The real cohort as plain `ProspectPerson`s (strips internal `context`). */
export function cohortProspects(): ProspectPerson[] {
  return REAL_PEOPLE.map(({ context: _context, ...prospect }) => prospect);
}
