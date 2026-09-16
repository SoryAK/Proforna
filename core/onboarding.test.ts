import { describe, expect, it } from "vitest";
import { isOnboardingProfileComplete, needsOnboarding } from "./onboarding";

describe("isOnboardingProfileComplete", () => {
  it("accepts a trimmed name", () => {
    expect(isOnboardingProfileComplete({ fullName: "Sory Kaba " })).toBe(true);
  });

  it("rejects missing or blank names", () => {
    expect(isOnboardingProfileComplete(null)).toBe(false);
    expect(isOnboardingProfileComplete({ fullName: "" })).toBe(false);
    expect(isOnboardingProfileComplete({ fullName: "   " })).toBe(false);
  });
});

describe("needsOnboarding", () => {
  it("is true until the wizard stamps completion", () => {
    expect(needsOnboarding(null)).toBe(true);
    expect(needsOnboarding({ onboardingCompletedAt: null })).toBe(true);
  });

  it("is false after the wizard finishes", () => {
    expect(
      needsOnboarding({ onboardingCompletedAt: "2026-09-16T00:00:00.000Z" }),
    ).toBe(false);
  });
});
