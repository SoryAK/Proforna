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
  /** Files and set-asides this finish already stored. */
  draft: string;
};

/** The history payload a finish stores. Role ids are not part of it. */
export type FinishHistory = {
  experience: readonly unknown[];
  education: readonly unknown[];
  skills: readonly string[];
  experienceEvidence: readonly unknown[];
  educationEvidence: readonly unknown[];
  skillFiles: readonly number[];
};

/** Stable identity for the role and skill content this finish already stored. */
export function finishSignature(history: FinishHistory): string {
  return JSON.stringify({
    experience: history.experience,
    education: history.education,
    skills: history.skills,
    experienceEvidence: history.experienceEvidence,
    educationEvidence: history.educationEvidence,
    skillFiles: history.skillFiles,
  });
}

/** Identity of the resumes and set-asides stored with a finish. */
export function finishDraftStamp(input: {
  fileDigests: readonly string[];
  asideIds: readonly string[];
}): string {
  return JSON.stringify({
    files: [...input.fileDigests].sort(),
    asides: [...input.asideIds].sort(),
  });
}

export type PendingFinishRecovery =
  | { action: "complete" }
  | { action: "hold" }
  | { action: "retry"; error: string };

const RECOVERY_DRAFT_ERROR = "Could not reload the saved onboarding. Try again.";

/**
 * Decide whether a pending finish can complete.
 * A failed draft read is not a validated draft, so the receipt stays and the visit can retry.
 * A draft that is missing after a successful read can still complete.
 */
export async function recoverPendingFinish(
  receipt: OnboardingFinishReceipt | null,
  loadDraft: () => Promise<{
    history: FinishHistory;
    fileDigests: readonly string[];
    asideIds: readonly string[];
  } | null>,
): Promise<PendingFinishRecovery> {
  if (!receipt?.awaitingComplete) return { action: "hold" };
  let draft: Awaited<ReturnType<typeof loadDraft>>;
  try {
    draft = await loadDraft();
  } catch {
    return { action: "retry", error: RECOVERY_DRAFT_ERROR };
  }
  if (draft && !receiptMatchesDraft(receipt, draft)) return { action: "hold" };
  return { action: "complete" };
}

/**
 * True when a restored draft is still the one this receipt finished.
 * A newer resume or a changed role must not complete the older receipt.
 */
export function receiptMatchesDraft(
  receipt: OnboardingFinishReceipt | null,
  draft: {
    history: FinishHistory;
    fileDigests: readonly string[];
    asideIds: readonly string[];
  },
): boolean {
  if (!receipt?.awaitingComplete) return false;
  if (receipt.signature !== finishSignature(draft.history)) return false;
  return receipt.draft === finishDraftStamp(draft);
}

/**
 * The history save already landed for this same role and skill content.
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
  if (typeof row.signature !== "string" || typeof row.draft !== "string") return null;
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
    draft: row.draft,
  };
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Draft deletion is cleanup. A storage failure still lets the visit conclude. */
export async function releaseFinishDraft(clearDraft: () => Promise<void>): Promise<void> {
  try {
    await clearDraft();
  } catch {
    /* the finished visit does not wait on this delete */
  }
}
