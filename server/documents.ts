import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { extname, isAbsolute, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  prepareDocumentChange,
  prepareDocumentRemoval,
  prepareStoredDocument,
} from "../core/document-vault";
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
        `SELECT id, original_name AS originalName, stored_name AS storedName,
                media_type AS mediaType, size_bytes AS sizeBytes, checksum,
                category, created_at AS createdAt
         FROM documents WHERE occupant_id = ? ORDER BY created_at DESC`,
      )
      .all(occupantId) as unknown as Array<DocumentRow & { storedName: string }>
  ).map(presentDocument);
}

export function storeDocument(
  db: DatabaseSync,
  occupantId: string,
  uploadsDir: string,
  file: { name: string; type: string; bytes: Uint8Array },
  category: string,
): DocumentRow {
  const planned = prepareStoredDocument({
    name: file.name,
    size: file.bytes.length,
    kind: category,
  });
  if (!planned.ok) throw new DocumentStoreError(planned.error);
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
      planned.value.name,
      storedName,
      file.type || "application/octet-stream",
      file.bytes.length,
      checksum,
      planned.value.kind,
      now,
    );
    saveEvidence(db, occupantId, {
      sourceType: "document",
      sourceRef: id,
      title: planned.value.name,
      content: {
        documentId: id,
        mediaType: file.type || "application/octet-stream",
        checksum,
        category: planned.value.kind,
      },
    });
  } catch (error) {
    unlinkSync(fullPath);
    throw error;
  }
  return presentDocument({
    id,
    originalName: planned.value.name,
    storedName,
    mediaType: file.type || "application/octet-stream",
    sizeBytes: file.bytes.length,
    checksum,
    category: planned.value.kind,
    createdAt: now,
  });
}

export function updateDocument(
  db: DatabaseSync,
  occupantId: string,
  id: string,
  input: { name?: unknown; kind?: unknown },
): DocumentRow {
  const removal = prepareDocumentRemoval(id);
  if (!removal.ok) throw new DocumentStoreError(removal.error);
  const planned = prepareDocumentChange(input);
  if (!planned.ok) throw new DocumentStoreError(planned.error);
  const current = loadDocumentRecord(db, occupantId, removal.value);
  if (!current) throw new DocumentStoreError("not-found");
  db.prepare(
    `UPDATE documents SET original_name = ?, category = ?
      WHERE id = ? AND occupant_id = ?`,
  ).run(planned.value.name, planned.value.kind, current.id, occupantId);
  db.prepare(
    `UPDATE evidence SET title = ?
      WHERE occupant_id = ? AND source_type = 'document' AND source_ref = ?`,
  ).run(planned.value.name, occupantId, current.id);
  return presentDocument({
    ...current,
    originalName: planned.value.name,
    category: planned.value.kind,
  });
}

export function removeDocument(
  db: DatabaseSync,
  occupantId: string,
  uploadsDir: string,
  id: string,
): void {
  const planned = prepareDocumentRemoval(id);
  if (!planned.ok) throw new DocumentStoreError(planned.error);
  const current = loadDocumentRecord(db, occupantId, planned.value);
  if (!current) throw new DocumentStoreError("not-found");
  const fullPath = vaultFilePath(uploadsDir, current.storedName);
  if (fullPath) {
    try {
      unlinkSync(fullPath);
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
  }
  db.prepare(
    `DELETE FROM evidence
      WHERE occupant_id = ? AND source_type = 'document' AND source_ref = ?`,
  ).run(occupantId, current.id);
  db.prepare(`DELETE FROM documents WHERE id = ? AND occupant_id = ?`).run(current.id, occupantId);
}

function loadDocumentRecord(
  db: DatabaseSync,
  occupantId: string,
  id: string,
): (DocumentRow & { storedName: string }) | null {
  return (
    db
      .prepare(
        `SELECT id, original_name AS originalName, stored_name AS storedName,
                media_type AS mediaType, size_bytes AS sizeBytes, checksum,
                category, created_at AS createdAt
         FROM documents WHERE id = ? AND occupant_id = ?`,
      )
      .get(id, occupantId) as (DocumentRow & { storedName: string }) | undefined
  ) ?? null;
}

const EXTENSION_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  json: "application/json",
  webm: "video/webm",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
};

export function servedMediaType(name: string, mediaType: string, storedName = ""): string {
  const stored = mediaType.trim();
  if (isActiveMarkup(stored)) return "text/plain; charset=utf-8";
  if (stored && stored !== "application/octet-stream") return stored;
  const extension = fileExtension(storedName) || fileExtension(name);
  return EXTENSION_TYPES[extension] ?? (stored || "application/octet-stream");
}

function presentDocument(record: DocumentRow & { storedName?: string }): DocumentRow {
  const { storedName = "", ...row } = record;
  return { ...row, mediaType: servedMediaType(row.originalName, row.mediaType, storedName) };
}

function fileExtension(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

function isActiveMarkup(mediaType: string): boolean {
  const type = mediaType.toLowerCase();
  return type.startsWith("text/html") || type.startsWith("application/xhtml") || type === "image/svg+xml";
}

function vaultFilePath(uploadsDir: string, storedName: string): string | null {
  if (!storedName || isAbsolute(storedName) || storedName.split(/[\\/]/).includes("..")) return null;
  return join(uploadsDir, storedName);
}

function isMissingFile(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

export function loadDocument(
  db: DatabaseSync,
  occupantId: string,
  uploadsDir: string,
  id: string,
): { row: DocumentRow; bytes: Uint8Array } | null {
  const record = loadDocumentRecord(db, occupantId, id);
  if (!record) return null;
  const fullPath = vaultFilePath(uploadsDir, record.storedName);
  if (!fullPath) return null;
  return { row: presentDocument(record), bytes: readFileSync(fullPath) };
}

export class DocumentStoreError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "DocumentStoreError";
  }
}
