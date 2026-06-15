/**
 * WorklogEventsView — sibling surface to `/worklog/notes` for CareerEvents
 * (ADR-0027 Day 3 Cycle B).
 *
 * Layout (single column, no inline 3-pane — Griller Q3=A picked modal):
 *   Header (icon + title + subtitle)
 *   Stat cards (Total / Anchored / Free-floating)  ─ also act as filter chips
 *   FilterChips row                                ─ All · Anchored · Free-floating
 *   List of <EventRow> grouped by year
 *     ↓ click row → <EventEditDialog>
 *                   └─ Delete button → <EventDeleteConfirm>
 *   Banner footer explaining where to CREATE events (anchored = career-map;
 *   free-floating creation parked per Griller Q1=A).
 *
 * Filter state is URL-driven (?scope=all|anchored|floating) so the list
 * is shareable + back-button-friendly. Default = all.
 *
 * The shared query key `["career-events", "all"]` is reused from Cycle A;
 * the sidebar Events badge re-reads the same cache so it stays in sync
 * after every PATCH/DELETE invalidation.
 */

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, MapPin, Anchor } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { EventRow, type EventRowItem } from "./events/event-row";
import {
  EventEditDialog,
  type EditableEvent,
} from "./events/event-edit-dialog";
import { EventDeleteConfirm } from "./events/event-delete-confirm";

// Shape returned by GET /api/events (full row). Local to this file —
// when a Cycle C needs to share it, lift to types/worklog.ts.
interface CareerEventApiRow {
  id: string;
  workHistoryId: string | null;
  title: string;
  description: string | null;
  category: string;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
  metrics: string | null;
  createdAt: string;
  updatedAt: string;
}

type Scope = "all" | "anchored" | "floating";

function isScope(v: string | null): v is Scope {
  return v === "all" || v === "anchored" || v === "floating";
}

export function WorklogEventsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scopeParam = searchParams.get("scope");
  const scope: Scope = isScope(scopeParam) ? scopeParam : "all";

  const { data: events = [], isPending, isError, refetch } = useQuery<CareerEventApiRow[]>({
    queryKey: ["career-events", "all"],
    queryFn: () => fetch("/api/events").then((r) => r.json()),
    staleTime: 30_000,
  });

  const total = events.length;
  const floating = events.filter((e) => e.workHistoryId === null).length;
  const anchored = total - floating;

  const filtered = useMemo(() => {
    const byScope = events.filter((e) => {
      if (scope === "floating") return e.workHistoryId === null;
      if (scope === "anchored") return e.workHistoryId !== null;
      return true;
    });
    // Sort: most recent startDate first; rows without a startDate fall
    // back to createdAt so they don't all clump at the bottom.
    return [...byScope].sort((a, b) => {
      const aT = a.startDate ?? a.createdAt;
      const bT = b.startDate ?? b.createdAt;
      return new Date(bT).getTime() - new Date(aT).getTime();
    });
  }, [events, scope]);

  // Group by year for date-skim affordance.
  const grouped = useMemo(() => groupByYear(filtered), [filtered]);

  // ── Dialog state ──────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const selected = useMemo(
    () => (selectedId ? events.find((e) => e.id === selectedId) ?? null : null),
    [events, selectedId],
  );

  const openEdit = (id: string) => {
    setSelectedId(id);
    setEditOpen(true);
  };

  const setScope = (next: Scope) => {
    const sp = new URLSearchParams(Array.from(searchParams.entries()));
    if (next === "all") {
      sp.delete("scope");
    } else {
      sp.set("scope", next);
    }
    const qs = sp.toString();
    router.replace(qs ? `/worklog/events?${qs}` : "/worklog/events", {
      scroll: false,
    });
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Header */}
        <header className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
            <CalendarDays className="h-5 w-5 text-orange-600 dark:text-orange-300" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-foreground">Events</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Conferences, field days, social moments, news events — anchored to a job or free-floating in your life.
            </p>
          </div>
        </header>

        {/* Stat cards — also act as the primary scope toggle on small viewports */}
        <section
          aria-label="Event totals"
          className="grid grid-cols-1 sm:grid-cols-3 gap-3"
        >
          <StatCard
            label="Total"
            value={total}
            icon={<CalendarDays className="h-4 w-4" />}
            isPending={isPending}
            active={scope === "all"}
            onClick={() => setScope("all")}
          />
          <StatCard
            label="Anchored"
            value={anchored}
            icon={<Anchor className="h-4 w-4" />}
            isPending={isPending}
            hint="Tied to a work history"
            active={scope === "anchored"}
            onClick={() => setScope("anchored")}
          />
          <StatCard
            label="Free-floating"
            value={floating}
            icon={<MapPin className="h-4 w-4" />}
            isPending={isPending}
            hint="Standalone, requires a location"
            active={scope === "floating"}
            onClick={() => setScope("floating")}
          />
        </section>

        {/* Filter chip row (mirrors stat cards but inline + persistent above the list) */}
        <div className="flex items-center gap-2 text-xs">
          <FilterChip label="All" active={scope === "all"} onClick={() => setScope("all")} count={total} />
          <FilterChip label="Anchored" active={scope === "anchored"} onClick={() => setScope("anchored")} count={anchored} />
          <FilterChip label="Free-floating" active={scope === "floating"} onClick={() => setScope("floating")} count={floating} />
          <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
            {isPending ? "—" : `${filtered.length} shown`}
          </span>
        </div>

        {/* Body */}
        {isError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            Couldn&apos;t load events.{" "}
            <button
              type="button"
              onClick={() => refetch()}
              className="underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        ) : isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState scope={scope} totalAll={total} />
        ) : (
          <section className="space-y-6">
            {grouped.map(({ year, rows }) => (
              <div key={year} className="space-y-1">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
                  {year}
                </h2>
                <ul className="space-y-1" role="list">
                  {rows.map((row) => (
                    <li key={row.id}>
                      <EventRow event={toRowItem(row)} onClick={() => openEdit(row.id)} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}

        {/* Creation guidance footer — Cycle B does not ship "Add event" (Q1=A) */}
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-[11px] text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Add a new event:</strong>{" "}
          Anchored events are created from{" "}
          <Link href="/career-map" className="underline hover:text-foreground">
            the career map
          </Link>{" "}
          (pick a job → add event). A standalone &ldquo;Add free-floating event&rdquo;
          flow with location picker is planned in a future ADR.
        </div>
      </div>

      {/* Dialogs */}
      <EventEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        event={selected ? toEditable(selected) : null}
        onRequestDelete={() => {
          // Close edit first so the delete confirm owns focus cleanly.
          setEditOpen(false);
          // queueMicrotask so the close animation starts before the
          // confirm opens — feels less like two modals racing.
          queueMicrotask(() => setDeleteOpen(true));
        }}
      />
      <EventDeleteConfirm
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        event={selected}
        onDeleted={() => {
          setSelectedId(null);
          setEditOpen(false);
        }}
      />
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  isPending: boolean;
  hint?: string;
  active?: boolean;
  onClick?: () => void;
}

function StatCard({ label, value, icon, isPending, hint, active, onClick }: StatCardProps) {
  const Component = onClick ? "button" : "div";
  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "rounded-lg border p-3 text-left transition-colors",
        active
          ? "border-orange-500/60 bg-orange-500/5 ring-1 ring-orange-500/20"
          : "border-border bg-card hover:border-border/80",
        onClick && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
      aria-pressed={onClick ? !!active : undefined}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className={cn(active ? "text-orange-600 dark:text-orange-300" : "text-orange-500")}>
          {icon}
        </span>
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        {isPending ? <Skeleton className="h-7 w-12" /> : value}
      </div>
      {hint && (
        <div className="mt-1 text-[11px] text-muted-foreground leading-snug">
          {hint}
        </div>
      )}
    </Component>
  );
}

interface FilterChipProps {
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
}

function FilterChip({ label, active, count, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-orange-500/15 text-orange-700 dark:text-orange-300"
          : "bg-muted/50 text-muted-foreground hover:bg-muted/80",
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "tabular-nums text-[10px]",
          active ? "opacity-80" : "opacity-60",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function EmptyState({ scope, totalAll }: { scope: Scope; totalAll: number }) {
  if (totalAll === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center space-y-2">
        <p className="text-sm font-medium text-foreground">No events yet.</p>
        <p className="text-xs text-muted-foreground">
          Events show up here once you create them from a job&apos;s timeline.
        </p>
        <p className="text-[11px] text-muted-foreground pt-2">
          Tip: anchored events live on{" "}
          <Link href="/career-map" className="underline hover:text-foreground">
            the career map
          </Link>{" "}
          per job.
        </p>
      </div>
    );
  }
  const scopeLabel =
    scope === "anchored" ? "anchored" : scope === "floating" ? "free-floating" : "matching";
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
      <p className="text-sm text-muted-foreground">
        No {scopeLabel} events. You have {totalAll} total — switch the filter to see them.
      </p>
    </div>
  );
}

// ─── Pure helpers ────────────────────────────────────────────────────

function toRowItem(api: CareerEventApiRow): EventRowItem {
  return {
    id: api.id,
    workHistoryId: api.workHistoryId,
    title: api.title,
    category: api.category,
    startDate: api.startDate,
    location: api.location,
  };
}

function toEditable(api: CareerEventApiRow): EditableEvent {
  return {
    id: api.id,
    workHistoryId: api.workHistoryId,
    title: api.title,
    description: api.description,
    category: api.category,
    startDate: api.startDate,
    endDate: api.endDate,
    location: api.location,
    metrics: api.metrics,
  };
}

function groupByYear(rows: CareerEventApiRow[]): Array<{ year: string; rows: CareerEventApiRow[] }> {
  const map = new Map<string, CareerEventApiRow[]>();
  for (const r of rows) {
    const iso = r.startDate ?? r.createdAt;
    const year = String(new Date(iso).getFullYear());
    const bucket = map.get(year);
    if (bucket) bucket.push(r);
    else map.set(year, [r]);
  }
  // Map preserves insertion order which already matches our sort
  // (newest first), so years naturally appear newest-first too.
  return Array.from(map.entries()).map(([year, rows]) => ({ year, rows }));
}
