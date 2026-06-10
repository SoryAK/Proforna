/**
 * Worklog "Grill Me" — markdown frontmatter (serialize + parse).
 *
 * Frontmatter is the load-bearing identity layer for the round-trip flow:
 * a re-imported file matches its source worklog only when frontmatter is
 * intact and references a known id+version pair.
 *
 * Parser is intentionally strict (rejects missing/non-numeric version,
 * empty id, malformed YAML) so callers can trust a non-null result.
 */

import matter from "gray-matter";

export interface GrillFrontmatter {
  id: string;
  version: number;
  exportedAt: string;
  title?: string;
}

// ─────────────────────────────────────────────────────────
// Serialize
// ─────────────────────────────────────────────────────────

const SCALAR_NEEDS_QUOTE = /[:#&*!|>'"%@`{}\[\],?]|^\s|\s$|^-/;

function yamlScalar(value: string): string {
  if (value === "") return "''";
  if (!SCALAR_NEEDS_QUOTE.test(value)) return value;
  // Single-quote style: escape internal single quotes by doubling.
  return `'${value.replace(/'/g, "''")}'`;
}

export function serializeFrontmatter(fm: GrillFrontmatter): string {
  const lines = [
    "---",
    `id: ${yamlScalar(fm.id)}`,
    `version: ${fm.version}`,
    `exportedAt: ${yamlScalar(fm.exportedAt)}`,
  ];
  if (fm.title !== undefined) {
    lines.push(`title: ${yamlScalar(fm.title)}`);
  }
  lines.push("---", "");
  return lines.join("\n") + "\n";
}

// ─────────────────────────────────────────────────────────
// Parse
// ─────────────────────────────────────────────────────────

export function parseFrontmatter(raw: string): {
  frontmatter: GrillFrontmatter | null;
  body: string;
} {
  let parsed: ReturnType<typeof matter>;
  try {
    parsed = matter(raw);
  } catch {
    return { frontmatter: null, body: raw };
  }

  const data = parsed.data as Record<string, unknown>;
  const id = data.id;
  const version = data.version;
  const exportedAt = data.exportedAt;
  const title = data.title;

  const validId = typeof id === "string" && id.length > 0;
  const validVersion = typeof version === "number" && Number.isFinite(version);

  if (!validId || !validVersion) {
    return { frontmatter: null, body: raw };
  }

  const fm: GrillFrontmatter = {
    id: id as string,
    version: version as number,
    exportedAt: typeof exportedAt === "string" ? exportedAt : "",
  };
  if (typeof title === "string") {
    fm.title = title;
  }

  // gray-matter retains the blank-line separator after the closing fence in
  // `parsed.content` (e.g. "---\n\nbody" → "\nbody"). Our serializer always
  // emits exactly one such separator, so strip one leading newline to give
  // callers a clean round-trippable body.
  const body = parsed.content.startsWith("\n")
    ? parsed.content.slice(1)
    : parsed.content;

  return { frontmatter: fm, body };
}
