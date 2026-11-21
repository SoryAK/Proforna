// Prototypes stay on each developer's machine and are never imported by the app.

function hashPath(): string {
  return window.location.hash.replace(/^#\/?/, "").split("?")[0];
}

/** In development, `#onboarding` reopens the real onboarding for review. */
export function readReviewOnboarding(): boolean {
  if (!import.meta.env.DEV) return false;
  return hashPath() === "onboarding";
}
