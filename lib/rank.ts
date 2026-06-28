// lib/rank.ts
// Transparent, explainable scoring. Judges (and users) like seeing *why* a
// person ranked where they did, so scoring is deterministic and the matched
// criteria are turned into a one-line `evidence` string.

import type {
  CompanyStage,
  ProspectCompany,
  ProspectPerson,
  TargetingIntent,
} from "@/lib/types";

const WEIGHTS = {
  role: 30,
  industry: 20,
  geography: 15,
  stage: 15,
  hasEmail: 10,
  hasSocial: 5,
  specificityMax: 10,
} as const;

interface Hits {
  role: boolean;
  industry: boolean;
  geography: boolean;
  stage: boolean;
  hasEmail: boolean;
  hasSocial: boolean;
}

function lc(values: string[] | undefined): string[] {
  return (values ?? []).map((v) => v.toLowerCase().trim()).filter(Boolean);
}

function roleMatches(title: string, roles: string[]): boolean {
  if (roles.length === 0) return false;
  const t = title.toLowerCase();
  return roles.some((r) => {
    if (r.includes("found")) return t.includes("found");
    return t.includes(r);
  });
}

function industryMatches(
  category: string | undefined,
  industries: string[],
): boolean {
  if (industries.length === 0 || !category) return false;
  const c = category.toLowerCase();
  return industries.some((i) => c.includes(i) || i.includes(c));
}

function geographyMatches(
  location: string | undefined,
  geos: string[],
): boolean {
  if (geos.length === 0 || !location) return false;
  const loc = location.toLowerCase();
  return geos.some((g) => {
    if (/\bny\b|new york|nyc/.test(g)) {
      return /new york|nyc|\bny\b/.test(loc);
    }
    return loc.includes(g) || g.includes(loc);
  });
}

function stageMatches(
  stage: CompanyStage | undefined,
  stages: CompanyStage[],
): boolean {
  if (stages.length === 0 || !stage) return false;
  return stages.includes(stage);
}

function computeHits(
  person: ProspectPerson,
  intent: TargetingIntent,
  company?: ProspectCompany,
): Hits {
  return {
    role: roleMatches(person.title, lc(intent.roles)),
    industry: industryMatches(company?.category, lc(intent.industry)),
    geography: geographyMatches(person.location, lc(intent.geography)),
    stage: stageMatches(company?.stage, (intent.stage ?? []) as CompanyStage[]),
    hasEmail: person.channels.email,
    hasSocial: person.channels.linkedin || person.channels.x,
  };
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

/** Score a person 0..100 against the parsed intent. */
export function scorePerson(
  person: ProspectPerson,
  intent: TargetingIntent,
  company?: ProspectCompany,
): number {
  const hits = computeHits(person, intent, company);
  let score = 0;
  if (hits.role) score += WEIGHTS.role;
  if (hits.industry) score += WEIGHTS.industry;
  if (hits.geography) score += WEIGHTS.geography;
  if (hits.stage) score += WEIGHTS.stage;
  if (hits.hasEmail) score += WEIGHTS.hasEmail;
  if (hits.hasSocial) score += WEIGHTS.hasSocial;

  // Specificity bonus: reward matching more of the *requested* criteria.
  const requested = [
    (intent.roles ?? []).length > 0,
    (intent.industry ?? []).length > 0,
    (intent.geography ?? []).length > 0,
    (intent.stage ?? []).length > 0,
  ].filter(Boolean).length;
  const matched = [hits.role, hits.industry, hits.geography, hits.stage].filter(
    Boolean,
  ).length;
  if (requested > 0) {
    score += Math.round((matched / requested) * WEIGHTS.specificityMax);
  }

  return clamp(score);
}

/** One-line, human-readable reason derived from which criteria hit. */
export function buildEvidence(
  person: ProspectPerson,
  intent: TargetingIntent,
  company?: ProspectCompany,
): string {
  const hits = computeHits(person, intent, company);
  const parts: string[] = [];

  if (hits.role) {
    parts.push(person.title);
  } else {
    parts.push(person.title);
  }

  const companyDescriptors: string[] = [];
  if (hits.geography && person.location) companyDescriptors.push(person.location.split(",")[0].trim());
  if (hits.stage && company?.stage && company.stage !== "unknown") {
    companyDescriptors.push(company.stage.replace("_", " "));
  }
  if (hits.industry && company?.category) companyDescriptors.push(company.category);

  let sentence = parts.join(" ");
  sentence += ` at ${person.company}`;
  if (companyDescriptors.length > 0) {
    sentence += ` (${companyDescriptors.join(", ")})`;
  }

  if (hits.hasEmail) {
    sentence += " — email on file";
  } else if (person.channels.linkedin) {
    sentence += " — reachable on LinkedIn (no email)";
  } else if (person.channels.x) {
    sentence += " — reachable on X (no email)";
  } else {
    sentence += " — no direct channel found";
  }

  return sentence;
}

/** Max points added from sender-background overlap (ranking only, never intent). */
const BACKGROUND_BIAS_MAX = 8;

const BACKGROUND_STOPWORDS = new Set([
  "about",
  "also",
  "been",
  "from",
  "have",
  "help",
  "into",
  "more",
  "that",
  "their",
  "them",
  "they",
  "this",
  "with",
  "your",
]);

function significantBackgroundTerms(userBackground: string): string[] {
  return Array.from(
    new Set(
      userBackground
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((term) => term.length > 3 && !BACKGROUND_STOPWORDS.has(term)),
    ),
  );
}

/**
 * Small matchScore bonus when a prospect overlaps the sender's background.
 * Used for personalization only — never changes parsed intent criteria.
 */
export function backgroundBiasBonus(
  person: ProspectPerson,
  userBackground?: string,
): number {
  const background = userBackground?.trim();
  if (!background) return 0;

  const haystack =
    `${person.title} ${person.company} ${person.evidence} ${person.location ?? ""}`.toLowerCase();
  const terms = significantBackgroundTerms(background);
  if (terms.length === 0) return 0;

  let hits = 0;
  for (const term of terms) {
    if (haystack.includes(term)) hits += 1;
  }
  if (hits === 0) return 0;

  return Math.min(BACKGROUND_BIAS_MAX, hits * 2);
}

/** Apply sender-background ranking bias without mutating intent-derived fields. */
export function applyBackgroundBias(
  person: ProspectPerson,
  userBackground?: string,
): ProspectPerson {
  const bonus = backgroundBiasBonus(person, userBackground);
  if (bonus === 0) return person;
  return {
    ...person,
    matchScore: clamp(person.matchScore + bonus),
  };
}

/** Apply score + evidence to a person, returning a new object. */
export function rankPerson(
  person: ProspectPerson,
  intent: TargetingIntent,
  company?: ProspectCompany,
): ProspectPerson {
  return {
    ...person,
    matchScore: scorePerson(person, intent, company),
    evidence: buildEvidence(person, intent, company),
  };
}
