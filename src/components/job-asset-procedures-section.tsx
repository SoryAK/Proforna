"use client";

/**
 * JobAssetProceduresSection — collapsible cross-cut section listing every
 * runbook (WorkLog kind="procedure") that has this asset id in its assetIds[].
 *
 * Mounted inside the AssetDetailModal right column (ADR-0029 Unit 8). Click a
 * row → navigate to /worklog/notes/[id] to read/edit the procedure.
 *
 * Lazy: collapsed by default and `enabled` is bound to the open flag so we
 * don't fire the network call until the operator actually expands the panel.
 * Reasonable staleTime keeps it warm while the modal is open without thrashing.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ChevronDown, ChevronRight, ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ProcedureRow = {
  id: string;
  label: string;
  date: string;
  positionId: string | null;
};

export function JobAssetProceduresSection({
  assetId,
  className,
}: {
  assetId: string;
  className?: string;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery<ProcedureRow[]>({
    queryKey: ["job-asset-procedures", assetId],
    queryFn: async () => {
      const res = await fetch(
        `/api/job-assets/${encodeURIComponent(assetId)}/procedures`,
      );
      if (!res.ok) throw new Error("Failed to load procedures");
      return res.json();
    },
    enabled: expanded && !!assetId,
    staleTime: 30_000,
  });

  const count = data?.length ?? 0;

  return (
    <div className={cn("space-y-2", className)}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-muted/50"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Procedures</span>
        {expanded && count > 0 && (
          <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px]">
            {count}
          </Badge>
        )}
      </button>

      {expanded && (
        <div className="pl-6">
          {isLoading && (
            <div className="text-xs text-muted-foreground">
              Loading procedures…
            </div>
          )}
          {isError && (
            <div className="flex items-center gap-2 text-xs text-rose-500">
              Failed to load.
              <button
                type="button"
                onClick={() => refetch()}
                className="underline hover:text-rose-600"
              >
                Retry
              </button>
            </div>
          )}
          {!isLoading && !isError && count === 0 && (
            <div className="text-xs text-muted-foreground">
              No procedures linked to this asset yet. Mention this asset in a
              runbook (<code className="font-mono">@a:</code>) to see it here.
            </div>
          )}
          {!isLoading && !isError && count > 0 && (
            <ul className="space-y-1">
              {data!.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/worklog/notes/${p.id}`)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted/50"
                  >
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-rose-100 text-[10px] font-semibold text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
                      R
                    </span>
                    <span className="flex-1 truncate text-xs">{p.label}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {format(parseISO(p.date), "MMM d, yyyy")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
