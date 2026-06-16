/**
 * Worklog "Grill Me" — ProseMirror JSON → Markdown serializer.
 *
 * Walks Tiptap-shaped JSON (camelCase node names) and emits CommonMark +
 * GFM extensions (task lists, strikethrough). Server-safe: no Tiptap or
 * editor runtime required.
 *
 * Strategy:
 *   - Direct JSON walk (no PM Node rehydration) keeps the export path
 *     dependency-free and easy to reason about.
 *   - Custom Resumsify nodes (mention, tag, shiftBlock, moodBlock, photo)
 *     emit semantic placeholders that survive AI rewrites and round-trip
 *     back through importMarkdown() at least as plain text.
 *   - canvasBlock is intentionally dropped (counted in droppedBlocks) —
 *     a binary canvas snapshot can't survive markdown.
 */

import type {
  DroppedBlock,
  ProseMirrorDoc,
  ProseMirrorMark,
  ProseMirrorNode,
} from "@/lib/worklog/import/types";

export interface SerializeResult {
  markdown: string;
  droppedBlocks: DroppedBlock[];
}

const MENTION_PREFIX: Record<string, string> = {
  asset: "a",
  skill: "s",
  company: "c",
  contact: "p",
  worklog: "n",
};

// ─────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────

export function serializeToMarkdown(doc: ProseMirrorDoc): SerializeResult {
  const ctx: WalkCtx = { dropped: new Map() };

  // ADR-0030 Unit 10 — procedureDoc has its own deterministic shape
  // (title, optional tools, then a flat list of steps). Emit it via a
  // dedicated walker so that procedure-only nodes (procedureTitle /
  // procedureTools / procedureStep) never reach `emitBlock` (which
  // would otherwise count them as dropped unknown blocks).
  const blocks =
    (doc as { type?: string }).type === "procedureDoc"
      ? emitProcedureDoc(doc.content ?? [], ctx)
      : (doc.content ?? []).map((node) => emitBlock(node, ctx, 0));

  // Filter empty strings (e.g. dropped block contributions) before joining.
  const markdown = blocks.filter((b) => b !== "").join("\n\n");
  // Trailing newline for POSIX-y feel; only when there is content.
  const finalMarkdown = markdown === "" ? "" : markdown + "\n";
  const droppedBlocks: DroppedBlock[] = Array.from(ctx.dropped.entries()).map(
    ([type, count]) => ({ type, count }),
  );
  return { markdown: finalMarkdown, droppedBlocks };
}

// ─────────────────────────────────────────────────────────
// Walker context
// ─────────────────────────────────────────────────────────

interface WalkCtx {
  dropped: Map<string, number>;
}

function recordDrop(ctx: WalkCtx, type: string): void {
  ctx.dropped.set(type, (ctx.dropped.get(type) ?? 0) + 1);
}

// ─────────────────────────────────────────────────────────
// procedureDoc walker (ADR-0030 Unit 10)
// ─────────────────────────────────────────────────────────

/**
 * Emit a procedureDoc body — title H1, optional Tools section, then a
 * positionally-numbered sequence of step H2s with their content emitted
 * recursively. Procedure-only nodes (procedureTitle / procedureTools /
 * procedureStep) are intentionally NOT routed through `emitBlock`, so
 * they never end up in `droppedBlocks` even though they are not in the
 * notes-shape vocabulary.
 */
function emitProcedureDoc(
  content: ProseMirrorNode[],
  ctx: WalkCtx,
): string[] {
  const blocks: string[] = [];
  let stepIndex = 0;

  for (const node of content) {
    switch (node.type) {
      case "procedureTitle": {
        const inline = emitInline(node.content ?? [], ctx);
        if (inline.trim().length > 0) {
          blocks.push(`# ${inline}`);
        }
        break;
      }

      case "procedureTools": {
        const body = emitChildBlocks(node.content ?? [], ctx, 0);
        if (body.trim().length > 0) {
          blocks.push(`## Tools\n\n${body}`);
        }
        break;
      }

      case "procedureStep": {
        stepIndex += 1;
        const titleAttr =
          typeof node.attrs?.title === "string" && node.attrs.title.trim().length > 0
            ? node.attrs.title
            : null;
        const heading = titleAttr
          ? `## Step ${stepIndex} \u2014 ${titleAttr}`
          : `## Step ${stepIndex}`;
        const body = emitChildBlocks(node.content ?? [], ctx, 0);
        blocks.push(body.length > 0 ? `${heading}\n\n${body}` : heading);
        break;
      }

      default:
        // Unknown node inside a procedureDoc — fall through to the
        // standard emitter so anything legitimately blockable (e.g. a
        // stray paragraph from a bad import) still renders, and unknown
        // types still get counted in droppedBlocks.
        blocks.push(emitBlock(node, ctx, 0));
        break;
    }
  }

  return blocks;
}

// ─────────────────────────────────────────────────────────
// Block emitters
// ─────────────────────────────────────────────────────────

function emitBlock(
  node: ProseMirrorNode,
  ctx: WalkCtx,
  listDepth: number,
): string {
  switch (node.type) {
    case "paragraph":
      return emitInline(node.content ?? [], ctx);

    case "heading": {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)));
      return `${"#".repeat(level)} ${emitInline(node.content ?? [], ctx)}`;
    }

    case "blockquote":
      return prefixLines(emitChildBlocks(node.content ?? [], ctx, listDepth), "> ");

    case "codeBlock": {
      const lang = typeof node.attrs?.language === "string" ? node.attrs.language : "";
      const text = (node.content ?? []).map((c) => c.text ?? "").join("");
      return `\`\`\`${lang}\n${text}\n\`\`\``;
    }

    case "bulletList":
      return emitList(node.content ?? [], ctx, listDepth, "-");

    case "orderedList":
      return emitOrderedList(node.content ?? [], ctx, listDepth);

    case "taskList":
      return emitTaskList(node.content ?? [], ctx, listDepth);

    case "photo":
      return emitPhoto(node);

    case "canvasBlock": {
      recordDrop(ctx, "canvasBlock");
      const title = typeof node.attrs?.title === "string" && node.attrs.title
        ? node.attrs.title
        : "Canvas";
      return `[Canvas: ${title} — not exported]`;
    }

    default:
      // Unknown block — record + skip silently. Importer will treat
      // surrounding context as plain paragraphs.
      recordDrop(ctx, node.type);
      return "";
  }
}

function emitChildBlocks(
  nodes: ProseMirrorNode[],
  ctx: WalkCtx,
  listDepth: number,
): string {
  return nodes
    .map((n) => emitBlock(n, ctx, listDepth))
    .filter((b) => b !== "")
    .join("\n\n");
}

function emitList(
  items: ProseMirrorNode[],
  ctx: WalkCtx,
  listDepth: number,
  bullet: string,
): string {
  return items.map((item) => emitListItem(item, ctx, listDepth, bullet)).join("\n");
}

function emitOrderedList(
  items: ProseMirrorNode[],
  ctx: WalkCtx,
  listDepth: number,
): string {
  return items
    .map((item, i) => emitListItem(item, ctx, listDepth, `${i + 1}.`))
    .join("\n");
}

function emitTaskList(
  items: ProseMirrorNode[],
  ctx: WalkCtx,
  listDepth: number,
): string {
  return items
    .map((item) => {
      const checked = item.attrs?.checked === true;
      const box = checked ? "[x]" : "[ ]";
      const body = emitListItemBody(item.content ?? [], ctx, listDepth);
      return `${"  ".repeat(listDepth)}- ${box} ${body}`;
    })
    .join("\n");
}

function emitListItem(
  item: ProseMirrorNode,
  ctx: WalkCtx,
  listDepth: number,
  marker: string,
): string {
  const body = emitListItemBody(item.content ?? [], ctx, listDepth);
  return `${"  ".repeat(listDepth)}${marker} ${body}`;
}

/**
 * List items contain block-level children (paragraph + nested lists). We
 * emit the first paragraph inline and indent any subsequent nested lists.
 */
function emitListItemBody(
  children: ProseMirrorNode[],
  ctx: WalkCtx,
  listDepth: number,
): string {
  const parts: string[] = [];
  for (const child of children) {
    if (child.type === "paragraph") {
      parts.push(emitInline(child.content ?? [], ctx));
    } else if (
      child.type === "bulletList" ||
      child.type === "orderedList" ||
      child.type === "taskList"
    ) {
      parts.push("\n" + emitBlock(child, ctx, listDepth + 1));
    } else {
      parts.push(emitBlock(child, ctx, listDepth + 1));
    }
  }
  return parts.join("");
}

function emitPhoto(node: ProseMirrorNode): string {
  const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
  const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
  const caption = typeof node.attrs?.caption === "string" ? node.attrs.caption : "";
  const img = `![${alt}](${src})`;
  return caption ? `${img}\n\n> ${caption}` : img;
}

function prefixLines(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line) => prefix + line)
    .join("\n");
}

// ─────────────────────────────────────────────────────────
// Inline emitter
// ─────────────────────────────────────────────────────────

function emitInline(nodes: ProseMirrorNode[], ctx: WalkCtx): string {
  let out = "";
  for (const node of nodes) {
    out += emitInlineNode(node, ctx);
  }
  return out;
}

function emitInlineNode(node: ProseMirrorNode, ctx: WalkCtx): string {
  switch (node.type) {
    case "text":
      return applyMarks(node.text ?? "", node.marks ?? []);

    case "hardBreak":
      // CommonMark hard break: two trailing spaces + newline.
      return "  \n";

    case "tag": {
      const label = typeof node.attrs?.label === "string" ? node.attrs.label : "";
      return `#${label}`;
    }

    case "mention": {
      const entityType = typeof node.attrs?.entityType === "string"
        ? node.attrs.entityType
        : "";
      const entityId = typeof node.attrs?.entityId === "string"
        ? node.attrs.entityId
        : "";
      const prefix = MENTION_PREFIX[entityType] ?? "x";
      return `@${prefix}:${entityId}`;
    }

    case "shiftBlock": {
      const label = typeof node.attrs?.label === "string" ? node.attrs.label : "";
      const start = node.attrs?.startMinute;
      const end = node.attrs?.endMinute;
      const window = formatShiftWindow(start, end);
      return window ? `[Shift: ${label} ${window}]` : `[Shift: ${label}]`;
    }

    case "moodBlock": {
      const value = typeof node.attrs?.value === "string" ? node.attrs.value : "neutral";
      return `[Mood: ${value}]`;
    }

    default:
      recordDrop(ctx, node.type);
      return "";
  }
}

// Order matters for nested marks: outermost emitted first.
const MARK_ORDER: Record<string, number> = {
  link: 0,
  bold: 1,
  italic: 2,
  strike: 3,
  code: 4,
};

function applyMarks(text: string, marks: ProseMirrorMark[]): string {
  if (marks.length === 0) return escapeMarkdownText(text);

  // Separate `code` because its delimiters MUST hug the text without escaping
  // (CommonMark inline code is verbatim).
  const sorted = [...marks].sort(
    (a, b) => (MARK_ORDER[a.type] ?? 99) - (MARK_ORDER[b.type] ?? 99),
  );

  // If `code` is among the marks, treat it as innermost — escape outer
  // wrapping but emit inline code raw.
  const hasCode = sorted.some((m) => m.type === "code");
  let inner = hasCode ? `\`${text}\`` : escapeMarkdownText(text);

  for (let i = sorted.length - 1; i >= 0; i--) {
    const mark = sorted[i];
    if (mark.type === "code") continue; // already applied as innermost
    inner = wrapMark(inner, mark);
  }
  return inner;
}

function wrapMark(text: string, mark: ProseMirrorMark): string {
  switch (mark.type) {
    case "bold":
      return `**${text}**`;
    case "italic":
      return `*${text}*`;
    case "strike":
      return `~~${text}~~`;
    case "link": {
      const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : "";
      return `[${text}](${href})`;
    }
    default:
      return text;
  }
}

// Markdown punctuation that must be escaped in inline plain text. Skipping
// `*` and `_` would clobber emphasis emitted by wrapping marks; we only
// escape the literally-ambiguous characters that aren't part of our own
// emitter output.
const ESCAPE_RE = /([\\`])/g;

function escapeMarkdownText(text: string): string {
  return text.replace(ESCAPE_RE, "\\$1");
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function formatShiftWindow(
  startMinute: unknown,
  endMinute: unknown,
): string | null {
  if (typeof startMinute !== "number" || typeof endMinute !== "number") {
    return null;
  }
  return `${minuteToHHMM(startMinute)}–${minuteToHHMM(endMinute)}`;
}

function minuteToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
