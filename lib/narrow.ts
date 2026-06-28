// lib/narrow.ts
// The core of my slice: broad goal -> ranked, specific people with reasons.
//
// Pipeline: parseIntent -> (Apollo, optional) + curated dataset -> merge/dedupe
// -> compute channels -> rank -> sort by score -> slice to limit.
//
// CRITICAL: the live demo path must work on the curated dataset ALONE. Apollo
// is an enhancement, never a dependency, and a data-source failure must never
// throw to the caller.

import type {
  CompanyStage,
  NarrowRequest,
  NarrowResponse,
  ProspectCompany,
  ProspectPerson,
  TargetingIntent,
} from "@/lib/types";
import { parseIntent } from "@/lib/parse-intent";
import { filterCompanies, filterPeople } from "@/lib/dataset/yc-fintech";
import { searchApollo } from "@/lib/apollo";
import { getPeople, type FiberPerson } from "@/lib/fiber";
import { rankPerson } from "@/lib/rank";

const DEFAULT_LIMIT = 8;
const MIN_FIBER_RESULTS = 1; // any live Fiber result should be shown before fallback data
const MIN_APOLLO_RESULTS = 3; // below this we still backfill from the dataset

export async function narrow(req: NarrowRequest): Promise<NarrowResponse> {
  const limit = req.limit && req.limit > 0 ? req.limit : DEFAULT_LIMIT;
  const intent = await parseIntent(req.query, req.userBackground);

  // Dataset results are always computed — they are the reliable backbone.
  const datasetCompanies = filterCompanies(intent);
  const datasetPeople = filterPeople(intent);

  // Fiber enhancement (optional, defensive). This is the sponsor-backed live
  // people/contact source; if it is unavailable we continue with Apollo/dataset.
  let fiberCompanies: ProspectCompany[] = [];
  let fiberPeople: ProspectPerson[] = [];
  const fiber = await getPeople({ query: req.query, limit });
  if (fiber.available && fiber.data.length >= MIN_FIBER_RESULTS) {
    const normalized = normalizeFiberPeople(fiber.data);
    fiberCompanies = normalized.companies;
    fiberPeople = normalized.people;
  }

  // Apollo enhancement (optional, defensive).
  let apolloCompanies: ProspectCompany[] = [];
  let apolloPeople: ProspectPerson[] = [];
  const apollo = await searchApollo(intent, limit);
  if (apollo && apollo.people.length >= MIN_APOLLO_RESULTS) {
    apolloCompanies = apollo.companies;
    apolloPeople = apollo.people;
  }

  const companies = dedupeCompanies([
    ...fiberCompanies,
    ...apolloCompanies,
    ...datasetCompanies,
  ]);
  const companyById = new Map(companies.map((c) => [c.id, c]));

  const mergedPeople = dedupePeople([
    ...fiberPeople,
    ...apolloPeople,
    ...datasetPeople,
  ]);

  // Rank: attach matchScore + evidence, then sort desc and slice.
  const ranked = mergedPeople
    .map((p) => rankPerson(p, intent, companyById.get(p.companyId)))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);

  // Only return companies represented in the returned people (keeps payload tight),
  // but always include at least the matched companies if no people surfaced.
  const personCompanyIds = new Set(ranked.map((p) => p.companyId));
  const returnedCompanies = ranked.length
    ? companies.filter((c) => personCompanyIds.has(c.id))
    : companies.slice(0, limit);

  return {
    intent,
    companies: returnedCompanies,
    people: ranked,
  };
}

function normalizeFiberPeople(people: FiberPerson[]): {
  companies: ProspectCompany[];
  people: ProspectPerson[];
} {
  const companies = new Map<string, ProspectCompany>();
  const normalizedPeople: ProspectPerson[] = [];

  people.forEach((person, index) => {
    const companyName = person.company?.trim() || "Unknown company";
    const companyId = `fiber_co_${slug(companyName)}`;

    if (!companies.has(companyId)) {
      companies.set(companyId, {
        id: companyId,
        name: companyName,
        location: person.location,
        stage: "unknown" as CompanyStage,
        matchReason: "Returned by Fiber people search",
      });
    }

    const name = person.name.trim() || "Unknown contact";
    normalizedPeople.push({
      id: `fiber_p_${slug(person.id ?? `${name}_${companyName}_${index}`)}`,
      name,
      title: person.title?.trim() || "Unknown",
      company: companyName,
      companyId,
      location: person.location,
      email: person.email,
      linkedinUrl: person.linkedinUrl,
      xUrl: person.xUrl,
      evidence: "",
      matchScore: 0,
      channels: {
        email: Boolean(person.email),
        linkedin: Boolean(person.linkedinUrl),
        x: Boolean(person.xUrl),
      },
    });
  });

  return { companies: Array.from(companies.values()), people: normalizedPeople };
}

function dedupeCompanies(list: ProspectCompany[]): ProspectCompany[] {
  const seen = new Map<string, ProspectCompany>();
  for (const c of list) {
    const key = (c.domain ?? c.name).toLowerCase();
    if (!seen.has(key)) seen.set(key, c);
  }
  return Array.from(seen.values());
}

function dedupePeople(list: ProspectPerson[]): ProspectPerson[] {
  const seen = new Map<string, ProspectPerson>();
  for (const p of list) {
    // Prefer email as identity, else name+company.
    const key = (p.email ?? `${p.name}|${p.company}`).toLowerCase();
    if (!seen.has(key)) seen.set(key, p);
  }
  return Array.from(seen.values());
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export type { TargetingIntent };
