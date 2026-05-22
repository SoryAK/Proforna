/**
 * moodBlock — Tiptap atom inline node representing a mood marker. Multiple
 * mood blocks per worklog are allowed (one per moment of the day).
 *
 * Pure node definition. Insertion is exposed via the editor toolbar.
 */

import { Node, mergeAttributes } from "@tiptap/core";

export type MoodValue = "good" | "neutral" | "tough";

export interface MoodBlockAttrs {
  value: MoodValue;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    moodBlock: {
      insertMoodBlock: (attrs: MoodBlockAttrs) => ReturnType;
    };
  }
}

const MOOD_META: Record<MoodValue, { label: string; emoji: string; classes: string }> = {
  good:    { label: "Good",  emoji: "🙂", classes: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  neutral: { label: "OK",    emoji: "😐", classes: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  tough:   { label: "Tough", emoji: "😣", classes: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
};

function metaFor(value: unknown) {
  return MOOD_META[value as MoodValue] ?? MOOD_META.neutral;
}

export const MoodBlock = Node.create({
  name: "moodBlock",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      value: { default: "neutral" as MoodValue },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-mood-block]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const meta = metaFor(node.attrs.value);
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-mood-block": "true",
        "data-mood-value": node.attrs.value,
        class:
          "inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md " +
          "text-xs font-medium align-baseline " + meta.classes,
      }),
      `${meta.emoji} ${meta.label}`,
    ];
  },

  renderText({ node }) {
    return `[Mood: ${metaFor(node.attrs.value).label}]`;
  },

  addCommands() {
    return {
      insertMoodBlock:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});
