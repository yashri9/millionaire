/**
 * onboardingQuestions.ts — the cohort questions asked once, right after a
 * user's first login (src/app/onboarding/page.tsx). Answers are stored on
 * profiles.onboarding_* and are for segmentation/analytics only — nothing in
 * the product logic branches on them.
 */
export type OnboardingQuestion = {
  key: "onboarding_role" | "onboarding_use_case" | "onboarding_team_size" | "onboarding_referral_source" | "onboarding_challenge";
  question: string;
  subtext?: string;
  options: { value: string; label: string }[];
};

export const ONBOARDING_QUESTIONS: OnboardingQuestion[] = [
  {
    key: "onboarding_role",
    question: "What's your role?",
    options: [
      { value: "sales_rep", label: "Sales rep / Account Executive" },
      { value: "founder", label: "Founder / Executive" },
      { value: "marketer", label: "Marketing" },
      { value: "sales_engineer", label: "Sales Engineer / Solutions" },
      { value: "other", label: "Other" },
    ],
  },
  {
    key: "onboarding_use_case",
    question: "What will you mainly use Deck Agent for?",
    options: [
      { value: "sales_pitch", label: "Sales pitches to prospects" },
      { value: "investor", label: "Investor / fundraising decks" },
      { value: "product_demo", label: "Product demos" },
      { value: "training", label: "Internal training material" },
      { value: "other", label: "Other" },
    ],
  },
  {
    key: "onboarding_team_size",
    question: "How big is your team?",
    options: [
      { value: "solo", label: "Just me" },
      { value: "small", label: "2–10 people" },
      { value: "medium", label: "11–50 people" },
      { value: "large", label: "50+ people" },
    ],
  },
  {
    key: "onboarding_challenge",
    question: "What's your biggest challenge with sales decks today?",
    options: [
      { value: "no_finish", label: "Prospects don't finish watching them" },
      { value: "no_visibility", label: "No idea if/how they engaged" },
      { value: "repeat_explaining", label: "Too much time re-explaining the same deck" },
      { value: "no_time_to_personalize", label: "No time to personalize every send" },
      { value: "other", label: "Other" },
    ],
  },
  {
    key: "onboarding_referral_source",
    question: "How did you hear about Deck Agent?",
    options: [
      { value: "search", label: "Search engine" },
      { value: "social", label: "Social media" },
      { value: "referral", label: "A friend or colleague" },
      { value: "other", label: "Other" },
    ],
  },
];
