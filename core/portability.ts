export const PORTABLE_FORMAT_VERSION = 1;

export type PortableManifest = {
  formatVersion: number;
  product: "Proforna";
  exportedAt: string;
  occupantId: string;
  dataFile: "data.json";
  fileCount: number;
  checksums: Record<string, string>;
};

export type IntegrationKind = "calendar" | "email" | "job-board";

export type IntegrationConnection = {
  id: string;
  occupantId: string;
  kind: IntegrationKind;
  label: string;
  config: Record<string, unknown>;
  status: "configured" | "disabled";
  createdAt: string;
};

export function validatePortableManifest(
  value: unknown,
):
  | { ok: true; value: PortableManifest }
  | { ok: false; error: "manifest-invalid" | "format-unsupported" } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "manifest-invalid" };
  }
  const manifest = value as Partial<PortableManifest>;
  if (
    manifest.product !== "Proforna" ||
    typeof manifest.exportedAt !== "string" ||
    typeof manifest.occupantId !== "string" ||
    manifest.dataFile !== "data.json" ||
    typeof manifest.fileCount !== "number" ||
    !manifest.checksums ||
    typeof manifest.checksums !== "object"
  ) {
    return { ok: false, error: "manifest-invalid" };
  }
  if (manifest.formatVersion !== PORTABLE_FORMAT_VERSION) {
    return { ok: false, error: "format-unsupported" };
  }
  return { ok: true, value: manifest as PortableManifest };
}

export const CURATED_CAPABILITIES = {
  promoted: [
    "document-vault",
    "portable-export-restore",
    "calendar-adapter",
    "email-adapter",
    "job-board-adapter",
    "career-and-learning-plans",
  ],
  deferred: [
    "inventory-crm",
    "document-rag",
    "interview-rooms",
    "immersive-work-map",
  ],
} as const;

export type IntegrationError = "kind-invalid" | "label-required" | "secret-not-allowed";

/**
 * The one reading of an integration submission, shared by adding and changing
 * one. Adapter settings hold only metadata; secrets belong in the vault.
 */
export function prepareIntegration(
  input: unknown,
):
  | { ok: true; value: Pick<IntegrationConnection, "kind" | "label" | "config"> }
  | { ok: false; error: IntegrationError } {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const kind = record.kind;
  if (kind !== "calendar" && kind !== "email" && kind !== "job-board") {
    return { ok: false, error: "kind-invalid" };
  }
  const label = typeof record.label === "string" ? record.label.trim() : "";
  if (!label) return { ok: false, error: "label-required" };
  const config =
    record.config && typeof record.config === "object" && !Array.isArray(record.config)
      ? (record.config as Record<string, unknown>)
      : {};
  if (holdsSecret(config)) return { ok: false, error: "secret-not-allowed" };
  return { ok: true, value: { kind, label, config } };
}

const SECRET_KEY = /password|secret|api.?key|access.?token|refresh.?token/i;

/** True when any key, at any depth of objects and arrays, names a secret. */
function holdsSecret(value: unknown, depth = 0): boolean {
  // Settings are shallow metadata; anything nested this deep is refused outright.
  if (depth > 20) return true;
  if (Array.isArray(value)) return value.some((item) => holdsSecret(item, depth + 1));
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, item]) => SECRET_KEY.test(key) || holdsSecret(item, depth + 1),
  );
}
