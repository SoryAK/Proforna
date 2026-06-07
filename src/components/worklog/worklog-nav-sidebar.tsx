/**
 * WorklogNavSidebar — section-nav override for the global Sidebar on `/worklog`.
 *
 * Per ADR-0013, the global sidebar swaps its top-level nav for this component
 * when `pathname.startsWith("/worklog")` and the sidebar is expanded. Collapsed
 * sidebar still shows top-level nav (an escape hatch to other top-level routes).
 *
 * Sections (top → bottom):
 *   1. Header     — back arrow + "Worklog" label
 *   2. Filters    — All notes · Notable · Templates
 *   3. Folders    — drag-droppable user folder tree (WorklogFolderTreeItems)
 *   4. Categories — collapsible, with live counts
 *
 * Folder/view selection is driven through the URL via `useFolderSelection`
 * (see hooks/use-folder-selection.ts) so this sidebar and the page render in
 * lockstep. Selecting a row calls `router.push("/worklog?folder=…")`.
 *
 * The "back" arrow toggles the global sidebar's `collapsed` state via the
 * shared `SidebarContext`, which is what causes the global sidebar to fall
 * back to its default top-level nav.
 *
 * NOT used in `<WorklogPage compact />` — that embed renders WorklogFoldersRail
 * directly because it doesn't have access to the global sidebar.
 */

"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileText, Home, Inbox, Sparkles, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORIES } from "@/components/worklog/constants";
import { WorklogFolderTreeItems } from "@/components/worklog/worklog-folder-tree-items";
import {
  useFolderSelection,
  selectionToQueryString,
} from "@/components/worklog/hooks/use-folder-selection";
import type { FolderSelection, WorkLog, Template } from "@/types/worklog";

interface NavRowProps {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  iconColorClass?: string;
  /** Dim the row visually (e.g. category with 0 entries) without disabling it. */
  dim?: boolean;
}

function NavRow({ icon, label, count, active, onClick, iconColorClass, dim }: NavRowProps) {
  return (
    <button
      type="button"
      data-rail-row
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "w-full flex items-center gap-2 rounded-md text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        "px-2 py-1.25",
        active
          ? "bg-orange-100 dark:bg-orange-900/30 text-orange-900 dark:text-orange-100"
          : "hover:bg-accent text-foreground/80 hover:text-foreground",
        !active && dim && "opacity-55",
      )}
    >
      <span className={cn("flex-shrink-0", iconColorClass)}>{icon}</span>
      <span className="truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            "ml-auto text-[11px] tabular-nums",
            active ? "text-orange-700 dark:text-orange-300" : "text-muted-foreground",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function isSelected(sel: FolderSelection, target: FolderSelection): boolean {
  if (sel.kind !== target.kind) return false;
  if (sel.kind === "category" && target.kind === "category") {
    return sel.category === target.category;
  }
  if (sel.kind === "folder" && target.kind === "folder") {
    return sel.folderId === target.folderId;
  }
  return true;
}

export interface WorklogNavSidebarProps {
  /** Swap the worklog feature nav for the global app nav while staying on
   *  the same URL (does not collapse the sidebar). */
  onShowGlobal: () => void;
}

export function WorklogNavSidebar({ onShowGlobal }: WorklogNavSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [selected, setSelected] = useFolderSelection();

  // Sub-nav rows (filters / folders / categories) navigate to `/worklog/notes`
  // even when clicked from `/worklog` (the home). The URL hook's setter is
  // bound to the current pathname, so we route explicitly here for any
  // cross-route navigation. Same-route clicks fall through to the hook.
  const onNotesRoute = pathname === "/worklog/notes";
  const navigateTo = (next: FolderSelection) => {
    if (onNotesRoute) {
      setSelected(next);
      return;
    }
    const qs = selectionToQueryString(next);
    router.push(qs ? `/worklog/notes?${qs}` : "/worklog/notes", { scroll: false });
  };

  // Live counts come from the same query keys WorklogPage's `useWorklogData`
  // hook uses; sharing the cache means this sidebar and the page render in
  // lockstep with no extra round-trips.
  const { data: logs = [] } = useQuery<WorkLog[]>({
    queryKey: ["worklogs"],
    queryFn: () => fetch("/api/work-logs").then((r) => r.json()),
    staleTime: 30_000,
  });
  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["worklog-templates"],
    queryFn: () => fetch("/api/work-logs/templates").then((r) => r.json()),
    staleTime: 60_000,
  });

  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs) {
      m.set(l.category, (m.get(l.category) ?? 0) + 1);
    }
    return m;
  }, [logs]);

  const notableCount = useMemo(() => logs.filter((l) => l.isNotable).length, [logs]);

  // Active state: filter rows are only "active" while ON /worklog/notes — the
  // home page does not represent a filter.
  const isFilterActive = (target: FolderSelection): boolean =>
    onNotesRoute && isSelected(selected, target);

  const isHomeActive = pathname === "/worklog";

  return (
    <nav
      aria-label="Worklog navigation"
      className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-3 space-y-3"
    >
      {/* Header — back arrow swaps to global app nav (Sidebar component
          owns the showGlobalNav flag). */}
      <div className="flex items-center gap-2 px-1 -mt-1">
        <button
          type="button"
          onClick={onShowGlobal}
          title="Show all sections"
          aria-label="Show all sections"
          className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <Link
          href="/worklog"
          className="flex items-center gap-1.5 text-sm font-semibold text-foreground"
        >
          <FileText className="h-4 w-4 text-orange-500" />
          Worklog
        </Link>
      </div>

      {/* Section pivot — Home / Filters */}
      <div className="space-y-0.5">
        <Link
          href="/worklog"
          aria-current={isHomeActive ? "true" : undefined}
          className={cn(
            "w-full flex items-center gap-2 rounded-md text-sm transition-colors px-2 py-1.25",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            isHomeActive
              ? "bg-orange-100 dark:bg-orange-900/30 text-orange-900 dark:text-orange-100"
              : "hover:bg-accent text-foreground/80 hover:text-foreground",
          )}
        >
          <Home className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="truncate">Home</span>
        </Link>
        <NavRow
          icon={<Inbox className="h-3.5 w-3.5" />}
          label="All notes"
          count={logs.length}
          active={isFilterActive({ kind: "all" })}
          onClick={() => navigateTo({ kind: "all" })}
        />
        <NavRow
          icon={<Star className={cn("h-3.5 w-3.5", notableCount > 0 && "text-amber-500")} />}
          label="Notable"
          count={notableCount}
          active={isFilterActive({ kind: "notable" })}
          onClick={() => navigateTo({ kind: "notable" })}
        />
        <NavRow
          icon={<Sparkles className="h-3.5 w-3.5" />}
          label="Templates"
          count={templates.length}
          active={isFilterActive({ kind: "templates" })}
          onClick={() => navigateTo({ kind: "templates" })}
        />
      </div>

      {/* Folders — full DnD-enabled tree (reused from rail) */}
      <WorklogFolderTreeItems
        selected={onNotesRoute ? selected : { kind: "all" }}
        onSelect={navigateTo}
      />

      {/* Categories */}
      <details open className="group">
        <summary className="cursor-pointer list-none flex items-center gap-1 pt-1 pb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
          <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
          Categories
        </summary>
        <div role="group" aria-label="Categories" className="space-y-0.5 mt-0.5">
          {Object.entries(CATEGORIES).map(([key, cat]) => {
            const Icon = cat.icon;
            const count = categoryCounts.get(key) ?? 0;
            return (
              <NavRow
                key={key}
                icon={<Icon className="h-3.5 w-3.5" />}
                label={cat.label}
                count={count}
                active={isFilterActive({ kind: "category", category: key })}
                onClick={() => navigateTo({ kind: "category", category: key })}
                dim={count === 0}
              />
            );
          })}
        </div>
      </details>
    </nav>
  );
}
