/**
 * Pure assembly + validation for WorkLogImport create payloads.
 *
 * Sprint 2 scope: no Prisma client touch, no IO. Just take an input object,
 * normalize/validate, and return the data payload that Sprint 3 will hand
 * to `prisma.workLogImport.create({ data })`.
 *
 * Why a separate helper? Validating the state machine
 * (status === "succeeded" ⇒ workLogId required; status === "failed" ⇒
 * errorMessage required) in one pure place gives us a clean TDD surface
 * and keeps the Sprint 3 route handler thin.
 */

import type { DroppedBlock } from "./types";

export type ImportSourceType = "markdown" | "html" | "notion";
export type ImportStatus = "pending" | "succeeded" | "failed";

const VALID_SOURCE_TYPES: ReadonlySet<string> = new Set([
  "markdown",
  "html",
  "notion",
]);

const VALID_STATUSES: ReadonlySet<string> = new Set([
  "pending",
  "succeeded",
  "failed",
]);

export type BuildImportRecordInput = {
  userId: string;
  sourceType: ImportSourceType;
  sourceFingerprint: string;
  droppedBlocks: DroppedBlock[];
  status?: ImportStatus;
  sourceFilename?: string | null;
  workLogId?: string | null;
  errorMessage?: string | null;
  completedAt?: Date | null;
};

/**
 * Shape consumed by `prisma.workLogImport.create({ data: ... })`.
 * Kept loose (plain object) so this module stays free of Prisma client
 * type imports — Sprint 3 narrows it at the call site.
 */
export type WorkLogImportRecord = {
  userId: string;
  sourceType: ImportSourceType;
  sourceFingerprint: string;
  status: ImportStatus;
  droppedBlocks: DroppedBlock[];
  sourceFilename: string | null;
  workLogId: string | null;
  errorMessage: string | null;
  completedAt: Date | null;
};

export function buildWorkLogImportRecord(
  input: BuildImportRecordInput,
): WorkLogImportRecord {
  if (!input.userId || input.userId.trim().length === 0) {
    throw new Error("userId is required and must be non-empty");
  }
  if (!VALID_SOURCE_TYPES.has(input.sourceType)) {
    throw new Error(
      `sourceType "${input.sourceType}" is not supported (expected one of: ${[...VALID_SOURCE_TYPES].join(", ")})`,
    );
  }
  if (!input.sourceFingerprint || input.sourceFingerprint.length === 0) {
    throw new Error("sourceFingerprint is required and must be non-empty");
  }

  const status: ImportStatus = input.status ?? "pending";
  if (!VALID_STATUSES.has(status)) {
    throw new Error(
      `status "${status}" is not valid (expected one of: ${[...VALID_STATUSES].join(", ")})`,
    );
  }

  if (status === "succeeded" && !input.workLogId) {
    throw new Error("workLogId is required when status is 'succeeded'");
  }
  if (status === "failed" && !input.errorMessage) {
    throw new Error("errorMessage is required when status is 'failed'");
  }

  const trimmedFilename =
    typeof input.sourceFilename === "string"
      ? input.sourceFilename.trim()
      : null;
  const sourceFilename =
    trimmedFilename && trimmedFilename.length > 0 ? trimmedFilename : null;

  return {
    userId: input.userId,
    sourceType: input.sourceType,
    sourceFingerprint: input.sourceFingerprint,
    status,
    droppedBlocks: input.droppedBlocks,
    sourceFilename,
    workLogId: input.workLogId ?? null,
    errorMessage: input.errorMessage ?? null,
    completedAt: input.completedAt ?? null,
  };
}
