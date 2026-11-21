import { isAbsolute, resolve, sep } from "node:path";

/**
 * Turns a stored file name into its path inside the uploads folder, or throws
 * when the name would land anywhere else. Stored names come from the database,
 * and a restored backup can put any value there, so every read, write and
 * delete of an uploaded file goes through here.
 */
export function uploadPath(uploadsDir: string, storedName: unknown): string {
  if (
    typeof storedName !== "string" ||
    !storedName ||
    storedName.includes("\0") ||
    isAbsolute(storedName) ||
    /^[a-zA-Z]:/.test(storedName)
  ) {
    throw new UploadPathError();
  }
  const root = resolve(uploadsDir);
  const full = resolve(root, storedName);
  if (!full.startsWith(root + sep)) throw new UploadPathError();
  return full;
}

export function isSafeStoredName(storedName: unknown): boolean {
  try {
    uploadPath("/uploads", storedName);
    return true;
  } catch {
    return false;
  }
}

export class UploadPathError extends Error {
  constructor() {
    super("upload-path-invalid");
  }
}
