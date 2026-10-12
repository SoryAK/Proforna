import type { OnboardingCheckItem } from "@core/onboarding-review";
import type { ExtractedProfile, ExtractedResume } from "@core/resume-extract";
import type { HeldRole, HeldSkill, SetAsideRole } from "@core/resume-compare";

const DB_NAME = "proforna-onboarding";
const STORE = "session";
const KEY = "current";

export type OnboardingDraft = {
  files: Array<{ digest: string; name: string; type: string; bytes: ArrayBuffer }>;
  extracts: Array<{ digest: string; data: ExtractedResume }>;
  readDigests: string[];
  held: HeldRole[];
  heldSkills: HeldSkill[];
  asides: SetAsideRole[];
  cursor: number;
  pass: "verify" | "compare" | "review";
  step: "file" | "check";
  items: OnboardingCheckItem[];
  profileExtract: ExtractedProfile | null;
};

export async function loadOnboardingDraft(): Promise<OnboardingDraft | null> {
  const db = await openDb();
  const row = await request<OnboardingDraft | undefined>(db.transaction(STORE).objectStore(STORE).get(KEY));
  db.close();
  return row ?? null;
}

export async function saveOnboardingDraft(draft: OnboardingDraft): Promise<void> {
  const db = await openDb();
  await request(db.transaction(STORE, "readwrite").objectStore(STORE).put(draft, KEY));
  db.close();
}

export async function clearOnboardingDraft(): Promise<void> {
  const db = await openDb();
  await request(db.transaction(STORE, "readwrite").objectStore(STORE).delete(KEY));
  db.close();
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function request<T>(query: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    query.onsuccess = () => resolve(query.result);
    query.onerror = () => reject(query.error);
  });
}
