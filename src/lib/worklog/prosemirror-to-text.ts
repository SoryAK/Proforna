/**
 * Convert a ProseMirror document (the JSON shape produced by Tiptap's
 * `editor.getJSON()`) into a plain-text projection suitable for storage in
 * `WorkLog.content` (used by search, exports, AI consumers, legacy readers).
 *
 * Phase 1b: keep this deterministic and dependency-free. Block boundaries
 * become newlines; list items get a "- " bullet prefix; everything else is
 * concatenated text. Custom blocks added later (shift/mood/mention) can
 * override their plain-text representation via an `attrs.plainText` hint.
 */

type PmNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown> | null;
  content?: PmNode[];
};

const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "bulletList",
  "orderedList",
  "taskList",
  "photo",
  "canvasBlock",
]);

export function proseMirrorDocToPlainText(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const root = doc as PmNode;
  if (!Array.isArray(root.content)) return "";

  // ADR-0030: procedureDoc has its own top-level structure (title + optional
  // tools + steps). Project it with structural markers so the search index
  // and AI consumers see something useful.
  if (root.type === "procedureDoc") {
    return projectProcedureDoc(root);
  }

  if (root.type !== "doc") return "";
  const lines: string[] = [];
  for (const child of root.content) {
    walk(child, lines, "");
  }
  // Trim trailing whitespace lines but preserve interior spacing.
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * ADR-0030 — project a procedureDoc into plain text. Step numbering is
 * positional (computed from sibling index), matching the rendering rule:
 * "Step N" or "Step N — <title>" depending on the optional `title` attr.
 *
 * Only procedureStep siblings count toward the running step number. The
 * optional procedureTools block does NOT consume a step number.
 */
function projectProcedureDoc(root: PmNode): string {
  const sections: string[] = [];
  let stepCounter = 0;
  for (const child of root.content ?? []) {
    if (!child) continue;
    if (child.type === "procedureTitle") {
      const text = collectInlineText(child).trim();
      if (text) sections.push(text);
      continue;
    }
    if (child.type === "procedureTools") {
      const inner = collectBlockText(child);
      if (inner.length > 0) {
        sections.push(`Tools:\n${inner}`);
      } else {
        sections.push("Tools:");
      }
      continue;
    }
    if (child.type === "procedureStep") {
      stepCounter += 1;
      const stepTitle =
        (child.attrs as { title?: string | null } | null)?.title ?? null;
      const header =
        stepTitle && stepTitle.length > 0 ? `Step ${stepCounter} \u2014 ${stepTitle}` : `Step ${stepCounter}`;
      const body = collectBlockText(child);
      sections.push(body.length > 0 ? `${header}\n${body}` : header);
      continue;
    }
    // Unknown child type — best-effort walk so we never crash.
    const fallback = collectBlockText(child);
    if (fallback) sections.push(fallback);
  }
  return sections.join("\n\n").trim();
}

/**
 * Walk a container node's block children using the same logic as the
 * top-level `doc` walker, then return the joined newline-separated text.
 * Used for procedureTools and procedureStep bodies.
 */
function collectBlockText(container: PmNode): string {
  if (!Array.isArray(container.content)) return "";
  const lines: string[] = [];
  for (const child of container.content) {
    walk(child, lines, "");
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function walk(node: PmNode, lines: string[], prefix: string) {
  if (!node) return;

  // Authoring hint: any custom node can supply attrs.plainText for its projection.
  const hint = node.attrs && typeof node.attrs === "object" ? (node.attrs as Record<string, unknown>).plainText : undefined;
  if (typeof hint === "string") {
    lines.push(prefix + hint);
    return;
  }

  switch (node.type) {
    case "text":
      // Text nodes should only appear inside a block; caller handles flush.
      lines.push(prefix + (node.text ?? ""));
      return;
    case "hardBreak":
      lines.push("");
      return;
    case "horizontalRule":
      lines.push("---");
      return;
    case "photo": {
      const a = (node.attrs ?? {}) as Record<string, unknown>;
      const caption = typeof a.caption === "string" && a.caption ? a.caption : null;
      const alt = typeof a.alt === "string" && a.alt ? a.alt : null;
      lines.push(prefix + `[Photo: ${caption ?? alt ?? "image"}]`);
      return;
    }
    case "shiftBlock": {
      const a = (node.attrs ?? {}) as Record<string, unknown>;
      const label = typeof a.label === "string" ? a.label : "";
      const window = formatShiftWindow(
        typeof a.startMinute === "number" ? a.startMinute : null,
        typeof a.endMinute === "number" ? a.endMinute : null,
      );
      lines.push(prefix + (window ? `[Shift: ${label} ${window}]` : `[Shift: ${label}]`));
      return;
    }
    case "moodBlock": {
      const v = (node.attrs as { value?: string } | null)?.value ?? "neutral";
      const label = v === "good" ? "Good" : v === "tough" ? "Tough" : "OK";
      lines.push(prefix + `[Mood: ${label}]`);
      return;
    }
    case "canvasBlock": {
      const title = (node.attrs as { title?: string | null } | null)?.title;
      lines.push(prefix + (title ? `[Canvas: ${title}]` : "[Canvas]"));
      return;
    }
    case "tag": {
      const label = (node.attrs as { label?: string } | null)?.label ?? "";
      if (label) lines.push(prefix + `#${label}`);
      return;
    }
    case "bulletList":
    case "orderedList":
    case "taskList": {
      const items = node.content ?? [];
      items.forEach((item, idx) => {
        let bullet: string;
        if (node.type === "orderedList") {
          bullet = `${idx + 1}. `;
        } else if (node.type === "taskList") {
          const checked = (item.attrs as { checked?: boolean } | null)?.checked === true;
          bullet = checked ? "- [x] " : "- [ ] ";
        } else {
          bullet = "- ";
        }
        walkListItem(item, lines, prefix + bullet);
      });
      return;
    }
    default: {
      if (BLOCK_TYPES.has(node.type)) {
        const text = collectInlineText(node);
        if (text.length > 0) lines.push(prefix + text);
        else lines.push(""); // preserve empty block as blank line
        return;
      }
      // Unknown node: try children, otherwise skip.
      if (Array.isArray(node.content)) {
        for (const child of node.content) walk(child, lines, prefix);
      }
    }
  }
}

function walkListItem(item: PmNode, lines: string[], prefix: string) {
  if (!item || !Array.isArray(item.content)) {
    lines.push(prefix);
    return;
  }
  // List item children are usually paragraphs; flatten inline text.
  const parts: string[] = [];
  for (const child of item.content) {
    if (BLOCK_TYPES.has(child.type)) {
      const text = collectInlineText(child);
      if (text.length > 0) parts.push(text);
    } else if (child.type === "text") {
      parts.push(child.text ?? "");
    } else if (Array.isArray(child.content)) {
      parts.push(collectInlineText(child));
    }
  }
  lines.push(prefix + parts.join(" ").trim());
}

function collectInlineText(node: PmNode): string {
  if (!Array.isArray(node.content)) return "";
  const parts: string[] = [];
  for (const child of node.content) {
    if (child.type === "text") {
      parts.push(child.text ?? "");
    } else if (child.type === "hardBreak") {
      parts.push("\n");
    } else if (child.type === "shiftBlock") {
      const a = (child.attrs ?? {}) as Record<string, unknown>;
      const label = typeof a.label === "string" ? a.label : "";
      const window = formatShiftWindow(
        typeof a.startMinute === "number" ? a.startMinute : null,
        typeof a.endMinute === "number" ? a.endMinute : null,
      );
      parts.push(window ? `[Shift: ${label} ${window}]` : `[Shift: ${label}]`);
    } else if (child.type === "moodBlock") {
      const v = (child.attrs as { value?: string } | null)?.value ?? "neutral";
      const label = v === "good" ? "Good" : v === "tough" ? "Tough" : "OK";
      parts.push(`[Mood: ${label}]`);
    } else if (child.type === "tag") {
      const label = (child.attrs as { label?: string } | null)?.label ?? "";
      if (label) parts.push(`#${label}`);
    } else if (child.type === "mention") {
      const label = (child.attrs as { label?: string } | null)?.label ?? "";
      if (label) parts.push(`@${label}`);
    } else {
      parts.push(collectInlineText(child));
    }
  }
  return parts.join("");
}

function formatShiftWindow(start: number | null, end: number | null): string {
  if (start == null || end == null) return "";
  return `${formatMinute(start)}–${formatMinute(end)}`;
}

function formatMinute(m: number): string {
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}:${mm} ${period}`;
}

/**
 * Return the unique set of `entityId` values for every `mention` node whose
 * `entityType` matches the given filter, walking the entire ProseMirror doc
 * (top-level blocks + nested inline atoms inside paragraphs/lists/etc).
 *
 * Used server-side to auto-populate denormalized `WorkLog.<kind>Ids` columns
 * from the editor's `contentJson` on save.
 *
 * @see ADR-0012 (asset mentions origin), ADR-0016 (note-to-note linking).
 */
export function extractMentionEntityIds(
  doc: unknown,
  entityType: string,
): string[] {
  if (!doc || typeof doc !== "object") return [];
  const root = doc as PmNode;
  // ADR-0030: also accept procedureDoc — same recursive descent works for
  // both shapes since collectMentions walks .content uniformly.
  if (root.type !== "doc" && root.type !== "procedureDoc") return [];
  if (!Array.isArray(root.content)) return [];
  const ids = new Set<string>();
  collectMentions(root, ids, entityType);
  return Array.from(ids);
}

function collectMentions(node: PmNode, ids: Set<string>, entityType: string): void {
  if (node.type === "mention") {
    const a = node.attrs as { entityType?: string; entityId?: string } | null;
    if (a?.entityType === entityType && typeof a.entityId === "string" && a.entityId) {
      ids.add(a.entityId);
    }
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) collectMentions(child, ids, entityType);
  }
}

/**
 * Return the unique set of `entityId` values for every `mention` node whose
 * `entityType` is `"asset"` in the given ProseMirror doc. Used server-side to
 * auto-populate `WorkLog.assetIds` when the editor saves `contentJson`.
 *
 * Thin wrapper around `extractMentionEntityIds` for callsite compatibility.
 */
export function extractMentionAssetIds(doc: unknown): string[] {
  return extractMentionEntityIds(doc, "asset");
}

/** Build a minimal ProseMirror doc from a plain-text legacy `content` string. */
export function plainTextToProseMirrorDoc(text: string | null | undefined) {
  const trimmed = (text ?? "").replace(/\r\n/g, "\n");
  if (!trimmed) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }
  const paragraphs = trimmed.split(/\n{2,}/);
  return {
    type: "doc",
    content: paragraphs.map((p) => {
      const lines = p.split("\n");
      const inline: PmNode[] = [];
      lines.forEach((line, idx) => {
        if (idx > 0) inline.push({ type: "hardBreak" });
        if (line.length > 0) inline.push({ type: "text", text: line });
      });
      return inline.length > 0
        ? { type: "paragraph", content: inline }
        : { type: "paragraph" };
    }),
  };
}
