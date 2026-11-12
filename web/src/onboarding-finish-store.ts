import { parseFinishReceipt, type OnboardingFinishReceipt } from "@core/onboarding-finish";

const KEY = "proforna-onboarding-finish";

export function readFinishReceipt(): OnboardingFinishReceipt | null {
  try {
    return parseFinishReceipt(sessionStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function writeFinishReceipt(receipt: OnboardingFinishReceipt): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(receipt));
  } catch {
    /* a private window still finishes this visit */
  }
}

export function clearFinishReceipt(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
}
