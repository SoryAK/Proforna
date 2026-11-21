import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { PROFILE_AVATAR_MAX_BYTES, avatarExtension, isAvatarType } from "../core/profile";
import { splitJoinPhoto } from "../core/index";

/**
 * Photos on My Network contacts, stored beside the profile photo in uploads.
 * File names are always made here (contact-<uuid>.<ext>), never taken from input.
 */
export class ContactPhotoError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function storedName(db: DatabaseSync, occupantId: string, contactId: string): string | null {
  const row = db
    .prepare("SELECT photo_stored_name AS name FROM contacts WHERE id = ? AND occupant_id = ?")
    .get(contactId, occupantId) as { name: string | null } | undefined;
  if (!row) throw new ContactPhotoError("not-found");
  return row.name;
}

/** Deletes a photo file; one already gone is fine, any other failure is reported. */
function deleteFile(uploadsDir: string, name: string | null) {
  if (!name) return;
  try {
    unlinkSync(join(uploadsDir, name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new ContactPhotoError("photo-delete-failed");
  }
}

/** Like deleteFile, for an old file whose replacement is already saved: a leftover is harmless. */
function deleteOldFile(uploadsDir: string, name: string | null) {
  try {
    deleteFile(uploadsDir, name);
  } catch {
    /* the new photo is in place; the old file just stays behind */
  }
}

/** Where the browser loads a contact's photo; the name changes with each new photo. */
export function contactPhotoUrl(contactId: string, stored: string | null): string | null {
  return stored ? `/api/contacts/${encodeURIComponent(contactId)}/photo?v=${encodeURIComponent(stored.slice(8, 16))}` : null;
}

export function storeContactPhoto(
  db: DatabaseSync,
  occupantId: string,
  uploadsDir: string,
  contactId: string,
  file: { type: string; bytes: Uint8Array },
): string {
  if (!isAvatarType(file.type)) throw new ContactPhotoError("photo-type");
  if (file.bytes.byteLength === 0) throw new ContactPhotoError("photo-empty");
  if (file.bytes.byteLength > PROFILE_AVATAR_MAX_BYTES) throw new ContactPhotoError("photo-too-large");
  const ext = avatarExtension(file.type);
  if (!ext) throw new ContactPhotoError("photo-type");
  const previous = storedName(db, occupantId, contactId);
  mkdirSync(uploadsDir, { recursive: true });
  const name = `contact-${randomUUID()}.${ext}`;
  writeFileSync(join(uploadsDir, name), file.bytes);
  db.prepare("UPDATE contacts SET photo_stored_name = ? WHERE id = ? AND occupant_id = ?").run(
    name,
    contactId,
    occupantId,
  );
  deleteOldFile(uploadsDir, previous);
  return contactPhotoUrl(contactId, name)!;
}

export function removeContactPhoto(db: DatabaseSync, occupantId: string, uploadsDir: string, contactId: string) {
  const previous = storedName(db, occupantId, contactId);
  // The file goes first, so a failed delete keeps the name and can be retried.
  deleteFile(uploadsDir, previous);
  db.prepare("UPDATE contacts SET photo_stored_name = NULL WHERE id = ? AND occupant_id = ?").run(contactId, occupantId);
}

export function loadContactPhoto(
  db: DatabaseSync,
  occupantId: string,
  uploadsDir: string,
  contactId: string,
): { bytes: Uint8Array; type: string } | null {
  const name = storedName(db, occupantId, contactId);
  if (!name) return null;
  const type = name.endsWith(".png")
    ? "image/png"
    : name.endsWith(".webp")
      ? "image/webp"
      : name.endsWith(".gif")
        ? "image/gif"
        : "image/jpeg";
  try {
    return { bytes: new Uint8Array(readFileSync(join(uploadsDir, name))), type };
  } catch {
    return null;
  }
}

/** The stored photo file of a contact about to be removed, so it can be deleted after. */
export function contactPhotoFile(db: DatabaseSync, occupantId: string, contactId: string): string | null {
  try {
    return storedName(db, occupantId, contactId);
  } catch {
    return null;
  }
}

/** After the contact itself is gone there's nothing to retry against, so a leftover file is left. */
export function deleteContactPhotoFile(uploadsDir: string, name: string | null) {
  deleteOldFile(uploadsDir, name);
}

/**
 * Stores a joiner's photo on their contact, unless the occupant already gave
 * that contact one: like the other join details, it only fills a blank.
 */
export function takeJoinPhoto(
  db: DatabaseSync,
  occupantId: string,
  uploadsDir: string | undefined,
  contactId: string,
  photo: string,
) {
  if (!uploadsDir || !photo) return;
  const parts = splitJoinPhoto(photo);
  if (!parts || storedName(db, occupantId, contactId)) return;
  try {
    storeContactPhoto(db, occupantId, uploadsDir, contactId, {
      type: parts.type,
      bytes: new Uint8Array(Buffer.from(parts.base64, "base64")),
    });
  } catch {
    /* a photo that can't be stored leaves the contact as it was */
  }
}

/** Photos of My Network contacts, by contact and by lowercased email, for lists of people. */
export function contactPhotos(db: DatabaseSync, occupantId: string) {
  const rows = db
    .prepare(
      "SELECT id, lower(email) AS email, photo_stored_name AS name FROM contacts WHERE occupant_id = ? AND photo_stored_name IS NOT NULL",
    )
    .all(occupantId) as Array<{ id: string; email: string; name: string }>;
  const byId = new Map<string, string>();
  const byEmail = new Map<string, string>();
  for (const row of rows) {
    const url = contactPhotoUrl(row.id, row.name)!;
    byId.set(row.id, url);
    if (row.email) byEmail.set(row.email, url);
  }
  return {
    find(contactId: string | null | undefined, email: string | null | undefined): string | null {
      return (contactId ? byId.get(contactId) : undefined) ?? (email ? byEmail.get(email.toLowerCase()) : undefined) ?? null;
    },
  };
}
