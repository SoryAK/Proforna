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
