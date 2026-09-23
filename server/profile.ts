import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { isOnboardingProfileComplete } from "../core/onboarding";
import {
  PROFILE_AVATAR_MAX_BYTES,
  avatarExtension,
  isAvatarType,
  prepareProfile,
  type ProfileInput,
} from "../core/profile";
import { saveEvidence } from "./career-memory";
import { readProfile, type ProfileRow } from "./occupant";

export class ProfileError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export function saveProfile(
  db: DatabaseSync,
  occupantId: string,
  input: ProfileInput,
  location: { latitude: number | null; longitude: number | null } = {
    latitude: null,
    longitude: null,
  },
): ProfileRow {
  const prepared = prepareProfile(input);
  if (!prepared.ok) {
    throw new ProfileError(prepared.error);
  }
  const now = new Date().toISOString();
  const value = prepared.value;
  db.prepare(
    `UPDATE profiles SET
      full_name = ?,
      headline = ?,
      address = ?,
      address_latitude = ?,
      address_longitude = ?,
      city = ?,
      state = ?,
      bio = ?,
      linkedin_url = ?,
      github_url = ?,
      portfolio_url = ?,
      updated_at = ?
     WHERE occupant_id = ?`,
  ).run(
    value.fullName,
    value.headline,
    value.address,
    location.latitude,
    location.longitude,
    value.city,
    value.state,
    value.bio,
    value.linkedinUrl,
    value.githubUrl,
    value.portfolioUrl,
    now,
    occupantId,
  );
  return readProfile(db, occupantId);
}

export function completeOnboarding(
  db: DatabaseSync,
  occupantId: string,
): ProfileRow {
  const profile = readProfile(db, occupantId);
  if (!isOnboardingProfileComplete(profile)) {
    throw new ProfileError("name-required");
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

export function storeAvatar(
  db: DatabaseSync,
  occupantId: string,
  uploadsDir: string,
  file: { type: string; bytes: Uint8Array },
): ProfileRow {
  if (!isAvatarType(file.type)) {
    throw new ProfileError("avatar-type");
  }
  if (file.bytes.byteLength > PROFILE_AVATAR_MAX_BYTES) {
    throw new ProfileError("avatar-too-large");
  }
  const ext = avatarExtension(file.type);
  if (!ext) throw new ProfileError("avatar-type");

  mkdirSync(uploadsDir, { recursive: true });
  const previous = avatarStoredName(db, occupantId);
  const storedName = `avatar-${randomUUID()}.${ext}`;
  writeFileSync(join(uploadsDir, storedName), file.bytes);
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE profiles SET avatar_stored_name = ?, updated_at = ? WHERE occupant_id = ?",
  ).run(storedName, now, occupantId);
  if (previous) {
    try {
      unlinkSync(join(uploadsDir, previous));
    } catch {
      /* leftover file is harmless */
    }
  }
  return readProfile(db, occupantId);
}

export function loadAvatar(
  db: DatabaseSync,
  occupantId: string,
  uploadsDir: string,
): { bytes: Uint8Array; type: string } | null {
  const stored = avatarStoredName(db, occupantId);
  if (!stored) return null;
  const type =
    stored.endsWith(".png")
      ? "image/png"
      : stored.endsWith(".webp")
        ? "image/webp"
        : stored.endsWith(".gif")
          ? "image/gif"
          : "image/jpeg";
  try {
    return { bytes: new Uint8Array(readFileSync(join(uploadsDir, stored))), type };
  } catch {
    return null;
  }
}

function avatarStoredName(
  db: DatabaseSync,
  occupantId: string,
): string | null {
  const row = db
    .prepare(
      "SELECT avatar_stored_name AS name FROM profiles WHERE occupant_id = ?",
    )
    .get(occupantId) as { name: string | null } | undefined;
  return row?.name ?? null;
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
  const fullPath = join(uploadsDir, storedName);
  writeFileSync(fullPath, file.bytes);
  const now = new Date().toISOString();
  const checksum = createHash("sha256").update(file.bytes).digest("hex");
  try {
    db.prepare(
      "INSERT INTO resumes (id, occupant_id, original_name, stored_name, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(id, occupantId, file.name, storedName, now);
    saveEvidence(db, occupantId, {
      sourceType: "resume",
      sourceRef: id,
      title: file.name,
      content: {
        resumeId: id,
        originalName: file.name,
        checksum,
        sizeBytes: file.bytes.length,
      },
    });
  } catch (error) {
    unlinkSync(fullPath);
    throw error;
  }
  return { id, originalName: file.name };
}

export function evidenceIdForResume(
  db: DatabaseSync,
  occupantId: string,
  resumeId: string,
): string | null {
  const resume = db
    .prepare(
      "SELECT id, original_name AS originalName FROM resumes WHERE id = ? AND occupant_id = ?",
    )
    .get(resumeId, occupantId) as
    | { id: string; originalName: string }
    | undefined;
  if (!resume) return null;
  const existing = db
    .prepare(
      "SELECT id FROM evidence WHERE occupant_id = ? AND source_type = 'resume' AND source_ref = ?",
    )
    .get(occupantId, resumeId) as { id: string } | undefined;
  if (existing) return existing.id;
  return saveEvidence(db, occupantId, {
    sourceType: "resume",
    sourceRef: resume.id,
    title: resume.originalName,
    content: { resumeId: resume.id, originalName: resume.originalName },
  }).id;
}
