/**
 * Worklog note import — HTML source.
 *
 * Pipeline:
 *   1. jsdom parses the raw HTML string into a DOM tree
 *   2. <script>, <style>, <meta>, <link>, and HTML comments are removed
 *      and counted (lossy-by-design v1; never leak script payloads into
 *      contentJson or plaintext)
 *   3. prosemirror-model's DOMParser walks the cleaned body against the
 *      Tiptap-shaped schema below → ProseMirror node tree
 *   4. .toJSON() produces the Tiptap-shaped JSON
 *   5. title is resolved: <title> → first <h1> → filename → "Untitled"
 *   6. plaintext projection mirrors WorkLog.content (search/exports)
 *
 * Note: the schema duplicates Tiptap-StarterKit's node/mark names so the
 * output JSON loads into the worklog editor without translation. Keeping
 * this schema isolated to the importer (not shared with the editor) means
 * UI changes never silently break import.
 */

import { JSDOM } from "jsdom";
import { DOMParser as PMDOMParser, Schema } from "prosemirror-model";
import type {
  DroppedBlock,
  ImportOptions,
  ImportResult,
  ProseMirrorDoc,
} from "./types";
import {
  extractFirstH1Text,
  filenameToTitle,
  projectPlaintext,
} from "./pm-utils";

// ─────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────

export function importHtml(
  html: string,
  opts: ImportOptions = {},
): ImportResult {
  if (!html.trim()) {
    return {
      title: "Untitled",
      contentJson: { type: "doc", content: [] },
      plaintext: "",
      droppedBlocks: [],
    };
  }

  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const droppedBlocks = stripUnsupported(doc);

  const titleTag = doc.querySelector("title")?.textContent?.trim() || null;

  const body = doc.body ?? doc.documentElement;
  let contentJson: ProseMirrorDoc;
  try {
    const pmNode = PMDOMParser.fromSchema(schema).parse(body);
    contentJson = pmNode.toJSON() as ProseMirrorDoc;
  } catch {
    contentJson = { type: "doc", content: [] };
  }

  const title =
    titleTag ??
    extractFirstH1Text(contentJson) ??
    filenameToTitle(opts.filename) ??
    "Untitled";

  const plaintext = projectPlaintext(contentJson);

  return { title, contentJson, plaintext, droppedBlocks };
}

// ─────────────────────────────────────────────────────────
// Drop unsupported nodes (mutates `doc`)
// ─────────────────────────────────────────────────────────

const DROP_TAGS = ["script", "style", "meta", "link", "noscript", "iframe"];

function stripUnsupported(doc: Document): DroppedBlock[] {
  const counts: Record<string, number> = {};

  for (const tag of DROP_TAGS) {
    const els = doc.querySelectorAll(tag);
    if (els.length > 0) {
      counts[`html:${tag}`] = (counts[`html:${tag}`] ?? 0) + els.length;
      els.forEach((el) => el.remove());
    }
  }

  // Comments: walk and collect, then remove.
  const walker = doc.createTreeWalker(doc, 0x80 /* SHOW_COMMENT */);
  const comments: Comment[] = [];
  let n: Node | null = walker.nextNode();
  while (n) {
    comments.push(n as Comment);
    n = walker.nextNode();
  }
  if (comments.length > 0) {
    counts["html:comment"] = comments.length;
    comments.forEach((c) => c.parentNode?.removeChild(c));
  }

  return Object.entries(counts).map(([type, count]) => ({ type, count }));
}

// ─────────────────────────────────────────────────────────
// Tiptap-shaped ProseMirror schema (HTML import target)
// ─────────────────────────────────────────────────────────

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },

    paragraph: {
      content: "inline*",
      group: "block",
      parseDOM: [{ tag: "p" }, { tag: "div" }],
      toDOM: () => ["p", 0],
    },

    heading: {
      attrs: { level: { default: 1 } },
      content: "inline*",
      group: "block",
      defining: true,
      parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
        tag: `h${level}`,
        attrs: { level },
      })),
      toDOM: (node) => [`h${node.attrs.level}`, 0],
    },

    blockquote: {
      content: "block+",
      group: "block",
      defining: true,
      parseDOM: [{ tag: "blockquote" }],
      toDOM: () => ["blockquote", 0],
    },

    codeBlock: {
      attrs: { language: { default: null } },
      content: "text*",
      marks: "",
      group: "block",
      code: true,
      defining: true,
      parseDOM: [
        {
          tag: "pre",
          preserveWhitespace: "full" as const,
          getAttrs: (node: HTMLElement | string) => {
            if (typeof node === "string") return { language: null };
            const codeEl = node.querySelector("code");
            const cls =
              codeEl?.getAttribute("class") ?? node.getAttribute("class") ?? "";
            const m = cls.match(/language-([a-zA-Z0-9_+-]+)/);
            return { language: m ? m[1] : null };
          },
        },
      ],
      toDOM: (node) => [
        "pre",
        [
          "code",
          node.attrs.language
            ? { class: `language-${node.attrs.language}` }
            : {},
          0,
        ],
      ],
    },

    bulletList: {
      content: "listItem+",
      group: "block",
      parseDOM: [{ tag: "ul" }],
      toDOM: () => ["ul", 0],
    },

    orderedList: {
      content: "listItem+",
      group: "block",
      parseDOM: [{ tag: "ol" }],
      toDOM: () => ["ol", 0],
    },

    listItem: {
      content: "paragraph block*",
      parseDOM: [{ tag: "li" }],
      toDOM: () => ["li", 0],
    },

    horizontalRule: {
      group: "block",
      parseDOM: [{ tag: "hr" }],
      toDOM: () => ["hr"],
    },

    hardBreak: {
      inline: true,
      group: "inline",
      selectable: false,
      parseDOM: [{ tag: "br" }],
      toDOM: () => ["br"],
    },

    image: {
      attrs: {
        src: { default: "" },
        alt: { default: null },
        title: { default: null },
      },
      inline: true,
      group: "inline",
      draggable: true,
      parseDOM: [
        {
          tag: "img[src]",
          getAttrs: (node: HTMLElement | string) => {
            if (typeof node === "string") return false;
            return {
              src: node.getAttribute("src"),
              alt: node.getAttribute("alt"),
              title: node.getAttribute("title"),
            };
          },
        },
      ],
      toDOM: (node) => ["img", node.attrs],
    },

    text: { group: "inline" },
  },

  marks: {
    bold: {
      parseDOM: [
        { tag: "strong" },
        { tag: "b" },
        { style: "font-weight=bold" },
      ],
      toDOM: () => ["strong", 0],
    },

    italic: {
      parseDOM: [
        { tag: "em" },
        { tag: "i" },
        { style: "font-style=italic" },
      ],
      toDOM: () => ["em", 0],
    },

    strike: {
      parseDOM: [{ tag: "s" }, { tag: "strike" }, { tag: "del" }],
      toDOM: () => ["s", 0],
    },

    code: {
      parseDOM: [{ tag: "code" }],
      toDOM: () => ["code", 0],
    },

    link: {
      attrs: { href: { default: null }, title: { default: null } },
      inclusive: false,
      parseDOM: [
        {
          tag: "a[href]",
          getAttrs: (node: HTMLElement | string) => {
            if (typeof node === "string") return false;
            return {
              href: node.getAttribute("href"),
              title: node.getAttribute("title"),
            };
          },
        },
      ],
      toDOM: (node) => ["a", node.attrs, 0],
    },
  },
});
