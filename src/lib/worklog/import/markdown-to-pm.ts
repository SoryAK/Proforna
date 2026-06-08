/**
 * Worklog note import — Markdown source.
 *
 * Pipeline:
 *   1. gray-matter splits YAML frontmatter from body
 *   2. raw HTML embeds are stripped + counted (lossy-by-design v1)
 *   3. prosemirror-markdown's defaultMarkdownParser parses the cleaned body
 *   4. node/mark type names are remapped from snake_case (PM convention)
 *      to camelCase (Tiptap convention) so the JSON loads into the worklog
 *      editor without further translation
 *   5. title is resolved: frontmatter.title → first H1 → filename → "Untitled"
 *   6. plaintext projection mirrors WorkLog.content (search/exports)
 */

import matter from "gray-matter";
import { defaultMarkdownParser } from "prosemirror-markdown";
import type {
  DroppedBlock,
  ImportOptions,
  ImportResult,
  ProseMirrorDoc,
  ProseMirrorMark,
  ProseMirrorNode,
} from "./types";
import {
  extractFirstH1Text,
  filenameToTitle,
  projectPlaintext,
} from "./pm-utils";

// ─────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────

export function importMarkdown(
  markdown: string,
  opts: ImportOptions = {},
): ImportResult {
  const { content: body, frontmatterTitle } = splitFrontmatter(markdown);

  const { cleaned, dropped } = stripHtml(body);

  const contentJson = parseToTiptapDoc(cleaned);
  const plaintext = projectPlaintext(contentJson);

  const title =
    frontmatterTitle ??
    extractFirstH1Text(contentJson) ??
    filenameToTitle(opts.filename) ??
    "Untitled";

  return {
    title,
    contentJson,
    plaintext,
    droppedBlocks: dropped,
  };
}

// ─────────────────────────────────────────────────────────
// Frontmatter
// ─────────────────────────────────────────────────────────

function splitFrontmatter(markdown: string): {
  content: string;
  frontmatterTitle: string | null;
} {
  try {
    const parsed = matter(markdown);
    const title =
      parsed.data && typeof parsed.data.title === "string" && parsed.data.title.trim()
        ? parsed.data.title.trim()
        : null;
    return { content: parsed.content, frontmatterTitle: title };
  } catch {
    // Malformed YAML: fall through with raw input, no title from FM.
    return { content: markdown, frontmatterTitle: null };
  }
}

// ─────────────────────────────────────────────────────────
// HTML stripping (lossy-by-design v1)
// ─────────────────────────────────────────────────────────

function stripHtml(markdown: string): {
  cleaned: string;
  dropped: DroppedBlock[];
} {
  let count = 0;

  // 1. Drop block-level HTML elements that span their own line(s).
  let cleaned = markdown.replace(
    /^[ \t]*<([a-zA-Z][a-zA-Z0-9]*)\b[\s\S]*?<\/\1>[ \t]*$/gm,
    () => {
      count++;
      return "";
    },
  );

  // 2. Strip remaining inline tags. Each open/self-closing/close counts as one.
  cleaned = cleaned.replace(/<\/?[a-zA-Z][^>]*>/g, () => {
    count++;
    return "";
  });

  return {
    cleaned,
    dropped: count > 0 ? [{ type: "md:html", count }] : [],
  };
}

// ─────────────────────────────────────────────────────────
// Markdown → PM JSON, normalized to Tiptap conventions
// ─────────────────────────────────────────────────────────

const NODE_RENAMES: Record<string, string> = {
  bullet_list: "bulletList",
  ordered_list: "orderedList",
  list_item: "listItem",
  code_block: "codeBlock",
  horizontal_rule: "horizontalRule",
  hard_break: "hardBreak",
};

const MARK_RENAMES: Record<string, string> = {
  strong: "bold",
  em: "italic",
};

function parseToTiptapDoc(markdown: string): ProseMirrorDoc {
  if (!markdown.trim()) {
    return { type: "doc", content: [] };
  }
  let raw: unknown;
  try {
    const node = defaultMarkdownParser.parse(markdown);
    raw = node ? node.toJSON() : { type: "doc", content: [] };
  } catch {
    return { type: "doc", content: [] };
  }
  return tiptapifyDoc(raw);
}

function tiptapifyDoc(raw: unknown): ProseMirrorDoc {
  if (!raw || typeof raw !== "object") {
    return { type: "doc", content: [] };
  }
  const node = renameNode(raw as ProseMirrorNode);
  return {
    type: "doc",
    content: node.content ?? [],
  };
}

function renameNode(node: ProseMirrorNode): ProseMirrorNode {
  const renamedType = NODE_RENAMES[node.type] ?? node.type;
  const renamedAttrs = renameAttrs(renamedType, node.attrs);
  return {
    type: renamedType,
    ...(renamedAttrs ? { attrs: renamedAttrs } : {}),
    ...(node.text !== undefined ? { text: node.text } : {}),
    ...(node.marks ? { marks: node.marks.map(renameMark) } : {}),
    ...(node.content ? { content: node.content.map(renameNode) } : {}),
  };
}

function renameMark(mark: ProseMirrorMark): ProseMirrorMark {
  const renamedType = MARK_RENAMES[mark.type] ?? mark.type;
  return {
    type: renamedType,
    ...(mark.attrs ? { attrs: mark.attrs } : {}),
  };
}

function renameAttrs(
  nodeType: string,
  attrs: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!attrs) return undefined;
  // prosemirror-markdown stores fenced code language under `params`.
  if (nodeType === "codeBlock" && "params" in attrs) {
    const { params, ...rest } = attrs;
    return {
      ...rest,
      language: typeof params === "string" && params.length > 0 ? params : null,
    };
  }
  return attrs;
}


