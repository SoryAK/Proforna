/**
 * uploadBodyPhoto — POST a File to the worklog photos endpoint with
 * `source=body`. Returns the persisted row's id and public path so the
 * caller can insert a PhotoNode into the editor.
 *
 * Surfaces server-side errors verbatim (max-size, mime, cap exceeded) so
 * the caller can toast or inline-report them.
 */

export interface UploadedBodyPhoto {
  id: string;
  src: string;
  fileName: string;
  fileMime: string;
  fileSize: number;
  width: number | null;
  height: number | null;
}

export async function uploadBodyPhoto(
  workLogId: string,
  file: File,
): Promise<UploadedBodyPhoto> {
  const fd = new FormData();
  fd.append("workLogId", workLogId);
  fd.append("file", file);
  fd.append("source", "body");

  const res = await fetch("/api/work-logs/photos", { method: "POST", body: fd });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Upload failed (${res.status})`);
  }
  const row = (await res.json()) as {
    id: string;
    filePath: string;
    fileName: string;
    fileMime: string;
    fileSize: number;
  };

  // Try to read intrinsic dimensions so the editor can reserve layout space
  // and avoid the "image pops in and shoves text" jank. Best-effort only.
  const dims = await readImageDimensions(file).catch(() => null);

  return {
    id: row.id,
    src: row.filePath,
    fileName: row.fileName,
    fileMime: row.fileMime,
    fileSize: row.fileSize,
    width: dims?.width ?? null,
    height: dims?.height ?? null,
  };
}

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      const out = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(out);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

/** Debounced PATCH so the caption column tracks the node attr. */
export async function patchBodyPhotoCaption(id: string, caption: string | null): Promise<void> {
  await fetch("/api/work-logs/photos", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, caption }),
  }).catch(() => {
    // Best-effort: caption mirror is a convenience for SQL search; the
    // node attr remains the live source of truth.
  });
}

/** Fire-and-forget body cleanup; called from the editor's flush path. */
export async function reconcileBodyPhotos(workLogId: string, keepIds: string[]): Promise<void> {
  await fetch("/api/work-logs/photos/reconcile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workLogId, source: "body", keepIds }),
  }).catch(() => {
    // Best-effort: leftover rows are wasted disk, never broken state.
    // The next save will retry.
  });
}
