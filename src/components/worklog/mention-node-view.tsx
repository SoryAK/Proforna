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
 *
 * ADR-0016: clicking a worklog (@n:) mention pivots the page to the
 * referenced note via the `?focus=<entityId>` contract from ADR-0015.
 */

import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  ENTITY_TYPE_CONFIG,
  type MentionNodeAttrs,
} from "@/lib/worklog/tiptap/mention-node";

export function MentionNodeView({ node, selected }: NodeViewProps) {
  const { entityType, entityId, label } = node.attrs as MentionNodeAttrs;
  const config = ENTITY_TYPE_CONFIG[entityType] ?? ENTITY_TYPE_CONFIG.asset;
  const router = useRouter();
  const pathname = usePathname();

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
  const isWorklog = entityType === "worklog" && Boolean(entityId);

  const handleClick = (e: React.MouseEvent<HTMLSpanElement>) => {
    if (!isWorklog) return;
    e.preventDefault();
    e.stopPropagation();
    router.replace(`${pathname}?focus=${entityId}`);
  };

  return (
    <NodeViewWrapper
      as="span"
      onClick={handleClick}
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 mx-0.5 align-middle",
        "select-none text-xs font-medium",
        isWorklog ? "cursor-pointer hover:underline" : "cursor-default",
        config.color,
        selected && "ring-2 ring-ring ring-offset-1",
        broken && "opacity-50 line-through decoration-red-400",
      )}
      title={isWorklog ? `Open note: ${label}` : undefined}
    >
      <span className="font-bold opacity-70">{config.badge}</span>
      <span>{label}</span>
    </NodeViewWrapper>
  );
}
