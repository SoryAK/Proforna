import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { extname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { saveEvidence } from "./career-memory";

export type DocumentRow = {
  id: string;
  originalName: string;
  mediaType: string;
  sizeBytes: number;
  checksum: string;
  category: string;
  createdAt: string;
};

export function listDocuments(
  db: DatabaseSync,
  occupantId: string,
): DocumentRow[] {
  return (
    db
      .prepare(
        `SELECT id, original_name AS originalName, media_type AS mediaType,
                size_bytes AS sizeBytes, checksum, category,
                created_at AS createdAt
         FROM documents WHERE occupant_id = ? ORDER BY created_at DESC`,
      )
      .all(occupantId) as unknown as DocumentRow[]
  );
}

export function storeDocument(
  db: DatabaseSync,
  occupantId: string,
  uploadsDir: string,
  file: { name: string; type: string; bytes: Uint8Array },
  category: string,
): DocumentRow {
  if (!file.name.trim() || file.bytes.length === 0) {
    throw new DocumentStoreError("file-required");
  }
  if (file.bytes.length > 25 * 1024 * 1024) {
    throw new DocumentStoreError("file-too-large");
  }
  const id = randomUUID();
  const extension = extname(file.name).slice(0, 12);
  const storedName = `documents/${id}${extension}`;
  const fullPath = join(uploadsDir, storedName);
  mkdirSync(join(uploadsDir, "documents"), { recursive: true });
  writeFileSync(fullPath, file.bytes);
  const now = new Date().toISOString();
  const checksum = createHash("sha256").update(file.bytes).digest("hex");
  try {
    db.prepare(
      `INSERT INTO documents
        (id, occupant_id, original_name, stored_name, media_type, size_bytes,
         checksum, category, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      occupantId,
      file.name.trim(),
      storedName,
      file.type || "application/octet-stream",
      file.bytes.length,
      checksum,
      category.trim() || "career",
      now,
    );
    saveEvidence(db, occupantId, {
      sourceType: "document",
      sourceRef: id,
      title: file.name,
      content: {
        documentId: id,
        mediaType: file.type || "application/octet-stream",
        checksum,
        category: category.trim() || "career",
      },
    });
  } catch (error) {
    unlinkSync(fullPath);
    throw error;
  }
  return {
    id,
    originalName: file.name.trim(),
    mediaType: file.type || "application/octet-stream",
    sizeBytes: file.bytes.length,
    checksum,
    category: category.trim() || "career",
    createdAt: now,
  };
}

export function loadDocument(
  db: DatabaseSync,
  occupantId: string,
  uploadsDir: string,
  id: string,
): { row: DocumentRow; bytes: Uint8Array } | null {
  const record = db
    .prepare(
      `SELECT id, original_name AS originalName, stored_name AS storedName,
              media_type AS mediaType, size_bytes AS sizeBytes, checksum,
              category, created_at AS createdAt
       FROM documents WHERE id = ? AND occupant_id = ?`,
    )
    .get(id, occupantId) as
    | (DocumentRow & { storedName: string })
    | undefined;
  if (!record) return null;
  const { storedName, ...row } = record;
  return { row, bytes: readFileSync(join(uploadsDir, storedName)) };
}

export class DocumentStoreError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
