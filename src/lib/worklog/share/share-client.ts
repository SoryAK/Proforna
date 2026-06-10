/**
 * Web Share onramp for the Grill Me round-trip (ADR-0022 addendum).
 *
 * Reuses the existing bulk-export endpoint (`POST /api/work-logs/export-bulk`)
 * so the markdown / zip artifact is identical whether the user picks
 * "Download" or "Share to…". The only difference is the destination:
 *   - Download path → `<a download>` synthetic click (existing behavior).
 *   - Share path    → wraps the blob in a `File` and calls `navigator.share`.
 *
 * The bulk-bar Export dropdown chooses the path; both go through this module.
 *
 * Outcome contract (`ShareOutcome`):
 *   - "shared":     navigator.share resolved successfully.
 *   - "cancelled":  user dismissed the share sheet (DOMException AbortError).
 *   - "downloaded": Web Share unsupported OR navigator.share failed; we fell
 *                   back to the existing download path so the user still got
 *                   their file.
 *
 * `decideShareOutcome` is exported separately so the decision matrix can be
 * unit-tested without mocking the actual Web Share API.
 */

import { canShareFiles } from "./can-share";

export type ShareOutcome = "shared" | "cancelled" | "downloaded";

const DEFAULT_FILENAMES = {
  md: "worklog.md",
  zip: "worklogs.zip",
} as const;

const MIME = {
  md: "text/markdown",
  zip: "application/zip",
} as const;

// ---------------------------------------------------------------------------
// Pure helpers (testable in isolation)
// ---------------------------------------------------------------------------

/**
 * Translate a navigator.share() outcome (success → null, otherwise the thrown
 * value) into one of three terminal states. Pure — no side effects.
 *
 * AbortError is the standardized name browsers use when the user dismisses
 * the share sheet without picking a destination. Both DOMException and
 * plain Error variants exist in the wild; we sniff `name` directly so we
 * cover both. Anything else (NotAllowedError, network failures, etc.)
 * means we fell back to a download.
 */
export function decideShareOutcome(error: unknown): ShareOutcome {
  // Strict null === success. `undefined` is treated as a thrown value (some
  // engines allow `throw undefined`) and routed through the failure path.
  if (error === null) return "shared";
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  ) {
    return "cancelled";
  }
  return "downloaded";
}

function parseFilename(header: string | null): string | null {
  if (!header) return null;
  const m =
    /filename="([^"]+)"/.exec(header) ?? /filename=([^;]+)/.exec(header);
  return m ? m[1].trim() : null;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the bulk-export artifact for the given ids and route it to either
 * the OS share sheet (preferred) or a synthetic download (fallback).
 *
 * Always succeeds from the user's perspective unless the network call
 * itself fails — in which case the underlying error propagates so the
 * caller can surface it as a toast.
 */
export async function shareWorklogs(ids: string[]): Promise<ShareOutcome> {
  if (ids.length === 0) {
    throw new Error("shareWorklogs called with empty ids");
  }
  const res = await fetch("/api/work-logs/export-bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    throw new Error(`Bulk export failed (${res.status})`);
  }
  const blob = await res.blob();
  const isZip = ids.length > 1;
  const filename =
    parseFilename(res.headers.get("Content-Disposition")) ??
    (isZip ? DEFAULT_FILENAMES.zip : DEFAULT_FILENAMES.md);

  if (!canShareFiles()) {
    triggerDownload(blob, filename);
    return "downloaded";
  }

  const file = new File([blob], filename, {
    type: isZip ? MIME.zip : MIME.md,
  });

  try {
    await navigator.share({
      files: [file],
      title: filename,
    });
    return decideShareOutcome(null);
  } catch (err) {
    const outcome = decideShareOutcome(err);
    if (outcome === "downloaded") {
      // Share failed for a non-cancellation reason — fall back so the
      // user still ends up with their file.
      triggerDownload(blob, filename);
    }
    return outcome;
  }
}
