/**
 * SlashCommands — Tiptap extension that lets the user pop a floating menu
 * by typing `/` at the start of a block (or after whitespace inside one)
 * to insert structural content that the toolbar doesn't already cover.
 *
 * Phase 2a. Commands shipped here:
 *   /h3       — heading level 3
 *   /todo     — task list (checkbox items)
 *   /code     — code block
 *   /quote    — blockquote
 *   /divider  — horizontal rule
 *   /time     — plain-text current time (e.g. "2:34 PM")
 *   /date     — plain-text today's date (e.g. "May 22, 2026")
 *
 * The Suggestion plugin is restricted via `allow` so `/` only triggers in
 * paragraph-like blocks at block-start or immediately after whitespace —
 * typing "see /docs/" mid-sentence will NOT open the menu.
 *
 * Photos (/photo) are intentionally deferred to Phase 2b so the file picker
 * can be wired against the real upload pipeline.
 */

import { Extension, type Range } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import {
  Heading3 as Heading3Icon,
  ListChecks,
  Code2,
  Quote,
  Minus,
  Clock,
  Calendar,
  type LucideIcon,
} from "lucide-react";

export interface SlashCommandItem {
  /** Stable id for keyed React rendering. */
  id: string;
  /** Primary label shown in the menu. */
  title: string;
  /** Short subtitle/help text. */
  description: string;
  /** Lucide icon component. */
  icon: LucideIcon;
  /** Extra space-separated keywords that should match the menu filter. */
  searchTerms: string[];
  /** Run the command. Receives editor + range covering "/query" so it can be deleted. */
  run: (ctx: { editor: Editor; range: Range }) => void;
}

/** Format an absolute Date as "h:mm AM/PM" without locale surprises. */
function formatTime(d: Date): string {
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}:${m} ${period}`;
}

/** Format an absolute Date as "Month D, YYYY". */
function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Canonical command list. Order is the visible order in the menu when no
 * filter is applied. Insertion logic deletes the "/query" trigger first via
 * `chain().focus().deleteRange(range)` before running the block command.
 */
export const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    id: "h3",
    title: "Heading 3",
    description: "Smaller section header",
    icon: Heading3Icon,
    searchTerms: ["heading", "h3", "title", "header", "sub"],
    run: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 3 })
        .run();
    },
  },
  {
    id: "todo",
    title: "Task list",
    description: "Checklist of action items",
    icon: ListChecks,
    searchTerms: ["todo", "task", "checklist", "checkbox", "tasks", "to-do"],
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    id: "code",
    title: "Code block",
    description: "Monospaced block for PLC names, recipes, error codes",
    icon: Code2,
    searchTerms: ["code", "snippet", "monospace", "pre"],
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setCodeBlock().run();
    },
  },
  {
    id: "quote",
    title: "Quote",
    description: "Capture what someone said",
    icon: Quote,
    searchTerms: ["quote", "blockquote", "callout", "cite"],
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setBlockquote().run();
    },
  },
  {
    id: "divider",
    title: "Divider",
    description: "Horizontal rule to separate sub-events",
    icon: Minus,
    searchTerms: ["divider", "hr", "rule", "separator", "line"],
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    id: "time",
    title: "Current time",
    description: "Insert the current time as plain text",
    icon: Clock,
    searchTerms: ["time", "now", "stamp", "clock"],
    run: ({ editor, range }) => {
      const text = formatTime(new Date());
      editor.chain().focus().deleteRange(range).insertContent(text).run();
    },
  },
  {
    id: "date",
    title: "Today's date",
    description: "Insert today's date as plain text",
    icon: Calendar,
    searchTerms: ["date", "today", "day"],
    run: ({ editor, range }) => {
      const text = formatDate(new Date());
      editor.chain().focus().deleteRange(range).insertContent(text).run();
    },
  },
];

/**
 * Filter commands by a free-form query. Matches against title + searchTerms.
 * Results are ranked so that prefix matches surface first, then substring
 * matches, with title hits beating searchTerm hits within each tier:
 *
 *   0. title starts with query        (e.g. "/h"  -> Heading 3)
 *   1. title contains query           (e.g. "/ad" -> ... )
 *   2. searchTerm starts with query   (e.g. "/check" -> Task list)
 *   3. searchTerm contains query
 *
 * Original array order is the tie-breaker (stable sort), so the curated
 * order in SLASH_COMMANDS still acts as a soft preference.
 */
export function filterSlashCommands(query: string, items: SlashCommandItem[] = SLASH_COMMANDS): SlashCommandItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const scored: { item: SlashCommandItem; score: number; idx: number }[] = [];
  items.forEach((item, idx) => {
    const title = item.title.toLowerCase();
    let score = -1;
    if (title.startsWith(q)) score = 0;
    else if (title.includes(q)) score = 1;
    else if (item.searchTerms.some((t) => t.toLowerCase().startsWith(q))) score = 2;
    else if (item.searchTerms.some((t) => t.toLowerCase().includes(q))) score = 3;
    if (score >= 0) scored.push({ item, score, idx });
  });
  scored.sort((a, b) => a.score - b.score || a.idx - b.idx);
  return scored.map((s) => s.item);
}

/**
 * Build the Tiptap Extension. The `render` factory is supplied by the
 * component layer so this file stays React-free at the editor boundary.
 */
export interface SlashCommandsOptions {
  /** Provides the menu UI lifecycle (start/update/keydown/exit). */
  render: SuggestionOptions<SlashCommandItem>["render"];
  /**
   * Optional override of the visible command set. Defaults to SLASH_COMMANDS.
   * The editor uses this to inject dynamic commands like `/photo` whose
   * `run` closes over the active workLogId and a file-picker callback.
   */
  items?: SlashCommandItem[];
}

export const SlashCommands = Extension.create<SlashCommandsOptions>({
  name: "slashCommands",

  addOptions() {
    return {
      // Default render is a no-op so the extension is safe to instantiate
      // headlessly (tests). The editor wiring always provides a real render.
      render: () => ({
        onStart: () => undefined,
        onUpdate: () => undefined,
        onKeyDown: () => false,
        onExit: () => undefined,
      }),
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashCommandItem>({
        editor: this.editor,
        char: "/",
        startOfLine: false, // we enforce position via `allow` for finer control
        allowSpaces: false,
        allow: ({ editor, range }) => {
          // Only allow inside paragraph-like blocks (not code blocks, not in
          // shift/mood/tag atoms). And only at block start or right after
          // whitespace — typing "/" mid-word ("see/docs") should not trigger.
          const $from = editor.state.doc.resolve(range.from);
          const parentName = $from.parent.type.name;
          if (parentName === "codeBlock") return false;
          if (parentName !== "paragraph" && parentName !== "heading") return false;
          if ($from.parentOffset === 0) return true;
          // `range.from` is the position of "/". Look at the char before it.
          const before = editor.state.doc.textBetween(range.from - 1, range.from, "\n", "\n");
          return /\s/.test(before);
        },
        command: ({ editor, range, props }) => {
          props.run({ editor: editor as Editor, range });
        },
        items: ({ query }) => filterSlashCommands(query, this.options.items ?? SLASH_COMMANDS),
        // `render` is itself a factory — the Suggestion plugin invokes it
        // once at plugin init to get the lifecycle object. We pass through
        // whatever the consumer supplied via options.
        render: this.options.render,
      }),
    ];
  },
});
