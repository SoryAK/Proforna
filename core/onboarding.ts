export type OnboardingProfile = {
  fullName?: string | null;
  onboardingCompletedAt?: string | Date | null;
} | null | undefined;

/** Profile step: a usable name on the profile. */
export function isOnboardingProfileComplete(
  profile: OnboardingProfile,
): boolean {
  return Boolean(profile?.fullName?.trim());
}

/** First install is unfinished until the wizard writes this timestamp. */
export function needsOnboarding(profile: OnboardingProfile): boolean {
  return !profile?.onboardingCompletedAt;
}
