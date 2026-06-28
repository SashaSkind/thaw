/**
 * Synthetic personas for the headless Thaw research pipeline sweep.
 */

export const EXPECTED_BRANCHES = {
  noEmailStudent: "no-email-student",
  emailHappyPath: "email-happy-path",
  richSocialFounderInvestor: "rich-social-founder-investor",
  sparseCareerSwitcher: "sparse-career-switcher",
  vagueFallback: "vague-fallback",
  emptySocial: "empty-social",
  zeroCandidates: "zero-candidates",
  curatedFloorEmailMix: "curated-floor-email-mix",
} as const;

export type ExpectedBranch =
  (typeof EXPECTED_BRANCHES)[keyof typeof EXPECTED_BRANCHES];

export interface Persona {
  name: string;
  targetingPrompt: string;
  userBackground: string;
  expectedBranch: ExpectedBranch;
}

export const personas: Persona[] = [
  {
    name: "Student targeting a YC internship mentor",
    targetingPrompt:
      "Henrique Dubugras Brex YC founder for an undergraduate internship coffee chat",
    userBackground:
      "Computer science student who built a small payments side project and wants advice on landing a YC startup internship.",
    expectedBranch: EXPECTED_BRANCHES.noEmailStudent,
  },
  {
    name: "GTM engineer targeting a customer company",
    targetingPrompt:
      "Maya Chen Northgate Pay founder email customer coffee chat for GTM engineering",
    userBackground:
      "GTM engineer who has implemented onboarding analytics for fintech customers and wants a short customer discovery chat.",
    expectedBranch: EXPECTED_BRANCHES.emailHappyPath,
  },
  {
    name: "Founder targeting an investor with rich social context",
    targetingPrompt:
      "Immad Akhund Mercury founder angel investor startup fundraising advice",
    userBackground:
      "Founder building finance workflow automation who wants investor feedback on early go-to-market strategy.",
    expectedBranch: EXPECTED_BRANCHES.richSocialFounderInvestor,
  },
  {
    name: "Career switcher with sparse context",
    targetingPrompt: "founding engineers at fintech startups in New York",
    userBackground: "Operations analyst switching into software.",
    expectedBranch: EXPECTED_BRANCHES.sparseCareerSwitcher,
  },
  {
    name: "Deliberately vague targeting prompt",
    targetingPrompt: "people in tech",
    userBackground:
      "Generalist exploring coffee chats and intentionally providing little targeting detail.",
    expectedBranch: EXPECTED_BRANCHES.vagueFallback,
  },
  {
    name: "Target expected to have no LinkedIn or X",
    targetingPrompt:
      "back office compliance leader at a quiet private fintech with no LinkedIn or X profile",
    userBackground:
      "Compliance analyst looking for a low-public-profile operator to ask about risk controls.",
    expectedBranch: EXPECTED_BRANCHES.emptySocial,
  },
  {
    name: "Impossible zero-candidate query",
    targetingPrompt:
      "chief submarine payments architect at a non-existent antarctic lunar bank",
    userBackground:
      "Synthetic negative test: this should return a clean empty candidate list if the research API supports zero-result handling.",
    expectedBranch: EXPECTED_BRANCHES.zeroCandidates,
  },
  {
    name: "Curated floor with email-mix guarantee",
    targetingPrompt:
      "Maya Chen Northgate Pay YC fintech founder reachable email",
    userBackground:
      "Founder doing broad discovery where live search may miss and the curated static floor should keep the pipeline usable.",
    expectedBranch: EXPECTED_BRANCHES.curatedFloorEmailMix,
  },
];
