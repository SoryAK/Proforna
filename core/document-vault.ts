export const DOCUMENT_KINDS = ["evidence", "resume", "offer", "certificate"] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;

export const DOCUMENT_NAME_MAX = 180;

export type DocumentVaultError =
  | "file-required"
  | "file-too-large"
  | "name-required"
  | "kind-invalid"
  | "id-required";

export type StoredDocumentPlan = {
  name: string;
  kind: DocumentKind;
};

export function prepareStoredDocument(input: {
  name?: unknown;
  size?: unknown;
  kind?: unknown;
}): { ok: true; value: StoredDocumentPlan } | { ok: false; error: DocumentVaultError } {
  const name = documentName(input.name);
  if (!name) return { ok: false, error: "name-required" };
  const size = typeof input.size === "number" ? input.size : Number.NaN;
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: "file-required" };
  if (size > DOCUMENT_MAX_BYTES) return { ok: false, error: "file-too-large" };
  const kind = documentKind(input.kind, "evidence");
  if (!kind) return { ok: false, error: "kind-invalid" };
  return { ok: true, value: { name, kind } };
}

export function prepareDocumentChange(input: {
  name?: unknown;
  kind?: unknown;
}): { ok: true; value: StoredDocumentPlan } | { ok: false; error: DocumentVaultError } {
  const name = documentName(input.name);
  if (!name) return { ok: false, error: "name-required" };
  const kind = documentKind(input.kind, null);
  if (!kind) return { ok: false, error: "kind-invalid" };
  return { ok: true, value: { name, kind } };
}

export function prepareDocumentRemoval(
  id: unknown,
): { ok: true; value: string } | { ok: false; error: DocumentVaultError } {
  if (typeof id !== "string" || !id.trim()) return { ok: false, error: "id-required" };
  return { ok: true, value: id.trim() };
}

function documentName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (!name) return null;
  return name.slice(0, DOCUMENT_NAME_MAX);
}

function documentKind(value: unknown, fallback: DocumentKind | null): DocumentKind | null {
  const kind = typeof value === "string" ? value.trim() : "";
  if (!kind) return fallback;
  return (DOCUMENT_KINDS as readonly string[]).includes(kind) ? (kind as DocumentKind) : null;
}
