const KEY = "proforna-onboarding-evidence-role";

export function readEvidenceRole(): string | null {
  try {
    const id = sessionStorage.getItem(KEY);
    return id && id.trim() ? id : null;
  } catch {
    return null;
  }
}

export function writeEvidenceRole(id: string | null): void {
  try {
    if (id && id.trim()) sessionStorage.setItem(KEY, id);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* the role still focuses for this visit */
  }
}

export function clearEvidenceRole(): void {
  writeEvidenceRole(null);
}
