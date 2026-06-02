/**
 * tagMention — Tiptap atom inline node representing a hashtag chip.
 *
 * Two insertion paths:
 *   1) Toolbar "tag" button → opens an inline prompt (handled by toolbar).
 *   2) InputRule: typing `#word ` auto-converts the `#word` to a tag chip.
 *
 * Tag labels are normalized (lowercased, no leading `#`, alphanumeric +
 * dash/underscore). They are also mirrored back to `WorkLog.tags` by the
 * parent reader so existing tag filters keep working — see extract-tags.ts.
 */

import { Node, mergeAttributes, InputRule } from "@tiptap/core";

export interface TagMentionAttrs {
  label: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tagMention: {
      insertTag: (attrs: TagMentionAttrs) => ReturnType;
    };
  }
}

export function normalizeTagLabel(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export const TagMention = Node.create({
  name: "tag",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      label: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-tag]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-tag": "true",
        class:
          "inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded-md " +
          "bg-sky-100 text-sky-700 text-xs font-medium " +
          "dark:bg-sky-900/40 dark:text-sky-300 align-baseline",
      }),
      `#${node.attrs.label}`,
    ];
  },

  renderText({ node }) {
    return `#${node.attrs.label}`;
  },

  addCommands() {
    return {
      insertTag:
        (attrs) =>
        ({ commands }) => {
          const label = normalizeTagLabel(attrs.label);
          if (!label) return false;
          return commands.insertContent({ type: this.name, attrs: { label } });
        },
    };
  },

  // Triggered when the user types `#word ` — replaces the matched range
  // with a tag node and re-inserts a trailing space.
  addInputRules() {
    return [
      new InputRule({
        find: /(?:^|\s)(#([a-zA-Z0-9_-]{1,32}))\s$/,
        handler: ({ state, range, match, chain }) => {
          const raw = match[2];
          const label = normalizeTagLabel(raw);
          if (!label) return null;
          // `range` covers the entire match incl. the leading whitespace
          // and trailing space. We only want to replace the `#word` portion.
          const matchStart = range.from + (match[0].startsWith(" ") ? 1 : 0);
          const matchEnd = range.to - 1; // exclude trailing space
          chain()
            .focus()
            .deleteRange({ from: matchStart, to: matchEnd })
            .insertContentAt(matchStart, [
              { type: "tag", attrs: { label } },
              { type: "text", text: " " },
            ])
            .run();
          // Suppress default behavior since we manually composed the replacement.
          state.tr.setMeta("preventUpdate", false);
          return null;
        },
      }),
    ];
  },
});
