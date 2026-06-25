/**
 * Document storage service — ADR-0051 Sprint α' Commit 2.
 *
 * Owns the on-disk substrate for the Document model:
 *   - readDocumentBytes(doc): unified read across legacy inline base64 + new
 *     disk-backed rows.
 *   - createDocument(input): writes bytes to disk under the private storage
 *     root (NOT public/), computes SHA-256 contentHash, creates the Prisma
 *     row with filePath set and data null.
 *
 * Storage layout: <storageRoot>/<userId>/<documentId>.<extension>
 *
 * Decision (vs the precedent set by Attachment, which writes under
 * public/uploads/attachments/): Document writes under <repo>/storage/documents/
 * — outside public/ so the only way to fetch a document's bytes is through
 * the GET /api/documents/[id] handler, which user-scopes the lookup. Closes
 * the latent IDOR that public/ paths inherit. Attachment can follow in a
 * future ADR (ADR-0052 — equipment manuals + attachment uniform storage).
 */

import { promises as fs } from "fs";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

/** Default repository-relative root for document bytes. Override via the
 *  `storageRoot` argument to `createDocument` (used by tests). */
export const DEFAULT_STORAGE_ROOT = path.join(
  process.cwd(),
  "storage",
  "documents",
);

const MIME_TO_EXTENSION: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "text/plain": "txt",
  "text/csv": "csv",
};

/** Pick the file extension for a given MIME type. Falls back to `bin` for
 *  anything not in the allow-list — the API route's MIME validator should
 *  reject those before reaching this module, but `bin` is a safe sentinel. */
function extensionFor(mimeType: string): string {
  return MIME_TO_EXTENSION[mimeType] ?? "bin";
}

/**
 * Read the document's bytes from either disk (new substrate) or the legacy
 * inline base64 column. Returns a Buffer the caller can hand directly to a
 * Response body (after the contained `as BodyInit` cast that NextResponse
 * typings require — see api/documents/[id]/route.ts).
 */
export async function readDocumentBytes(doc: {
  filePath: string | null;
  data: string | null;
}): Promise<Buffer> {
  if (doc.filePath) {
    return fs.readFile(doc.filePath);
  }
  if (doc.data) {
    return Buffer.from(doc.data, "base64");
  }
  throw new Error("Document has no bytes (both filePath and data are null)");
}

export interface CreateDocumentInput {
  userId: string;
  /** Display name (defaults to fileName at the caller if not supplied). */
  name: string;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
  category: string;
  entityType: string | null;
  entityId: string | null;
  notes: string | null;
  folderId: string | null;
  /** Test-only override. Production code lets this default to
   *  `DEFAULT_STORAGE_ROOT`. */
  storageRoot?: string;
}

/**
 * Persist a new Document: write bytes to disk, compute SHA-256, insert the
 * Prisma row with `filePath` + `contentHash` set and `data` left null.
 *
 * The document ID is generated up-front (via `crypto.randomUUID()`) so the
 * file path can include it without a temporary "row exists but file doesn't"
 * intermediate state. The disk write happens BEFORE the DB insert; if the
 * insert fails we orphan a file (cleaned up by a future GC job — tracked in
 * the parked-ideas list).
 */
export async function createDocument(
  input: CreateDocumentInput,
): Promise<Awaited<ReturnType<typeof prisma.document.create>>> {
  const storageRoot = input.storageRoot ?? DEFAULT_STORAGE_ROOT;
  const id = randomUUID();
  const ext = extensionFor(input.mimeType);
  const userDir = path.join(storageRoot, input.userId);
  const filePath = path.join(userDir, `${id}.${ext}`);

  await fs.mkdir(userDir, { recursive: true });
  await fs.writeFile(filePath, input.bytes);

  const contentHash = createHash("sha256").update(input.bytes).digest("hex");

  return prisma.document.create({
    data: {
      id,
      // Use the relation-connect form. Prisma's runtime validator interprets
      // explicit `id` + scalar `userId` as the checked variant which then
      // requires the `user` relation; connect is the unambiguous shape.
      user: { connect: { id: input.userId } },
      name: input.name,
      fileName: input.fileName,
      fileSize: input.bytes.length,
      mimeType: input.mimeType,
      data: null,
      filePath,
      contentHash,
      category: input.category,
      entityType: input.entityType,
      entityId: input.entityId,
      notes: input.notes,
      folder: input.folderId
        ? { connect: { id: input.folderId } }
        : undefined,
    },
  });
}
