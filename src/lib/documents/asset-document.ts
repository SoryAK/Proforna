import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { readDocumentBytes } from "./storage";

/**
 * Valid `docType` values for an `AssetDocument` row. Mirrors the
 * inline allow-list previously duplicated across the two
 * /api/asset-types and /api/job-assets document routes.
 */
export const VALID_DOC_TYPES: ReadonlySet<string> = new Set([
  "manual",
  "wiring_diagram",
  "spec_sheet",
  "safety_sheet",
  "parts_list",
  "other",
]);

/**
 * Filesystem root for LEGACY `AssetDocument.filePath` values.
 * Pre-ADR-0051 rows stored direct paths under `public/uploads/...`.
 * Any path that resolves outside this root is rejected by
 * `getAssetDocumentFile` to close the directory-traversal vector
 * on stored data.
 */
export const LEGACY_FILE_ROOT = path.join(process.cwd(), "public", "uploads");

const LEGACY_MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  csv: "text/csv",
};

export interface AttachDocumentInput {
  /** Exactly ONE of `assetTypeId` or `assetId` must be set. */
  assetTypeId?: string;
  /** Exactly ONE of `assetTypeId` or `assetId` must be set. */
  assetId?: string;
  /** Existing `Document.id` (produced by `createDocument`). */
  documentId: string;
  title: string;
  /** Unknown values are coerced to `"other"`. Defaults to `"other"` when omitted. */
  docType?: string;
  notes?: string | null;
}

/**
 * Create an `AssetDocument` row linking an existing `Document` to either
 * an `AssetType` (type-level reference) or a `JobAsset` (instance-level).
 *
 * Uses relation `connect` form throughout — Commit 2 (ADR-0051) showed
 * that Prisma's runtime validator picks the checked-input variant when
 * a relation is implied, and scalar FKs trigger "missing relation" errors
 * in that mode. `connect` is unambiguous in either variant.
 */
export async function attachDocument(input: AttachDocumentInput) {
  const hasType = !!input.assetTypeId;
  const hasInstance = !!input.assetId;
  if (hasType === hasInstance) {
    throw new Error(
      "AssetDocument requires exactly one of assetTypeId or assetId",
    );
  }

  const docType =
    input.docType && VALID_DOC_TYPES.has(input.docType) ? input.docType : "other";

  return prisma.assetDocument.create({
    data: {
      assetType: input.assetTypeId
        ? { connect: { id: input.assetTypeId } }
        : undefined,
      asset: input.assetId ? { connect: { id: input.assetId } } : undefined,
      document: { connect: { id: input.documentId } },
      docType,
      title: input.title.trim().slice(0, 200),
      notes: input.notes ?? null,
    },
  });
}

/**
 * Read the file bytes backing an `AssetDocument`. Resolves in three
 * branches:
 *
 *   1. `documentId` is set → delegates to `readDocumentBytes(document)`
 *      (the unified Commit-2 path; supports both new disk-backed and
 *      legacy base64 `Document` rows).
 *   2. Legacy `filePath` is set → reads from disk, but only if the path
 *      resolves inside `LEGACY_FILE_ROOT` (`<repo>/public/uploads`).
 *      Any traversal outside the root throws.
 *   3. Otherwise (url-only or empty) → throws. URL-only rows have no
 *      file bytes; the caller should fall back to the `url` field.
 *
 * Throws when the `AssetDocument` row itself is missing.
 */
export async function getAssetDocumentFile(assetDocumentId: string): Promise<{
  bytes: Buffer;
  mimeType: string;
  fileName: string;
}> {
  const ad = await prisma.assetDocument.findUnique({
    where: { id: assetDocumentId },
    include: { document: true },
  });
  if (!ad) {
    throw new Error(`AssetDocument ${assetDocumentId} not found`);
  }

  // Branch 1: linked Document (new ADR-0051 path)
  if (ad.document) {
    const bytes = await readDocumentBytes(ad.document);
    return {
      bytes,
      mimeType: ad.document.mimeType,
      fileName: ad.document.fileName,
    };
  }

  // Branch 2: legacy filePath (constrained to LEGACY_FILE_ROOT)
  if (ad.filePath) {
    const resolved = path.resolve(ad.filePath);
    const relative = path.relative(LEGACY_FILE_ROOT, resolved);
    if (
      !relative ||
      relative.startsWith("..") ||
      path.isAbsolute(relative)
    ) {
      throw new Error(
        `AssetDocument ${assetDocumentId} legacy filePath is outside LEGACY_FILE_ROOT`,
      );
    }
    const bytes = await fs.readFile(resolved);
    const fileName = path.basename(resolved);
    const ext = path.extname(fileName).toLowerCase().slice(1);
    const mimeType = LEGACY_MIME_MAP[ext] ?? "application/octet-stream";
    return { bytes, mimeType, fileName };
  }

  // Branch 3: url-only or empty
  throw new Error(
    `AssetDocument ${assetDocumentId} has no file bytes (url-only or empty)`,
  );
}
