/** Product identity for shells. Management logic lives in this folder. */
export const PRODUCT = {
  name: "Proforna",
  kind: "personal-career-management",
} as const;

export {
  isOnboardingProfileComplete,
  needsOnboarding,
  type OnboardingProfile,
} from "./onboarding";
