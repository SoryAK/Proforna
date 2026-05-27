"use client";

/**
 * MentionNodeView — React NodeView for the `mention` Tiptap inline atom
 * in editor (edit) mode.
 *
 * Renders a compact chip: [ TypeBadge | label ].
 *
 * Orphan detection: on mount, fires a lightweight GET to
 * /api/work-logs/mention-search?type=X&id=Y. If the entity is not found,
 * applies broken-chip styling (muted + strikethrough). Results are cached
 * by React Query (staleTime 5 min) so a note with many mentions of the same
 * entity only makes one network request per session.
 */

import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  ENTITY_TYPE_CONFIG,
  type MentionNodeAttrs,
} from "@/lib/worklog/tiptap/mention-node";

export function MentionNodeView({ node, selected }: NodeViewProps) {
  const { entityType, entityId, label } = node.attrs as MentionNodeAttrs;
  const config = ENTITY_TYPE_CONFIG[entityType] ?? ENTITY_TYPE_CONFIG.asset;

  const { data: existsData } = useQuery({
    queryKey: ["mention-exists", entityType, entityId] as const,
    queryFn: async () => {
      const params = new URLSearchParams({ type: entityType, id: entityId });
      const res = await fetch(`/api/work-logs/mention-search?${params.toString()}`);
      if (!res.ok) return false;
      const items = (await res.json()) as Array<{ id: string }>;
      return items.length > 0;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
    // Only check once an entityId is present.
    enabled: Boolean(entityId),
  });

  // `undefined` = still loading (don't show broken yet); `false` = confirmed missing.
  const broken = existsData === false;

  return (
    <NodeViewWrapper
      as="span"
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 mx-0.5 align-middle",
        "cursor-default select-none text-xs font-medium",
        config.color,
        selected && "ring-2 ring-ring ring-offset-1",
        broken && "opacity-50 line-through decoration-red-400",
      )}
    >
      <span className="font-bold opacity-70">{config.badge}</span>
      <span>{label}</span>
    </NodeViewWrapper>
  );
}
