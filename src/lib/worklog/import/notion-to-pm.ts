/**
 * Worklog note import — Notion source (Sprint 6B v1, ADR-0019).
 *
 * Pure function: takes a `{ title, blocks }` payload (the route handler
 * has already fetched the Notion page metadata + paginated children) and
 * returns the same `ImportResult` shape produced by the Markdown / HTML
 * importers, so the storage layer treats Notion as just another source.
 *
 * Block coverage is intentionally narrow per ADR-0019:
 *   paragraph, heading_{1..3}, bulleted_list_item, numbered_list_item,
 *   to_do, code, quote, callout, divider, toggle (lossy fallback).
 * All other types are dropped + counted in `droppedBlocks` and replaced
 * with an `[unsupported …]` placeholder paragraph so the user sees the
 * gap rather than silent omission.
 */

import type {
  DroppedBlock,
  ImportOptions,
  ImportResult,
  ProseMirrorDoc,
  ProseMirrorMark,
  ProseMirrorNode,
} from "./types";
import { projectPlaintext } from "./pm-utils";

// ─────────────────────────────────────────────────────────
// Public types — minimal hand-shaped subset of Notion's
// BlockObjectResponse. The route handler casts SDK results
// down to these shapes before invoking importNotion(), so
// this module never imports @notionhq/client.
// ─────────────────────────────────────────────────────────

export type NotionRichText = {
  type: "text" | "mention" | "equation";
  text?: { content: string; link?: { url: string } | null };
  annotations: {
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
    underline: boolean;
    code: boolean;
    color?: string;
  };
  plain_text: string;
  href: string | null;
};

export type NotionBlockBase = {
  id: string;
  has_children: boolean;
};

export type NotionBlock = NotionBlockBase & {
  type: string;
  // Per-type body lives at block[type]; we narrow at the call site.
  [extra: string]: unknown;
};

export type NotionImportInput = {
  title: string;
  blocks: NotionBlock[];
};

// ─────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────

export function importNotion(
  input: NotionImportInput,
  _opts: ImportOptions = {},
): ImportResult {
  const droppedAcc = new Map<string, number>();
  const content: ProseMirrorNode[] = convertBlocks(input.blocks, droppedAcc);

  // Tiptap requires a non-empty doc — emit an empty paragraph if blocks
  // produced nothing at all (also matches the Markdown importer behaviour
  // for empty input).
  const docContent = content.length > 0 ? content : [emptyParagraph()];

  const contentJson: ProseMirrorDoc = { type: "doc", content: docContent };
  const plaintext = projectPlaintext(contentJson);

  const trimmedTitle = input.title.trim();
  const title = trimmedTitle.length > 0 ? trimmedTitle : "Untitled";

  return {
    title,
    contentJson,
    plaintext,
    droppedBlocks: aggregateDropped(droppedAcc),
  };
}

// ─────────────────────────────────────────────────────────
// Block conversion
// ─────────────────────────────────────────────────────────

function convertBlocks(
  blocks: NotionBlock[],
  dropped: Map<string, number>,
): ProseMirrorNode[] {
  const out: ProseMirrorNode[] = [];

  // Aggregate consecutive list-style runs into a single bulletList /
  // orderedList / taskList node. Notion returns each item as a separate
  // sibling block; ProseMirror needs them grouped.
  let runType: "bulleted_list_item" | "numbered_list_item" | "to_do" | null =
    null;
  let runItems: ProseMirrorNode[] = [];

  const flushRun = () => {
    if (!runType || runItems.length === 0) {
      runType = null;
      runItems = [];
      return;
    }
    if (runType === "bulleted_list_item") {
      out.push({ type: "bulletList", content: runItems });
    } else if (runType === "numbered_list_item") {
      out.push({ type: "orderedList", content: runItems });
    } else {
      out.push({ type: "taskList", content: runItems });
    }
    runType = null;
    runItems = [];
  };

  for (const b of blocks) {
    const t = b.type;
    if (
      t === "bulleted_list_item" ||
      t === "numbered_list_item" ||
      t === "to_do"
    ) {
      if (runType !== null && runType !== t) flushRun();
      runType = t;
      runItems.push(buildListItem(b));
      continue;
    }

    flushRun();

    const node = convertSingleBlock(b, dropped);
    if (node) out.push(node);
  }

  flushRun();
  return out;
}

function convertSingleBlock(
  b: NotionBlock,
  dropped: Map<string, number>,
): ProseMirrorNode | null {
  const t = b.type;
  const body = (b as Record<string, unknown>)[t] as Record<string, unknown> | undefined;
  const richText = readRichText(body?.rich_text);

  switch (t) {
    case "paragraph":
      return {
        type: "paragraph",
        content: richTextToInlines(richText),
      };

    case "heading_1":
    case "heading_2":
    case "heading_3": {
      const level = t === "heading_1" ? 1 : t === "heading_2" ? 2 : 3;
      return {
        type: "heading",
        attrs: { level },
        content: richTextToInlines(richText),
      };
    }

    case "code": {
      const language = normalizeLanguage(body?.language);
      const text = richText.map((r) => r.plain_text).join("");
      return {
        type: "codeBlock",
        attrs: { language },
        content: text ? [{ type: "text", text }] : [],
      };
    }

    case "quote":
      return {
        type: "blockquote",
        content: [
          {
            type: "paragraph",
            content: richTextToInlines(richText),
          },
        ],
      };

    case "callout": {
      const icon = body?.icon as { type?: string; emoji?: string } | undefined;
      const prefix = icon?.type === "emoji" && icon.emoji ? `${icon.emoji} ` : "";
      const inlines = richTextToInlines(richText);
      const withPrefix: ProseMirrorNode[] =
        prefix.length > 0
          ? [{ type: "text", text: prefix }, ...inlines]
          : inlines;
      return {
        type: "blockquote",
        content: [{ type: "paragraph", content: withPrefix }],
      };
    }

    case "divider":
      return { type: "horizontalRule" };

    case "toggle": {
      // v1 lossy fallback: emit the toggle title as a paragraph. Children
      // would require a separate API call; that's deferred to v2.
      return {
        type: "paragraph",
        content: richTextToInlines(richText),
      };
    }

    default:
      return handleUnsupported(t, dropped);
  }
}

function buildListItem(b: NotionBlock): ProseMirrorNode {
  const t = b.type;
  const body = (b as Record<string, unknown>)[t] as Record<string, unknown> | undefined;
  const richText = readRichText(body?.rich_text);

  if (t === "to_do") {
    const checked = body?.checked === true;
    return {
      type: "taskItem",
      attrs: { checked },
      content: [
        {
          type: "paragraph",
          content: richTextToInlines(richText),
        },
      ],
    };
  }

  return {
    type: "listItem",
    content: [
      {
        type: "paragraph",
        content: richTextToInlines(richText),
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────
// Rich-text → ProseMirror inline conversion
// ─────────────────────────────────────────────────────────

function readRichText(value: unknown): NotionRichText[] {
  if (!Array.isArray(value)) return [];
  return value as NotionRichText[];
}

function richTextToInlines(rt: NotionRichText[]): ProseMirrorNode[] {
  const out: ProseMirrorNode[] = [];
  for (const r of rt) {
    const text = r.text?.content ?? r.plain_text ?? "";
    if (text.length === 0) continue;
    const marks = buildMarks(r);
    const node: ProseMirrorNode = { type: "text", text };
    if (marks.length > 0) node.marks = marks;
    out.push(node);
  }
  return out;
}

function buildMarks(r: NotionRichText): ProseMirrorMark[] {
  const marks: ProseMirrorMark[] = [];
  const a = r.annotations;
  if (a.bold) marks.push({ type: "bold" });
  if (a.italic) marks.push({ type: "italic" });
  if (a.strikethrough) marks.push({ type: "strike" });
  if (a.underline) marks.push({ type: "underline" });
  if (a.code) marks.push({ type: "code" });

  const href = r.href ?? r.text?.link?.url ?? null;
  if (href) marks.push({ type: "link", attrs: { href } });

  return marks;
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function emptyParagraph(): ProseMirrorNode {
  return { type: "paragraph" };
}

function normalizeLanguage(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (!v || v === "plain text" || v === "plaintext" || v === "none") return null;
  return v;
}

function handleUnsupported(
  notionType: string,
  dropped: Map<string, number>,
): ProseMirrorNode {
  const key = `notion:${notionType}`;
  dropped.set(key, (dropped.get(key) ?? 0) + 1);
  return {
    type: "paragraph",
    content: [{ type: "text", text: `[unsupported ${notionType} block]` }],
  };
}

function aggregateDropped(map: Map<string, number>): DroppedBlock[] {
  return [...map.entries()].map(([type, count]) => ({ type, count }));
}
