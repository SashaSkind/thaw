/**
 * Curated demo dataset.
 *
 * OWNER (real): Sasha (curated YC-fintech dataset + ranking, behind `/v1/narrow`).
 * STATUS: local stand-in so Brandon's slice runs before Sasha pushes. It powers
 * two things:
 *   1. the mock `/v1/narrow` endpoint (ranked people for the UI), and
 *   2. the deterministic FALLBACK source for hooks/enrich when Fiber social is
 *      thin or unconfigured (§6 fallback path).
 *
 * The `context` snippets below are clearly-sourced demo material (a curated
 * bio + a couple of public-style posts/news lines per person). The fallback
 * hook extractor only ever surfaces text grounded in these snippets and tags it
 * with its `source`; it never invents shared hometowns/schools (anti-hallucination).
 */

import type { ProspectPerson } from "@/lib/types";

export interface PersonContext {
  /** Short bio line (curated dataset). */
  bio: string;
  /** Recent post/news style snippets with an honest source label. */
  signals: { text: string; source: string }[];
}

export interface CuratedPerson extends ProspectPerson {
  context: PersonContext;
}

export const CURATED_PEOPLE: CuratedPerson[] = [
  {
    id: "p_amara_okafor",
    name: "Amara Okafor",
    title: "Co-founder & CEO",
    company: "Ledgerly",
    companyId: "c_ledgerly",
    location: "Brooklyn, NY",
    email: "amara@ledgerly.com",
    linkedinUrl: "https://www.linkedin.com/in/amara-okafor-ledgerly",
    xUrl: "https://x.com/amarabuilds",
    evidence:
      "YC W24 fintech founder building reconciliation tooling; hiring a founding GTM hire this quarter.",
    matchScore: 94,
    channels: { email: true, linkedin: true, x: true },
    context: {
      bio: "Grew up in Queens, studied CS at NYU, ex-Plaid engineer before founding Ledgerly (YC W24).",
      signals: [
        {
          text: "Just shipped automated multi-entity reconciliation — closing the books in hours, not weeks.",
          source: "demo post (x/@amarabuilds)",
        },
        {
          text: "We're hiring our first GTM person. If you love fintech and hate spreadsheets, DM me.",
          source: "demo post (linkedin)",
        },
        {
          text: "NYU CS alum meetup was a blast — so many fintech builders in one room.",
          source: "curated dataset bio",
        },
      ],
    },
  },
  {
    id: "p_diego_ramirez",
    name: "Diego Ramirez",
    title: "Head of Growth",
    company: "Settle Loop",
    companyId: "c_settleloop",
    location: "Austin, TX",
    email: "diego@settleloop.io",
    linkedinUrl: "https://www.linkedin.com/in/diego-ramirez-growth",
    xUrl: undefined,
    evidence:
      "Scaled outbound at a Series A payments startup; recently posted about cold-outbound conversion benchmarks.",
    matchScore: 88,
    channels: { email: true, linkedin: true, x: false },
    context: {
      bio: "Former D1 soccer player, UT Austin grad, now runs growth at Settle Loop (payments infra).",
      signals: [
        {
          text: "Our reply rate jumped 3x once we led with a real, specific hook instead of a template.",
          source: "demo post (linkedin)",
        },
        {
          text: "Hot take: most B2B cold email fails because it's about the sender, not the recipient.",
          source: "demo post (linkedin)",
        },
      ],
    },
  },
  {
    id: "p_mei_tanaka",
    name: "Mei Tanaka",
    title: "VP Engineering",
    company: "Northstar Pay",
    companyId: "c_northstarpay",
    location: "San Francisco, CA",
    email: undefined,
    linkedinUrl: "https://www.linkedin.com/in/mei-tanaka-eng",
    xUrl: "https://x.com/meibuilds",
    evidence:
      "Leads a 40-person eng org at a growth-stage fintech; speaks about payments reliability.",
    matchScore: 81,
    channels: { email: false, linkedin: true, x: true },
    context: {
      bio: "Carnegie Mellon alum, scaled payments reliability teams; mentors women in fintech eng.",
      signals: [
        {
          text: "Gave a talk on idempotency keys for payments — slides are up, link in bio.",
          source: "demo post (x/@meibuilds)",
        },
        {
          text: "Mentoring three new eng managers this cycle. Leveling up leaders is the best part of the job.",
          source: "demo post (linkedin)",
        },
      ],
    },
  },
  {
    id: "p_samuel_adeyemi",
    name: "Samuel Adeyemi",
    title: "Founder",
    company: "Tally Street",
    companyId: "c_tallystreet",
    location: "Queens, NY",
    email: "sam@tallystreet.com",
    linkedinUrl: "https://www.linkedin.com/in/samuel-adeyemi-tally",
    xUrl: "https://x.com/samtally",
    evidence:
      "Solo founder building SMB bookkeeping automation; active in the indie-fintech community.",
    matchScore: 76,
    channels: { email: true, linkedin: true, x: true },
    context: {
      bio: "Born and raised in Queens; self-taught engineer building Tally Street for small-business owners.",
      signals: [
        {
          text: "Queens represent. Building the fintech I wish my parents' shop had growing up.",
          source: "demo post (x/@samtally)",
        },
        {
          text: "Crossed $10k MRR fully bootstrapped this month. Slow and steady.",
          source: "demo post (linkedin)",
        },
      ],
    },
  },
  {
    id: "p_priya_nair",
    name: "Priya Nair",
    title: "Director of Partnerships",
    company: "Cadence Capital",
    companyId: "c_cadence",
    location: "New York, NY",
    email: "priya.nair@cadencecap.com",
    linkedinUrl: "https://www.linkedin.com/in/priya-nair-partnerships",
    xUrl: undefined,
    evidence:
      "Sources fintech investments and partnerships; recently wrote about embedded finance trends.",
    matchScore: 72,
    channels: { email: true, linkedin: true, x: false },
    context: {
      bio: "Columbia MBA, ex-fintech operator turned investor; focuses on embedded finance.",
      signals: [
        {
          text: "Embedded finance is eating vertical SaaS. The winners will own the ledger.",
          source: "demo news snippet",
        },
      ],
    },
  },
  {
    id: "p_jonas_weber",
    name: "Jonas Weber",
    title: "CTO",
    company: "Flux Reconcile",
    companyId: "c_fluxreconcile",
    location: "Berlin, DE",
    email: undefined,
    linkedinUrl: "https://www.linkedin.com/in/jonas-weber-cto",
    xUrl: "https://x.com/jonasreconcile",
    evidence:
      "Technical co-founder in EU fintech; posts about open-source reconciliation tooling.",
    matchScore: 68,
    channels: { email: false, linkedin: true, x: true },
    context: {
      bio: "TU Berlin grad, open-source maintainer, building reconciliation infra for European fintechs.",
      signals: [
        {
          text: "Open-sourced our ledger diffing library today. Reconciliation should be a solved problem.",
          source: "demo post (x/@jonasreconcile)",
        },
      ],
    },
  },
];

const PEOPLE_BY_ID = new Map(CURATED_PEOPLE.map((p) => [p.id, p]));

export function getCuratedPerson(personId: string): CuratedPerson | undefined {
  return PEOPLE_BY_ID.get(personId);
}

/**
 * Tiny keyword ranker that stands in for Sasha's `/v1/narrow` ranking. Boosts
 * curated people whose evidence/title/company/location match the goal terms,
 * then returns them sorted by score (highest first).
 */
export function rankCuratedPeople(goal: string): ProspectPerson[] {
  const terms = goal
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);

  const scored = CURATED_PEOPLE.map((person) => {
    const haystack = [
      person.title,
      person.company,
      person.evidence,
      person.location ?? "",
      person.context.bio,
    ]
      .join(" ")
      .toLowerCase();

    const matches = terms.reduce(
      (count, term) => (haystack.includes(term) ? count + 1 : count),
      0,
    );
    const boosted = Math.min(100, person.matchScore + matches * 2);

    // Strip the internal `context` field — `/v1/narrow` returns ProspectPerson.
    const { context, ...prospect } = person;
    return { prospect, score: boosted };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .map(({ prospect, score }) => ({ ...prospect, matchScore: score }));
}
