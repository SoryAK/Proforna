/**
 * MentionNode — Tiptap inline atom for @entity mentions inside worklog notes.
 *
 * Supports four entity types via scoped prefix UX:
 *   @a: → Asset (JobAsset)
 *   @s: → Skill (SkillNode)
 *   @c: → Company (WorkHistory)
 *   @p: → Person (Contact)
 *
 * Typing `@` alone shows a type-hint popup; once a prefix is typed the
 * popup switches to live entity search against /api/work-logs/mention-search.
 *
 * The node stores { entityType, entityId, label } — label is captured at
 * insertion time so the chip renders without a network call. Orphan detection
 * (broken chip styling) is handled in MentionNodeView at edit time.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import type { SuggestionOptions } from "@tiptap/suggestion";
import { PluginKey } from "prosemirror-state";
import { MentionNodeView } from "@/components/worklog/mention-node-view";
import { MentionSuggestionPopup } from "@/components/worklog/mention-suggestion-popup";

// ── Entity type definitions ──────────────────────────────────────────────────

export type MentionEntityType = "asset" | "skill" | "company" | "contact";

export interface MentionNodeAttrs {
  entityType: MentionEntityType;
  entityId: string;
  label: string;
}

/** Visual config for each entity type — used in both node view and popup. */
export const ENTITY_TYPE_CONFIG: Record<
  MentionEntityType,
  { badge: string; typeLabel: string; color: string }
> = {
  asset: { badge: "A", typeLabel: "Asset", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  skill: { badge: "S", typeLabel: "Skill", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  company: { badge: "C", typeLabel: "Company", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  contact: { badge: "P", typeLabel: "Person", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300" },
};

// ── Suggestion item types ────────────────────────────────────────────────────

export type MentionTypePicker = {
  kind: "type-picker";
  prefix: string;
  entityType: MentionEntityType;
  typeLabel: string;
};

export type MentionEntityItem = {
  kind: "entity";
  entityType: MentionEntityType;
  entityId: string;
  label: string;
  meta?: string;
};

export type MentionSuggestionItem = MentionTypePicker | MentionEntityItem;

const PREFIX_MAP: Record<string, MentionEntityType> = {
  a: "asset",
  s: "skill",
  c: "company",
  p: "contact",
};

const TYPE_PICKER_ITEMS: MentionTypePicker[] = [
  { kind: "type-picker", prefix: "a", entityType: "asset", typeLabel: "Asset" },
  { kind: "type-picker", prefix: "s", entityType: "skill", typeLabel: "Skill" },
  { kind: "type-picker", prefix: "c", entityType: "company", typeLabel: "Company" },
  { kind: "type-picker", prefix: "p", entityType: "contact", typeLabel: "Person" },
];

// ── Tiptap command augmentation ──────────────────────────────────────────────

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mention: {
      insertMention: (attrs: MentionNodeAttrs) => ReturnType;
    };
  }
}

// ── Suggestion configuration ─────────────────────────────────────────────────

const mentionSuggestion: Partial<SuggestionOptions<MentionSuggestionItem>> = {
  char: "@",
  allowSpaces: false,
  startOfLine: false,
  // Allow `@a:some query` with alphanumeric + colon + spaces
  allow: ({ state, range }) => {
    const $from = state.doc.resolve(range.from);
    const type = state.schema.nodes.mention;
    if (!type) return false;
    return !!$from.parent.type.spec.content;
  },

  async items({ query }) {
    // No prefix yet — show type picker
    const prefixMatch = /^([ascp]):(.*)$/.exec(query);
    if (!prefixMatch) {
      return TYPE_PICKER_ITEMS;
    }

    const [, prefix, search] = prefixMatch;
    const entityType = PREFIX_MAP[prefix];
    if (!entityType) return [];

    try {
      const params = new URLSearchParams({ type: entityType, q: search.trim() });
      const res = await fetch(`/api/work-logs/mention-search?${params.toString()}`);
      if (!res.ok) return [];
      const data = (await res.json()) as Array<{ id: string; label: string; meta?: string }>;
      return data.map(
        (item): MentionEntityItem => ({
          kind: "entity",
          entityType,
          entityId: item.id,
          label: item.label,
          meta: item.meta,
        }),
      );
    } catch {
      return [];
    }
  },

  command({ editor, range, props }) {
    if (props.kind === "type-picker") {
      // Replace the trigger with the scoped prefix so the suggestion re-fires.
      editor.chain().focus().deleteRange(range).insertContent(`@${props.prefix}:`).run();
      return;
    }
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent({
        type: "mention",
        attrs: {
          entityType: props.entityType,
          entityId: props.entityId,
          label: props.label,
        } satisfies MentionNodeAttrs,
      })
      .run();
    // Insert a space so the cursor clears the atom.
    editor.commands.insertContent(" ");
  },

  render() {
    let component: ReactRenderer<{ onKeyDown: (e: KeyboardEvent) => boolean }>;

    return {
      onStart(props) {
        component = new ReactRenderer(MentionSuggestionPopup, {
          props,
          editor: props.editor,
        });
        if (component.element) {
          document.body.appendChild(component.element);
        }
      },

      onUpdate(props) {
        component.updateProps(props);
      },

      onKeyDown({ event }) {
        if (event.key === "Escape") {
          component.destroy();
          component.element?.remove();
          return true;
        }
        return component.ref?.onKeyDown(event) ?? false;
      },

      onExit() {
        component.destroy();
        component.element?.remove();
      },
    };
  },
};

// ── Node definition ──────────────────────────────────────────────────────────

export const MentionNode = Node.create({
  name: "mention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      entityType: { default: "asset" },
      entityId: { default: "" },
      label: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-mention]",
        getAttrs: (el) => {
          if (!(el instanceof HTMLElement)) return false;
          return {
            entityType: el.getAttribute("data-entity-type") ?? "asset",
            entityId: el.getAttribute("data-entity-id") ?? "",
            label: el.getAttribute("data-label") ?? el.textContent ?? "",
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { entityType, entityId, label } = node.attrs as MentionNodeAttrs;
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-mention": "true",
        "data-entity-type": entityType,
        "data-entity-id": entityId,
        "data-label": label,
        class: "mention-chip",
      }),
      `@${label}`,
    ];
  },

  renderText({ node }) {
    return `@${(node.attrs as MentionNodeAttrs).label}`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(MentionNodeView);
  },

  addCommands() {
    return {
      insertMention:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey("mentionSuggestion"),
        ...mentionSuggestion,
      }),
    ];
  },
});
