import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { isOnboardingProfileComplete } from "../core/onboarding";
import { readProfile, type ProfileRow } from "./occupant";

export function saveFullName(
  db: DatabaseSync,
  occupantId: string,
  fullName: string,
): ProfileRow {
  const trimmed = fullName.trim();
  if (!isOnboardingProfileComplete({ fullName: trimmed })) {
    throw new Error("name-required");
  }
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE profiles SET full_name = ?, updated_at = ? WHERE occupant_id = ?",
  ).run(trimmed, now, occupantId);
  return readProfile(db, occupantId);
}

export function completeOnboarding(
  db: DatabaseSync,
  occupantId: string,
): ProfileRow {
  const profile = readProfile(db, occupantId);
  if (!isOnboardingProfileComplete(profile)) {
    throw new Error("name-required");
  }
  if (profile.onboardingCompletedAt) {
    return profile;
  }
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE profiles SET onboarding_completed_at = ?, updated_at = ? WHERE occupant_id = ?",
  ).run(now, now, occupantId);
  return readProfile(db, occupantId);
}

export type StoredResume = {
  id: string;
  originalName: string;
};

export function storeResume(
  db: DatabaseSync,
  occupantId: string,
  uploadsDir: string,
  file: { name: string; bytes: Uint8Array },
): StoredResume {
  mkdirSync(uploadsDir, { recursive: true });
  const id = randomUUID();
  const storedName = `${id}.bin`;
  writeFileSync(join(uploadsDir, storedName), file.bytes);
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO resumes (id, occupant_id, original_name, stored_name, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, occupantId, file.name, storedName, now);
  return { id, originalName: file.name };
}
