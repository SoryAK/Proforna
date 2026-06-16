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
import { CalendarDays, ChevronLeft, ClipboardList, FileText, Home, Inbox, Sparkles, Star, Archive } from "lucide-react";
import { cn } from "@/lib/utils";
import { WorklogFolderTreeItems } from "@/components/worklog/worklog-folder-tree-items";
import { WorklogCategoryRows } from "@/components/worklog/worklog-category-rows";
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
        "w-full flex items-center gap-3 rounded-lg text-base font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        "px-3 py-2.5",
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
    // Match useWorklogData — fetch both buckets so cached `logs.length`
    // counts ("All notes") and the archived count stay coherent.
    queryFn: () => fetch("/api/work-logs?archived=all").then((r) => r.json()),
    staleTime: 30_000,
  });
  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["worklog-templates"],
    queryFn: () => fetch("/api/work-logs/templates").then((r) => r.json()),
    staleTime: 60_000,
  });

  // ADR-0027 Day 3 — Events sibling surface. Total = anchored + free-floating.
  // Shape: minimal — only `id` is read here. Same queryKey is reused by
  // <WorklogEventsView> so the page + sidebar share cache (one fetch).
  const { data: events = [] } = useQuery<Array<{ id: string }>>({
    queryKey: ["career-events", "all"],
    queryFn: () => fetch("/api/events").then((r) => r.json()),
    staleTime: 30_000,
  });
  const eventsCount = events.length;
  const eventsActive = pathname === "/worklog/events";

  // ADR-0029 — Procedures sibling surface. Same shape pattern as Events:
  // a separate query so the kind-filter discriminator stays explicit, and
  // the sidebar count + page list share `["worklogs", "procedures"]`.
  const { data: procedures = [] } = useQuery<Array<{ id: string }>>({
    queryKey: ["worklogs", "procedures"],
    queryFn: () =>
      fetch("/api/work-logs?archived=all&kind=procedure").then((r) => r.json()),
    staleTime: 30_000,
  });
  const proceduresCount = procedures.length;
  const proceduresActive = pathname === "/worklog/procedures";

  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs) {
      m.set(l.category, (m.get(l.category) ?? 0) + 1);
    }
    return m;
  }, [logs]);

  const notableCount = useMemo(() => logs.filter((l) => l.isNotable).length, [logs]);
  // ADR-0026 — archived bucket count (Gmail-style sidebar row).
  const archivedCount = useMemo(
    () => logs.filter((l) => l.archivedAt != null).length,
    [logs],
  );
  // "All notes" / "Notable" / category rows count NON-archived rows only,
  // matching the views they navigate to.
  const inboxCount = useMemo(() => logs.filter((l) => l.archivedAt == null).length, [logs]);

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
            "w-full flex items-center gap-3 rounded-lg text-base font-medium transition-colors px-3 py-2.5",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            isHomeActive
              ? "bg-orange-100 dark:bg-orange-900/30 text-orange-900 dark:text-orange-100"
              : "hover:bg-accent text-foreground/80 hover:text-foreground",
          )}
        >
          <Home className="h-5 w-5 flex-shrink-0" />
          <span className="truncate">Home</span>
        </Link>
        <NavRow
          icon={<Inbox className="h-5 w-5" />}
          label="All notes"
          count={inboxCount}
          active={isFilterActive({ kind: "all" })}
          onClick={() => navigateTo({ kind: "all" })}
        />
        {/* ADR-0027 Day 3 — Events sibling surface. NOT a filter of
            /worklog/notes — opens its own route /worklog/events. The
            `border.divider-top` (tokens.md) sits ABOVE the row to signal
            "different destination, not a filter on the current page."
            Sits directly under "All notes" per the user's spatial intent;
            the Archived/Notable/Templates filter cluster follows below. */}
        <Link
          href="/worklog/events"
          data-rail-row
          aria-current={eventsActive ? "true" : undefined}
          className={cn(
            "w-full flex items-center gap-3 rounded-lg text-base font-medium transition-colors px-3 py-2.5",
            "border-t border-border/60 mt-1 pt-3",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            eventsActive
              ? "bg-orange-100 dark:bg-orange-900/30 text-orange-900 dark:text-orange-100"
              : "hover:bg-accent text-foreground/80 hover:text-foreground",
          )}
        >
          <CalendarDays className="h-5 w-5 flex-shrink-0" />
          <span className="truncate">Events</span>
          {eventsCount > 0 && (
            <span
              className={cn(
                "ml-auto text-[11px] tabular-nums",
                eventsActive
                  ? "text-orange-700 dark:text-orange-300"
                  : "text-muted-foreground",
              )}
            >
              {eventsCount}
            </span>
          )}
        </Link>
        {/* ADR-0029 — Procedures sibling surface. Sits directly under Events,
            inside the same "different destination" cluster (no divider needed
            here — Events row already drew the boundary above). */}
        <Link
          href="/worklog/procedures"
          data-rail-row
          aria-current={proceduresActive ? "true" : undefined}
          className={cn(
            "w-full flex items-center gap-3 rounded-lg text-base font-medium transition-colors px-3 py-2.5",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            proceduresActive
              ? "bg-orange-100 dark:bg-orange-900/30 text-orange-900 dark:text-orange-100"
              : "hover:bg-accent text-foreground/80 hover:text-foreground",
          )}
        >
          <ClipboardList className="h-5 w-5 flex-shrink-0" />
          <span className="truncate">Procedures</span>
          {proceduresCount > 0 && (
            <span
              className={cn(
                "ml-auto text-[11px] tabular-nums",
                proceduresActive
                  ? "text-orange-700 dark:text-orange-300"
                  : "text-muted-foreground",
              )}
            >
              {proceduresCount}
            </span>
          )}
        </Link>
        {/* ADR-0026 — Gmail-style Archived bucket. Originally pinned directly
            under "All notes"; per ADR-0027 Day 3 the Events sibling row sits
            between them, so Archived now anchors the *filter* cluster below
            the Events divider. */}
        <NavRow
          icon={<Archive className="h-5 w-5" />}
          label="Archived"
          count={archivedCount}
          active={isFilterActive({ kind: "archived" })}
          onClick={() => navigateTo({ kind: "archived" })}
          dim={archivedCount === 0}
        />
        <NavRow
          icon={<Star className={cn("h-5 w-5", notableCount > 0 && "text-amber-500")} />}
          label="Notable"
          count={notableCount}
          active={isFilterActive({ kind: "notable" })}
          onClick={() => navigateTo({ kind: "notable" })}
        />
        <NavRow
          icon={<Sparkles className="h-5 w-5" />}
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
      <WorklogCategoryRows
        size="md"
        selected={onNotesRoute ? selected : { kind: "all" }}
        onSelect={navigateTo}
        categoryCounts={categoryCounts}
        defaultOpen
      />
    </nav>
  );
}
