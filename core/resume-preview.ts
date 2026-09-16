export type ResumePreviewKind = "pdf" | "text" | "other";

export function classifyResumePreview(file: {
  name?: string | null;
  type?: string | null;
}): ResumePreviewKind {
  const type = (file.type ?? "").toLowerCase();
  const name = (file.name ?? "").toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (type === "text/plain" || type.startsWith("text/") || name.endsWith(".txt")) {
    return "text";
  }
  return "other";
}
