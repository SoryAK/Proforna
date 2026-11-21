import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "./db";
import { loadDocument, storeDocument } from "./documents";
import { ensureOccupant } from "./occupant";
import { createPortableArchive, restorePortableArchive } from "./portability";
import { loadAvatar, storeAvatar } from "./profile";
import { isSafeStoredName, uploadPath } from "./upload-path";
import { loadWorkMapMediaFile, removeWorkMapMedia } from "./work-map";

describe("upload paths", () => {
  it("keeps stored names inside the uploads folder", () => {
    expect(uploadPath("/data/uploads", "documents/a.pdf")).toBe("/data/uploads/documents/a.pdf");
    for (const bad of ["../secret", "documents/../../secret", "/etc/passwd", "", "a\0b", ".", null, 42]) {
      expect(isSafeStoredName(bad), String(bad)).toBe(false);
    }
  });
});

describe("a tampered stored name in the database", () => {
  let base: string;
  let uploads: string;
  let secret: string;
  let db: ReturnType<typeof openDatabase>;
  let occupantId: string;

  beforeEach(() => {
    // base/secret.txt sits beside the uploads folder, so "../secret.txt" reaches it.
    base = mkdtempSync(join(tmpdir(), "proforna-paths-"));
    uploads = join(base, "uploads");
    mkdirSync(uploads);
    secret = join(base, "secret.txt");
    writeFileSync(secret, "private key");
    db = openDatabase(":memory:");
    occupantId = ensureOccupant(db).id;
  });
  afterEach(() => {
    db.close();
    rmSync(base, { recursive: true, force: true });
  });

  it("cannot make a document read a file outside uploads", () => {
    const doc = storeDocument(
      db,
      occupantId,
      uploads,
      { name: "cv.txt", type: "text/plain", bytes: new TextEncoder().encode("cv") },
      "evidence",
    );
    db.prepare("UPDATE documents SET stored_name = '../secret.txt' WHERE id = ?").run(doc.id);
    expect(loadDocument(db, occupantId, uploads, doc.id)).toBeNull();
  });

  it("cannot make the profile photo read or delete a file outside uploads", () => {
    db.prepare("UPDATE profiles SET avatar_stored_name = '../secret.txt' WHERE occupant_id = ?").run(
      occupantId,
    );
    expect(loadAvatar(db, occupantId, uploads)).toBeNull();
    // Replacing the photo deletes the previous one; it must not delete the secret.
    storeAvatar(db, occupantId, uploads, {
      type: "image/png",
      bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    });
    expect(existsSync(secret)).toBe(true);
  });

  it("cannot make a role photo read or delete a file outside uploads", () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO work_history (id, occupant_id, kind, title, company, created_at)
       VALUES ('role-1', ?, 'job', 'Tech', 'Acme', ?)`,
    ).run(occupantId, now);
    db.prepare(
      `INSERT INTO work_history_media (id, work_history_id, occupant_id, kind, title, url, created_at, stored_name)
       VALUES ('m-1', 'role-1', ?, 'photo', 'Photo', '', ?, '../secret.txt')`,
    ).run(occupantId, now);
    expect(loadWorkMapMediaFile(db, occupantId, "m-1", uploads)).toBeNull();
    removeWorkMapMedia(db, occupantId, "role-1", "m-1", uploads);
    expect(existsSync(secret)).toBe(true);
  });

  it("leaves the file out of an export instead of reading it", () => {
    db.prepare("UPDATE profiles SET avatar_stored_name = '../secret.txt' WHERE occupant_id = ?").run(
      occupantId,
    );
    const archive = createPortableArchive(db, occupantId, uploads);
    // Look inside the archive: compressed bytes could hide the secret's text.
    const entries = unzipSync(archive);
    expect(Object.keys(entries).filter((name) => name.startsWith("files/"))).toEqual([]);
    for (const bytes of Object.values(entries)) {
      expect(strFromU8(bytes).includes("private key")).toBe(false);
    }
    // The unsafe name is gone from the data too, so the backup can be restored.
    const data = JSON.parse(strFromU8(entries["data.json"]!)) as { tables: { profiles: Array<{ avatar_stored_name: unknown }> } };
    expect(data.tables.profiles[0]!.avatar_stored_name).toBeNull();
    const fresh = openDatabase(":memory:");
    expect(restorePortableArchive(fresh, ensureOccupant(fresh).id, mkdtempSync(join(tmpdir(), "restore-")), archive).rows).toBeGreaterThan(0);
  });
});
