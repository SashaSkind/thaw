/**
 * Runs synthetic personas through Thaw's headless /v1 research pipeline.
 */

import { EXPECTED_BRANCHES, personas, type ExpectedBranch, type Persona } from "./personas";

interface ChannelAvailability {
  email: boolean;
  linkedin: boolean;
  x: boolean;
}

interface ProspectPerson {
  id: string;
  name: string;
  title: string;
  company: string;
  companyId: string;
  location?: string;
  email?: string;
  emailStatus?: "verified" | "guessed" | "unavailable";
  emailSource?: "fiber" | "apollo";
  linkedinUrl?: string;
  xUrl?: string;
  evidence: string;
  matchScore: number;
  channels: ChannelAvailability;
}

interface NarrowResponse {
  intent: Record<string, unknown>;
  companies: unknown[];
  people: ProspectPerson[];
}

interface HookCandidate {
  id: string;
  text: string;
  source: string;
  needsUserConfirmation: true;
}

interface HooksResponse {
  hooks: HookCandidate[];
  primarySource?: "fiber" | "fallback";
  notes?: string[];
}

interface EnrichResponse {
  recentContext: string[];
  suggestedAngles: string[];
  primarySource?: "fiber" | "fallback";
}

interface HttpResult {
  status: number;
  body: unknown;
}

interface PersonaResult {
  persona: Persona;
  ok: boolean;
  failures: string[];
  details: string[];
}

interface PipelineResult {
  narrow?: NarrowResponse;
  selectedPerson?: ProspectPerson;
  hooks?: HooksResponse;
  enrich?: EnrichResponse;
}

const DEFAULT_BASE_URL = "http://localhost:3000";
const BASE_URL = (process.env.THAW_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
const SERVICE_SHARED_SECRET = process.env.SERVICE_SHARED_SECRET?.trim();
const COHORT_IDS = new Set([
  "p_henrique_dubugras",
  "p_immad_akhund",
  "p_patrick_collison",
  "p_zach_perret",
]);

async function postJson(path: string, payload: unknown): Promise<HttpResult> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (SERVICE_SHARED_SECRET) {
    headers["x-service-secret"] = SERVICE_SHARED_SECRET;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return { status: response.status, body };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isChannelAvailability(value: unknown): value is ChannelAvailability {
  return (
    isRecord(value) &&
    isBoolean(value.email) &&
    isBoolean(value.linkedin) &&
    isBoolean(value.x)
  );
}

function isProspectPerson(value: unknown): value is ProspectPerson {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.title) &&
    isString(value.company) &&
    isString(value.companyId) &&
    isString(value.evidence) &&
    isNumber(value.matchScore) &&
    isChannelAvailability(value.channels)
  );
}

function isNarrowResponse(value: unknown): value is NarrowResponse {
  return (
    isRecord(value) &&
    isRecord(value.intent) &&
    Array.isArray(value.companies) &&
    Array.isArray(value.people) &&
    value.people.every(isProspectPerson)
  );
}

function isHookCandidate(value: unknown): value is HookCandidate {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.text) &&
    value.text.trim().length > 0 &&
    isString(value.source) &&
    value.source.trim().length > 0 &&
    value.needsUserConfirmation === true
  );
}

function isHooksResponse(value: unknown): value is HooksResponse {
  return isRecord(value) && Array.isArray(value.hooks) && value.hooks.every(isHookCandidate);
}

function isEnrichResponse(value: unknown): value is EnrichResponse {
  return (
    isRecord(value) &&
    isStringArray(value.recentContext) &&
    isStringArray(value.suggestedAngles)
  );
}

function isSortedByMatchScore(people: ProspectPerson[]): boolean {
  return people.every((person, index) => {
    if (index === 0) return true;
    return people[index - 1].matchScore >= person.matchScore;
  });
}

function hasNoSocial(person: ProspectPerson): boolean {
  return !person.channels.linkedin && !person.channels.x;
}

function inferNarrowSource(people: ProspectPerson[]): string {
  if (people.length === 0) return "empty";
  if (people.some((person) => person.id.startsWith("fiber_"))) return "live-fiber-search";
  if (people.every((person) => COHORT_IDS.has(person.id))) return "verified-cohort";
  if (people.some((person) => !COHORT_IDS.has(person.id))) return "curated-floor";
  return "unknown";
}

function formatPerson(person: ProspectPerson | undefined): string {
  if (!person) return "none";
  const channels = [
    person.channels.email ? "email" : "no-email",
    person.channels.linkedin ? "linkedin" : "no-linkedin",
    person.channels.x ? "x" : "no-x",
  ].join("/");
  return `${person.name} at ${person.company} (${person.id}, ${channels}, score=${person.matchScore})`;
}

function pushFailure(failures: string[], condition: boolean, reason: string): void {
  if (!condition) failures.push(reason);
}

async function runResearchPipeline(persona: Persona): Promise<PersonaResult> {
  const failures: string[] = [];
  const details: string[] = [];
  const pipeline: PipelineResult = {};

  const narrowResult = await postJson("/api/v1/narrow", {
    query: persona.targetingPrompt,
    userBackground: persona.userBackground,
  });

  pushFailure(
    failures,
    narrowResult.status >= 200 && narrowResult.status < 300,
    `narrow returned HTTP ${narrowResult.status}`,
  );
  if (!isNarrowResponse(narrowResult.body)) {
    failures.push("narrow response shape is invalid");
    return { persona, ok: false, failures, details };
  }

  pipeline.narrow = narrowResult.body;
  details.push(
    `narrow=${pipeline.narrow.people.length} people source=${inferNarrowSource(
      pipeline.narrow.people,
    )}`,
  );
  pushFailure(
    failures,
    isSortedByMatchScore(pipeline.narrow.people),
    "people are not sorted by matchScore desc",
  );

  applyNarrowBranchAssertions(persona.expectedBranch, pipeline.narrow, failures);

  if (persona.expectedBranch === EXPECTED_BRANCHES.zeroCandidates) {
    return {
      persona,
      ok: failures.length === 0,
      failures,
      details,
    };
  }

  const selectedPerson = pipeline.narrow.people[0];
  pipeline.selectedPerson = selectedPerson;
  details.push(`selected=${formatPerson(selectedPerson)}`);

  if (!selectedPerson) {
    failures.push("no top-ranked person available for hooks/enrich chain");
    return { persona, ok: false, failures, details };
  }

  const hooksResult = await postJson("/api/v1/hooks", { personId: selectedPerson.id });
  pushFailure(
    failures,
    hooksResult.status >= 200 && hooksResult.status < 300,
    `hooks returned HTTP ${hooksResult.status}`,
  );
  if (!isHooksResponse(hooksResult.body)) {
    failures.push("hooks response shape is invalid");
    return { persona, ok: false, failures, details };
  }

  pipeline.hooks = hooksResult.body;
  details.push(
    `hooks=${pipeline.hooks.hooks.length} primary=${pipeline.hooks.primarySource ?? "unknown"}`,
  );
  applyHooksBranchAssertions(persona.expectedBranch, selectedPerson, pipeline.hooks, failures);

  // Stand-in for the human confirmation step: confirm the first grounded hook.
  const confirmedHook = pipeline.hooks.hooks[0]?.text;
  const enrichResult = await postJson("/api/v1/enrich", {
    personId: selectedPerson.id,
    confirmedHook,
  });

  pushFailure(
    failures,
    enrichResult.status >= 200 && enrichResult.status < 300,
    `enrich returned HTTP ${enrichResult.status}`,
  );
  if (!isEnrichResponse(enrichResult.body)) {
    failures.push("enrich response shape is invalid");
    return { persona, ok: false, failures, details };
  }

  pipeline.enrich = enrichResult.body;
  details.push(
    `enrich=context:${pipeline.enrich.recentContext.length} angles:${pipeline.enrich.suggestedAngles.length} primary=${pipeline.enrich.primarySource ?? "unknown"}`,
  );

  return {
    persona,
    ok: failures.length === 0,
    failures,
    details,
  };
}

function applyNarrowBranchAssertions(
  branch: ExpectedBranch,
  narrow: NarrowResponse,
  failures: string[],
): void {
  const topPerson = narrow.people[0];

  switch (branch) {
    case EXPECTED_BRANCHES.noEmailStudent:
      pushFailure(
        failures,
        Boolean(topPerson) && topPerson.channels.email === false,
        "expected the surfaced/top student target to have channels.email === false",
      );
      break;
    case EXPECTED_BRANCHES.emailHappyPath:
      pushFailure(
        failures,
        narrow.people.some((person) => person.channels.email),
        "expected at least one email-present prospect",
      );
      break;
    case EXPECTED_BRANCHES.sparseCareerSwitcher:
    case EXPECTED_BRANCHES.vagueFallback:
      pushFailure(
        failures,
        narrow.people.length > 0,
        "expected fallback to return some ranked people without crashing",
      );
      break;
    case EXPECTED_BRANCHES.emptySocial:
      pushFailure(
        failures,
        narrow.people.some(hasNoSocial),
        "expected at least one surfaced person with no LinkedIn and no X",
      );
      break;
    case EXPECTED_BRANCHES.zeroCandidates:
      pushFailure(
        failures,
        narrow.people.length === 0,
        `expected clean empty people[] but got ${narrow.people.length}`,
      );
      break;
    case EXPECTED_BRANCHES.curatedFloorEmailMix:
      pushFailure(failures, narrow.people.length > 0, "expected curated floor people");
      pushFailure(
        failures,
        narrow.people.some((person) => person.channels.email),
        "expected email-mix guarantee: >=1 prospect with email visible",
      );
      break;
    case EXPECTED_BRANCHES.richSocialFounderInvestor:
      pushFailure(failures, narrow.people.length > 0, "expected investor target people");
      break;
  }
}

function applyHooksBranchAssertions(
  branch: ExpectedBranch,
  selectedPerson: ProspectPerson,
  hooks: HooksResponse,
  failures: string[],
): void {
  pushFailure(
    failures,
    hooks.hooks.every((hook) => hook.needsUserConfirmation === true),
    "expected every hook to require user confirmation",
  );

  if (branch === EXPECTED_BRANCHES.richSocialFounderInvestor) {
    pushFailure(
      failures,
      hooks.hooks.length > 0,
      "expected grounded/non-empty hooks for rich-social founder/investor branch",
    );
  }

  if (branch === EXPECTED_BRANCHES.emptySocial && hasNoSocial(selectedPerson)) {
    pushFailure(
      failures,
      hooks.hooks.length <= 1,
      `expected few/none hooks for empty-social branch but got ${hooks.hooks.length}`,
    );
  }
}

async function main(): Promise<void> {
  const results: PersonaResult[] = [];
  console.log(`Persona sweep: ${BASE_URL}/api/v1 (auth=${SERVICE_SHARED_SECRET ? "secret" : "open"})`);

  for (const persona of personas) {
    const result = await runResearchPipeline(persona);
    results.push(result);
    const status = result.ok ? "PASS" : "FAIL";
    console.log(`\n[${status}] ${persona.name} — ${persona.expectedBranch}`);
    for (const detail of result.details) console.log(`  ${detail}`);
    for (const failure of result.failures) console.log(`  failure: ${failure}`);
  }

  const failures = results.filter((result) => !result.ok);
  console.log(
    `\nPersona sweep complete: ${results.length - failures.length}/${results.length} passed`,
  );

  if (failures.length > 0) {
    console.log("Failures:");
    for (const failure of failures) {
      console.log(`- ${failure.persona.name} (${failure.persona.expectedBranch})`);
      for (const reason of failure.failures) console.log(`  - ${reason}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Persona sweep crashed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
