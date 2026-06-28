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
  NarrowRequest,
  NarrowResponse,
  ProspectCompany,
  ProspectPerson,
  TargetingIntent,
} from "@/lib/types";
import { parseIntent } from "@/lib/parse-intent";
import { filterCompanies, filterPeople } from "@/lib/dataset/yc-fintech";
import { searchApollo } from "@/lib/apollo";
import { rankPerson } from "@/lib/rank";

const DEFAULT_LIMIT = 8;
const MIN_APOLLO_RESULTS = 3; // below this we still backfill from the dataset

export async function narrow(req: NarrowRequest): Promise<NarrowResponse> {
  const limit = req.limit && req.limit > 0 ? req.limit : DEFAULT_LIMIT;
  const intent = await parseIntent(req.query, req.userBackground);

  // Dataset results are always computed — they are the reliable backbone.
  const datasetCompanies = filterCompanies(intent);
  const datasetPeople = filterPeople(intent);

  // Apollo enhancement (optional, defensive).
  let apolloCompanies: ProspectCompany[] = [];
  let apolloPeople: ProspectPerson[] = [];
  const apollo = await searchApollo(intent, limit);
  if (apollo && apollo.people.length >= MIN_APOLLO_RESULTS) {
    apolloCompanies = apollo.companies;
    apolloPeople = apollo.people;
  }

  const companies = dedupeCompanies([...apolloCompanies, ...datasetCompanies]);
  const companyById = new Map(companies.map((c) => [c.id, c]));

  const mergedPeople = dedupePeople([...apolloPeople, ...datasetPeople]);

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

export type { TargetingIntent };
