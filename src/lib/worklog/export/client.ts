/**
 * Client-side download helpers for the Grill Me export endpoints.
 *
 * Used by the worklog notes bulk bar. Pure DOM + fetch — no React Query
 * needed. Both helpers extract the filename from the response's
 * `Content-Disposition` header so the saved file matches what the server
 * generated (e.g. `<title>.md` or `worklogs-YYYY-MM-DD.zip`).
 */

const DEFAULT_FILENAMES = {
  md: "worklog.md",
  zip: "worklogs.zip",
} as const;

/**
 * Pulls a `filename="..."` value out of a Content-Disposition header.
 * Returns null if the header is missing or doesn't include a filename.
 */
function parseFilename(header: string | null): string | null {
  if (!header) return null;
  // Match unquoted: filename=foo.md   OR  quoted: filename="foo bar.md"
  const m =
    /filename="([^"]+)"/.exec(header) ?? /filename=([^;]+)/.exec(header);
  return m ? m[1].trim() : null;
}

/**
 * Triggers a browser download for the given Blob + filename. Cleans up
 * the object URL once the click has been dispatched.
 */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Allow the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Downloads a single worklog as a .md file via
 * `GET /api/work-logs/{id}/export`.
 */
export async function exportSingleWorklog(id: string): Promise<void> {
  const res = await fetch(
    `/api/work-logs/${encodeURIComponent(id)}/export`,
    { method: "GET" },
  );
  if (!res.ok) {
    throw new Error(`Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const filename =
    parseFilename(res.headers.get("Content-Disposition")) ??
    DEFAULT_FILENAMES.md;
  triggerDownload(blob, filename);
}

/**
 * Downloads N worklogs via `POST /api/work-logs/export-bulk`. The server
 * returns text/markdown when ids.length === 1 and application/zip otherwise.
 */
export async function exportBulkWorklogs(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    throw new Error("exportBulkWorklogs called with empty ids");
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
  const fallback =
    ids.length === 1 ? DEFAULT_FILENAMES.md : DEFAULT_FILENAMES.zip;
  const filename =
    parseFilename(res.headers.get("Content-Disposition")) ?? fallback;
  triggerDownload(blob, filename);
}
