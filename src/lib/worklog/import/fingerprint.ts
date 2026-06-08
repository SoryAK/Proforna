/**
 * Source-content fingerprint for worklog import dedup.
 *
 * Used as the third column in `@@unique([userId, sourceType, sourceFingerprint])`
 * on WorkLogImport — lets us detect "user just uploaded the same file twice"
 * and return the existing WorkLog instead of duplicating.
 *
 * Pure Node crypto. No IO, no Prisma. UTF-8 byte-stable.
 */

import { createHash } from "node:crypto";

export function computeSourceFingerprint(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}
