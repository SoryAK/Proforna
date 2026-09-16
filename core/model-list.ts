/** OpenAI `data[].id` and Ollama `/api/tags` `models[].name`. */
export function parseDiscoveredModels(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const record = body as Record<string, unknown>;
  const rows = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.models)
      ? record.models
      : [];
  const names = rows
    .map((row) => {
      if (typeof row === "string") return row.trim();
      if (!row || typeof row !== "object") return "";
      const item = row as Record<string, unknown>;
      if (typeof item.id === "string") return item.id.trim();
      if (typeof item.name === "string") return item.name.trim();
      return "";
    })
    .filter(Boolean);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}
