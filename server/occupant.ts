import type { DatabaseSync } from "node:sqlite";

export const LOCAL_OCCUPANT_ID = "local";

export type OccupantRow = {
  id: string;
};

export type ProfileRow = {
  fullName: string;
  headline: string;
  address: string;
  addressLatitude: number | null;
  addressLongitude: number | null;
  city: string;
  state: string;
  bio: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  avatarUrl: string | null;
  onboardingCompletedAt: string | null;
};

export function ensureOccupant(db: DatabaseSync): OccupantRow {
  const existing = db
    .prepare("SELECT id FROM occupants WHERE id = ?")
    .get(LOCAL_OCCUPANT_ID) as OccupantRow | undefined;
  if (existing) {
    return existing;
  }
  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO occupants (id, created_at) VALUES (?, ?)").run(
      LOCAL_OCCUPANT_ID,
      now,
    );
    db.prepare(
      "INSERT INTO profiles (occupant_id, full_name, onboarding_completed_at, updated_at) VALUES (?, '', NULL, ?)",
    ).run(LOCAL_OCCUPANT_ID, now);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return { id: LOCAL_OCCUPANT_ID };
}

export function readProfile(db: DatabaseSync, occupantId: string): ProfileRow {
  const row = db
    .prepare(
      `SELECT
        full_name AS fullName,
        headline,
        address,
        address_latitude AS addressLatitude,
        address_longitude AS addressLongitude,
        city,
        state,
        bio,
        linkedin_url AS linkedinUrl,
        github_url AS githubUrl,
        portfolio_url AS portfolioUrl,
        avatar_stored_name AS avatarStoredName,
        onboarding_completed_at AS onboardingCompletedAt
      FROM profiles WHERE occupant_id = ?`,
    )
    .get(occupantId) as
    | {
        fullName: string;
        headline: string;
        address: string;
        addressLatitude: number | null;
        addressLongitude: number | null;
        city: string;
        state: string;
        bio: string;
        linkedinUrl: string;
        githubUrl: string;
        portfolioUrl: string;
        avatarStoredName: string | null;
        onboardingCompletedAt: string | null;
      }
    | undefined;
  if (!row) {
    throw new Error("profile missing for occupant");
  }
  const { avatarStoredName, ...fields } = row;
  return {
    ...fields,
    avatarUrl: avatarStoredName ? "/api/profile/avatar" : null,
  };
}
