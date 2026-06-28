// lib/dataset/yc-fintech.ts
// Curated fallback dataset: the demo's reliability backbone (and Brandon's
// safety net). The live demo path MUST work on this dataset alone — Apollo is
// only an enhancement. Names/companies are realistic-but-illustrative.

import type {
  CompanyStage,
  ProspectCompany,
  ProspectPerson,
  TargetingIntent,
} from "@/lib/types";

export const COMPANIES: ProspectCompany[] = [
  {
    id: "co_northgate",
    name: "Northgate Pay",
    domain: "northgatepay.com",
    category: "fintech",
    location: "New York, NY",
    stage: "series_b",
    matchReason: "NYC YC-backed payments infra, raised Series B in 2025",
  },
  {
    id: "co_ledgerly",
    name: "Ledgerly",
    domain: "ledgerly.io",
    category: "fintech",
    location: "New York, NY",
    stage: "series_b",
    matchReason: "Brooklyn-based accounting automation, Series B fintech",
  },
  {
    id: "co_brightvault",
    name: "BrightVault",
    domain: "brightvault.com",
    category: "fintech",
    location: "New York, NY",
    stage: "series_b",
    matchReason: "NYC consumer savings app, YC alum, Series B",
  },
  {
    id: "co_stipend",
    name: "Stipend",
    domain: "stipend.co",
    category: "fintech",
    location: "New York, NY",
    stage: "series_a",
    matchReason: "Manhattan payroll/benefits fintech, Series A",
  },
  {
    id: "co_cobalt",
    name: "Cobalt Credit",
    domain: "cobaltcredit.com",
    category: "fintech",
    location: "New York, NY",
    stage: "series_b",
    matchReason: "NYC SMB lending platform, YC-backed, Series B",
  },
  {
    id: "co_meridian",
    name: "Meridian Risk",
    domain: "meridianrisk.ai",
    category: "fintech",
    location: "New York, NY",
    stage: "series_c",
    matchReason: "NYC fraud/risk infra, later-stage fintech",
  },
  {
    id: "co_quill",
    name: "Quill Finance",
    domain: "quillfinance.com",
    category: "fintech",
    location: "New York, NY",
    stage: "seed",
    matchReason: "Early NYC embedded-finance startup, YC seed",
  },
  {
    id: "co_tessellate",
    name: "Tessellate",
    domain: "tessellate.io",
    category: "fintech",
    location: "New York, NY",
    stage: "series_b",
    matchReason: "NYC treasury management, Series B, YC-backed",
  },
  {
    id: "co_harborline",
    name: "Harborline",
    domain: "harborline.com",
    category: "fintech",
    location: "Jersey City, NJ",
    stage: "series_b",
    matchReason: "NYC-metro cross-border payments, Series B",
  },
  {
    id: "co_sablecard",
    name: "Sable Card",
    domain: "sablecard.com",
    category: "fintech",
    location: "New York, NY",
    stage: "series_a",
    matchReason: "NYC corporate card startup, Series A, YC alum",
  },
  {
    id: "co_atlasclear",
    name: "AtlasClear",
    domain: "atlasclear.com",
    category: "fintech",
    location: "New York, NY",
    stage: "growth",
    matchReason: "NYC clearing/settlement platform, growth stage",
  },
  {
    id: "co_pennywise",
    name: "Pennywise",
    domain: "pennywise.app",
    category: "fintech",
    location: "New York, NY",
    stage: "series_b",
    matchReason: "NYC budgeting + wealth app, Series B, YC-backed",
  },
  {
    id: "co_verarails",
    name: "Vera Rails",
    domain: "verarails.com",
    category: "fintech",
    location: "New York, NY",
    stage: "series_b",
    matchReason: "NYC payments rails / ledger API, Series B",
  },
  {
    id: "co_summitledger",
    name: "Summit Ledger",
    domain: "summitledger.com",
    category: "fintech",
    location: "Boston, MA",
    stage: "series_b",
    matchReason: "Northeast fintech (Boston) accounting infra, Series B",
  },
  {
    id: "co_keelpay",
    name: "Keel Pay",
    domain: "keelpay.com",
    category: "fintech",
    location: "San Francisco, CA",
    stage: "series_b",
    matchReason: "SF payments startup (non-NYC), Series B, YC-backed",
  },
  {
    id: "co_lumenhealth",
    name: "Lumen Health",
    domain: "lumenhealth.com",
    category: "healthtech",
    location: "New York, NY",
    stage: "series_b",
    matchReason: "NYC healthtech (non-fintech) for exclusion/contrast tests",
  },
  {
    id: "co_driftlabs",
    name: "Drift Labs",
    domain: "driftlabs.xyz",
    category: "crypto",
    location: "New York, NY",
    stage: "series_a",
    matchReason: "NYC crypto startup — useful for exclusion handling",
  },
  {
    id: "co_oakfield",
    name: "Oakfield Insurance",
    domain: "oakfield.com",
    category: "insurtech",
    location: "New York, NY",
    stage: "series_b",
    matchReason: "NYC insurtech, Series B, fintech-adjacent",
  },
];

const COMPANY_BY_ID: Record<string, ProspectCompany> = Object.fromEntries(
  COMPANIES.map((c) => [c.id, c]),
);

function channels(p: {
  email?: string;
  linkedinUrl?: string;
  xUrl?: string;
}) {
  return {
    email: Boolean(p.email),
    linkedin: Boolean(p.linkedinUrl),
    x: Boolean(p.xUrl),
  };
}

// People are defined with the source fields; `channels`, `company`, and a
// placeholder `evidence`/`matchScore` are derived so the records stay DRY.
interface PersonSeed {
  id: string;
  name: string;
  title: string;
  companyId: string;
  email?: string;
  linkedinUrl?: string;
  xUrl?: string;
}

const PEOPLE_SEED: PersonSeed[] = [
  // Northgate Pay
  { id: "p_north_1", name: "Maya Chen", title: "Co-Founder & CEO", companyId: "co_northgate", email: "maya@northgatepay.com", linkedinUrl: "https://linkedin.com/in/mayachen", xUrl: "https://x.com/mayachen" },
  { id: "p_north_2", name: "Daniel Okafor", title: "Co-Founder & CTO", companyId: "co_northgate", linkedinUrl: "https://linkedin.com/in/danielokafor" },
  // Ledgerly
  { id: "p_ledger_1", name: "Sofia Romano", title: "Founder & CEO", companyId: "co_ledgerly", email: "sofia@ledgerly.io", linkedinUrl: "https://linkedin.com/in/sofiaromano" },
  { id: "p_ledger_2", name: "Aaron Wells", title: "Head of Growth", companyId: "co_ledgerly", email: "aaron@ledgerly.io", linkedinUrl: "https://linkedin.com/in/aaronwells" },
  // BrightVault
  { id: "p_bright_1", name: "Priya Nair", title: "Co-Founder & CEO", companyId: "co_brightvault", linkedinUrl: "https://linkedin.com/in/priyanair", xUrl: "https://x.com/priyanair" },
  { id: "p_bright_2", name: "Marcus Hale", title: "Co-Founder & CPO", companyId: "co_brightvault", email: "marcus@brightvault.com", linkedinUrl: "https://linkedin.com/in/marcushale" },
  // Stipend
  { id: "p_stip_1", name: "Lena Petrova", title: "Founder & CEO", companyId: "co_stipend", email: "lena@stipend.co", linkedinUrl: "https://linkedin.com/in/lenapetrova" },
  { id: "p_stip_2", name: "Tobias Frank", title: "VP Engineering", companyId: "co_stipend", linkedinUrl: "https://linkedin.com/in/tobiasfrank" },
  // Cobalt Credit
  { id: "p_cobalt_1", name: "James Mwangi", title: "Co-Founder & CEO", companyId: "co_cobalt", email: "james@cobaltcredit.com", linkedinUrl: "https://linkedin.com/in/jamesmwangi", xUrl: "https://x.com/jamesmwangi" },
  { id: "p_cobalt_2", name: "Rachel Stein", title: "Co-Founder & COO", companyId: "co_cobalt", linkedinUrl: "https://linkedin.com/in/rachelstein" },
  // Meridian Risk
  { id: "p_merid_1", name: "Victor Alonso", title: "Founder & CEO", companyId: "co_meridian", email: "victor@meridianrisk.ai", linkedinUrl: "https://linkedin.com/in/victoralonso" },
  { id: "p_merid_2", name: "Hannah Yoo", title: "Head of Data Science", companyId: "co_meridian", linkedinUrl: "https://linkedin.com/in/hannahyoo" },
  // Quill Finance
  { id: "p_quill_1", name: "Ethan Briggs", title: "Founder & CEO", companyId: "co_quill", email: "ethan@quillfinance.com", xUrl: "https://x.com/ethanbriggs" },
  { id: "p_quill_2", name: "Nadia Hassan", title: "Founding Engineer", companyId: "co_quill", linkedinUrl: "https://linkedin.com/in/nadiahassan" },
  // Tessellate
  { id: "p_tess_1", name: "Grace Liu", title: "Co-Founder & CEO", companyId: "co_tessellate", email: "grace@tessellate.io", linkedinUrl: "https://linkedin.com/in/graceliu", xUrl: "https://x.com/graceliu" },
  { id: "p_tess_2", name: "Owen Carter", title: "Co-Founder & CTO", companyId: "co_tessellate", linkedinUrl: "https://linkedin.com/in/owencarter" },
  // Harborline
  { id: "p_harbor_1", name: "Diego Fuentes", title: "Founder & CEO", companyId: "co_harborline", email: "diego@harborline.com", linkedinUrl: "https://linkedin.com/in/diegofuentes" },
  { id: "p_harbor_2", name: "Amelia Brooks", title: "Head of Partnerships", companyId: "co_harborline", linkedinUrl: "https://linkedin.com/in/ameliabrooks" },
  // Sable Card
  { id: "p_sable_1", name: "Ravi Desai", title: "Co-Founder & CEO", companyId: "co_sablecard", email: "ravi@sablecard.com", linkedinUrl: "https://linkedin.com/in/ravidesai", xUrl: "https://x.com/ravidesai" },
  { id: "p_sable_2", name: "Chloe Martin", title: "Co-Founder & CMO", companyId: "co_sablecard", linkedinUrl: "https://linkedin.com/in/chloemartin" },
  // AtlasClear
  { id: "p_atlas_1", name: "Benjamin Stark", title: "CEO", companyId: "co_atlasclear", email: "ben@atlasclear.com", linkedinUrl: "https://linkedin.com/in/benjaminstark" },
  { id: "p_atlas_2", name: "Isabel Ortega", title: "Chief Compliance Officer", companyId: "co_atlasclear", linkedinUrl: "https://linkedin.com/in/isabelortega" },
  // Pennywise
  { id: "p_penny_1", name: "Noah Kim", title: "Co-Founder & CEO", companyId: "co_pennywise", email: "noah@pennywise.app", linkedinUrl: "https://linkedin.com/in/noahkim", xUrl: "https://x.com/noahkim" },
  { id: "p_penny_2", name: "Olivia Grant", title: "Co-Founder & Head of Design", companyId: "co_pennywise", linkedinUrl: "https://linkedin.com/in/oliviagrant" },
  // Vera Rails
  { id: "p_vera_1", name: "Samuel Adeyemi", title: "Founder & CEO", companyId: "co_verarails", email: "samuel@verarails.com", linkedinUrl: "https://linkedin.com/in/samueladeyemi" },
  { id: "p_vera_2", name: "Elena Vasquez", title: "VP Sales", companyId: "co_verarails", email: "elena@verarails.com", linkedinUrl: "https://linkedin.com/in/elenavasquez" },
  // Summit Ledger (Boston)
  { id: "p_summit_1", name: "Patrick O'Neil", title: "Founder & CEO", companyId: "co_summitledger", email: "patrick@summitledger.com", linkedinUrl: "https://linkedin.com/in/patrickoneil" },
  { id: "p_summit_2", name: "Yuki Tanaka", title: "CTO", companyId: "co_summitledger", linkedinUrl: "https://linkedin.com/in/yukitanaka" },
  // Keel Pay (SF)
  { id: "p_keel_1", name: "Andre Silva", title: "Co-Founder & CEO", companyId: "co_keelpay", email: "andre@keelpay.com", linkedinUrl: "https://linkedin.com/in/andresilva" },
  { id: "p_keel_2", name: "Fiona Walsh", title: "Co-Founder & CTO", companyId: "co_keelpay", linkedinUrl: "https://linkedin.com/in/fionawalsh" },
  // Lumen Health (healthtech, NYC)
  { id: "p_lumen_1", name: "Dr. Aisha Bello", title: "Founder & CEO", companyId: "co_lumenhealth", email: "aisha@lumenhealth.com", linkedinUrl: "https://linkedin.com/in/aishabello" },
  // Drift Labs (crypto, NYC)
  { id: "p_drift_1", name: "Kai Nakamura", title: "Founder", companyId: "co_driftlabs", xUrl: "https://x.com/kainakamura" },
  // Oakfield Insurance (insurtech, NYC)
  { id: "p_oak_1", name: "Teresa Lindgren", title: "Co-Founder & CEO", companyId: "co_oakfield", email: "teresa@oakfield.com", linkedinUrl: "https://linkedin.com/in/teresalindgren" },
  { id: "p_oak_2", name: "Gabriel Mensah", title: "Co-Founder & CTO", companyId: "co_oakfield", linkedinUrl: "https://linkedin.com/in/gabrielmensah" },
];

export const PEOPLE: ProspectPerson[] = PEOPLE_SEED.map((s) => {
  const company = COMPANY_BY_ID[s.companyId];
  return {
    id: s.id,
    name: s.name,
    title: s.title,
    company: company?.name ?? "Unknown",
    companyId: s.companyId,
    location: company?.location,
    email: s.email,
    linkedinUrl: s.linkedinUrl,
    xUrl: s.xUrl,
    evidence: "", // filled in by ranking
    matchScore: 0, // filled in by ranking
    channels: channels(s),
  };
});

// ---- query helpers ----

function lc(values: string[] | undefined): string[] {
  return (values ?? []).map((v) => v.toLowerCase().trim()).filter(Boolean);
}

function matchesAny(haystack: string, needles: string[]): boolean {
  if (needles.length === 0) return true; // no constraint => everything matches
  const h = haystack.toLowerCase();
  return needles.some((n) => h.includes(n) || n.includes(h));
}

function geoMatches(location: string | undefined, geos: string[]): boolean {
  if (geos.length === 0) return true;
  if (!location) return false;
  const loc = location.toLowerCase();
  return geos.some((g) => {
    // Treat "new york"/"nyc"/"ny" as equivalent-ish.
    if (/\bny\b|new york|nyc/.test(g)) {
      return /new york|nyc|\bny\b/.test(loc);
    }
    return loc.includes(g) || g.includes(loc);
  });
}

function stageMatches(stage: CompanyStage, stages: CompanyStage[]): boolean {
  if (stages.length === 0) return true;
  return stages.includes(stage);
}

function isExcluded(text: string, exclusions: string[]): boolean {
  if (exclusions.length === 0) return false;
  const t = text.toLowerCase();
  return exclusions.some((e) => t.includes(e));
}

/** Filter the curated companies by a parsed intent. */
export function filterCompanies(intent: TargetingIntent): ProspectCompany[] {
  const industry = lc(intent.industry);
  const geos = lc(intent.geography);
  const stages = (intent.stage ?? []) as CompanyStage[];
  const exclusions = lc(intent.exclusions);

  return COMPANIES.filter((c) => {
    const haystackForExclude = `${c.name} ${c.category ?? ""} ${c.matchReason}`;
    if (isExcluded(haystackForExclude, exclusions)) return false;
    if (!matchesAny(c.category ?? "", industry)) return false;
    if (!geoMatches(c.location, geos)) return false;
    if (!stageMatches(c.stage, stages)) return false;
    return true;
  });
}

/** Filter the curated people by a parsed intent (uses their company too). */
export function filterPeople(intent: TargetingIntent): ProspectPerson[] {
  const matchedCompanyIds = new Set(filterCompanies(intent).map((c) => c.id));
  const roles = lc(intent.roles);
  const exclusions = lc(intent.exclusions);

  return PEOPLE.filter((p) => {
    if (!matchedCompanyIds.has(p.companyId)) return false;
    if (isExcluded(`${p.title} ${p.company}`, exclusions)) return false;
    if (roles.length > 0) {
      // Map common role asks onto titles.
      const title = p.title.toLowerCase();
      const roleHit = roles.some((r) => {
        if (r.includes("found")) return title.includes("found");
        if (r === "ceo") return title.includes("ceo");
        if (r === "cto") return title.includes("cto");
        if (r === "coo") return title.includes("coo");
        if (r === "cmo") return title.includes("cmo");
        if (r === "cpo") return title.includes("cpo");
        return title.includes(r);
      });
      if (!roleHit) return false;
    }
    return true;
  });
}

export function getPersonById(id: string): ProspectPerson | undefined {
  return PEOPLE.find((p) => p.id === id);
}
