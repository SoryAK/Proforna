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
]);

export function proseMirrorDocToPlainText(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const root = doc as PmNode;
  if (root.type !== "doc" || !Array.isArray(root.content)) return "";
  const lines: string[] = [];
  for (const child of root.content) {
    walk(child, lines, "");
  }
  // Trim trailing whitespace lines but preserve interior spacing.
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
