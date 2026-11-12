/** Progress of one finish attempt, kept so a failed completion can be retried. */
export type OnboardingFinishReceipt = {
  signature: string;
  historySaved: boolean;
  awaitingComplete: boolean;
  jobs: number;
  schools: number;
  skills: number;
  resumes: number;
  setAside: number;
};

/** Stable identity for the roles this finish already stored. */
export function finishSignature(roleIds: string[]): string {
  return [...roleIds].sort().join("\n");
}

/**
 * The history save already landed for this same set of roles.
 * A retry should complete onboarding and leave those rows alone.
 */
export function reuseSavedHistory(
  prior: OnboardingFinishReceipt | null,
  signature: string,
): OnboardingFinishReceipt | null {
  if (!prior?.historySaved || !prior.awaitingComplete) return null;
  if (prior.signature !== signature) return null;
  return prior;
}

export function parseFinishReceipt(raw: string | null): OnboardingFinishReceipt | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.signature !== "string") return null;
  if (typeof row.historySaved !== "boolean" || typeof row.awaitingComplete !== "boolean") return null;
  const jobs = count(row.jobs);
  const schools = count(row.schools);
  const skills = count(row.skills);
  const resumes = count(row.resumes);
  const setAside = count(row.setAside);
  if (jobs == null || schools == null || skills == null || resumes == null || setAside == null) {
    return null;
  }
  return {
    signature: row.signature,
    historySaved: row.historySaved,
    awaitingComplete: row.awaitingComplete,
    jobs,
    schools,
    skills,
    resumes,
    setAside,
  };
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
