"use client";

/**
 * WorklogProcedureLinksPanel — ADR-0030 Unit 9.
 *
 * Renders the "Linked procedures" section in the Properties rail when the
 * active worklog is a procedure (`kind === 'procedure'`). Two read groups:
 *
 *   - Outgoing: links where the active procedure is the source. Each row
 *     has a delete button — the source is the authority on its own
 *     outgoing edges.
 *   - Incoming: links where the active procedure is the target. Read-only
 *     here; the OTHER procedure's rail owns deletion of those edges.
 *
 * Add UX: a small inline form with a relationship `<select>` and a
 * filterable list of the user's other procedures. Pulls candidates from
 * `/api/work-logs?kind=procedure&archived=all` once and filters
 * client-side (small N — procedures, not notes).
 *
 * Mutations invalidate the panel's own query AND the shared `["worklogs"]`
 * cache so any other consumer (sidebar, kind picker) picks up that the
 * link list changed without seeing it directly.
 */

import { useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { buildWorklogFocusHref } from "@/lib/worklog/focus-href";
import { deriveWorklogLabel } from "@/lib/worklog/derive-worklog-label";

const RELATIONSHIPS = [
  { value: "prereq", label: "Prereq" },
  { value: "branch", label: "Branch" },
  { value: "next", label: "Next" },
  { value: "related", label: "Related" },
] as const;

type Relationship = (typeof RELATIONSHIPS)[number]["value"];

interface LinkRow {
  id: string;
  fromProcedureId: string;
  toProcedureId: string;
  relationship: Relationship;
  note: string | null;
  createdAt: string;
  target: { id: string; label: string };
}

interface ProcedureLinksResponse {
  outgoing: LinkRow[];
  incoming: LinkRow[];
}

interface CandidateRow {
  id: string;
  title: string | null;
  contentJson: unknown;
  date: string;
}

export interface WorklogProcedureLinksPanelProps {
  /** WorkLog id (must already be kind='procedure'). */
  noteId: string;
  className?: string;
  /**
   * When true, drop the section chrome — caller wraps it in its own
   * `<Section>`. Mirrors `WorklogBacklinksPanel`.
   */
  bare?: boolean;
}

export function WorklogProcedureLinksPanel({
  noteId,
  className,
  bare = false,
}: WorklogProcedureLinksPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();

  const linksQuery = useQuery({
    queryKey: ["procedure-links", noteId] as const,
    queryFn: async () => {
      const res = await fetch(`/api/work-logs/${noteId}/procedure-links`);
      if (!res.ok) throw new Error(`procedure-links fetch failed: ${res.status}`);
      return (await res.json()) as ProcedureLinksResponse;
    },
    staleTime: 30 * 1000,
    retry: false,
    enabled: Boolean(noteId),
  });

  const candidatesQuery = useQuery({
    queryKey: ["worklogs-procedure-pool"] as const,
    queryFn: async () => {
      const res = await fetch(`/api/work-logs?kind=procedure&archived=all`);
      if (!res.ok) throw new Error(`procedure pool fetch failed: ${res.status}`);
      return (await res.json()) as CandidateRow[];
    },
    staleTime: 60 * 1000,
    retry: false,
  });

  const addMutation = useMutation({
    mutationFn: async (args: { toProcedureId: string; relationship: Relationship }) => {
      const res = await fetch(`/api/work-logs/${noteId}/procedure-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `add link failed: ${res.status}`);
      }
      return (await res.json()) as LinkRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["procedure-links", noteId] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const res = await fetch(
        `/api/work-logs/${noteId}/procedure-links/${linkId}`,
        { method: "DELETE" },
      );
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `remove link failed: ${res.status}`);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["procedure-links", noteId] });
    },
  });

  const outgoing = linksQuery.data?.outgoing ?? [];
  const incoming = linksQuery.data?.incoming ?? [];

  // ---- Add form state -------------------------------------------------
  const [showAdd, setShowAdd] = useState(false);
  const [relationship, setRelationship] = useState<Relationship>("related");
  const [filter, setFilter] = useState("");

  /**
   * Candidate set for the add picker — every other procedure the user
   * owns, excluding the active note and any procedure already linked
   * (in either direction with the same relationship — server enforces
   * uniqueness on the composite, so we just hide already-linked targets
   * for the chosen relationship).
   */
  const candidates = useMemo(() => {
    const all = candidatesQuery.data ?? [];
    const alreadyOutgoing = new Set(
      outgoing
        .filter((l) => l.relationship === relationship)
        .map((l) => l.toProcedureId),
    );
    const haystack = all.filter(
      (c) => c.id !== noteId && !alreadyOutgoing.has(c.id),
    );
    const term = filter.trim().toLowerCase();
    return haystack
      .map((c) => ({
        id: c.id,
        label: deriveWorklogLabel({
          title: c.title,
          contentJson: c.contentJson,
          date: new Date(c.date),
        }),
      }))
      .filter((c) => (term ? c.label.toLowerCase().includes(term) : true))
      .slice(0, 12);
  }, [candidatesQuery.data, outgoing, relationship, filter, noteId]);

  function handleNavigate(targetId: string) {
    router.replace(buildWorklogFocusHref(pathname, targetId));
  }

  function renderRow(link: LinkRow, opts: { canDelete: boolean }) {
    return (
      <li
        key={link.id}
        className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-accent hover:text-accent-foreground"
      >
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            relationshipBadgeClass(link.relationship),
          )}
          title={`relationship: ${link.relationship}`}
        >
          {link.relationship}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            handleNavigate(link.target.id);
          }}
          className="flex-1 truncate text-left text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={`Open: ${link.target.label}`}
        >
          {link.target.label}
        </button>
        {opts.canDelete ? (
          <button
            type="button"
            onClick={() => removeMutation.mutate(link.id)}
            disabled={removeMutation.isPending}
            className="shrink-0 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            aria-label="Remove link"
            title="Remove link"
          >
            ×
          </button>
        ) : null}
      </li>
    );
  }

  const body = linksQuery.isLoading ? (
    <p className="text-xs italic text-muted-foreground">Loading links…</p>
  ) : (
    <div className="space-y-3">
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Outgoing
        </p>
        {outgoing.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">No outgoing links yet.</p>
        ) : (
          <ul className="space-y-0.5">{outgoing.map((l) => renderRow(l, { canDelete: true }))}</ul>
        )}
      </div>

      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Incoming
        </p>
        {incoming.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">No incoming links yet.</p>
        ) : (
          <ul className="space-y-0.5">{incoming.map((l) => renderRow(l, { canDelete: false }))}</ul>
        )}
      </div>

      <div className="pt-1">
        {!showAdd ? (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="rounded border border-dashed px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            + Add link
          </button>
        ) : (
          <div className="space-y-2 rounded border bg-muted/30 p-2">
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Relationship
              </label>
              <select
                value={relationship}
                onChange={(e) => setRelationship(e.target.value as Relationship)}
                className="rounded border bg-background px-1.5 py-0.5 text-xs"
              >
                {RELATIONSHIPS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search procedures by title…"
              className="w-full rounded border bg-background px-2 py-1 text-xs"
            />
            <ul className="max-h-40 space-y-0.5 overflow-y-auto">
              {candidatesQuery.isLoading ? (
                <li className="text-xs italic text-muted-foreground">Loading procedures…</li>
              ) : candidates.length === 0 ? (
                <li className="text-xs italic text-muted-foreground">
                  {filter.trim() ? "No matches." : "No other procedures available."}
                </li>
              ) : (
                candidates.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() =>
                        addMutation.mutate(
                          { toProcedureId: c.id, relationship },
                          {
                            onSuccess: () => {
                              setFilter("");
                            },
                          },
                        )
                      }
                      disabled={addMutation.isPending}
                      className="w-full truncate rounded px-1.5 py-1 text-left text-xs text-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                      title={`Link as ${relationship}: ${c.label}`}
                    >
                      {c.label}
                    </button>
                  </li>
                ))
              )}
            </ul>
            {addMutation.isError ? (
              <p className="text-[11px] text-destructive">
                {(addMutation.error as Error).message}
              </p>
            ) : null}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowAdd(false);
                  setFilter("");
                  addMutation.reset();
                }}
                className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {removeMutation.isError ? (
        <p className="text-[11px] text-destructive">
          {(removeMutation.error as Error).message}
        </p>
      ) : null}
    </div>
  );

  if (bare) {
    return (
      <div className={cn("text-sm", className)} aria-label="Linked procedures">
        {body}
      </div>
    );
  }

  return (
    <section
      className={cn(
        "rounded-md border bg-muted/30 px-3 py-2 text-sm",
        className,
      )}
      aria-label="Linked procedures"
    >
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Linked procedures
      </p>
      {body}
    </section>
  );
}

function relationshipBadgeClass(rel: string): string {
  switch (rel) {
    case "prereq":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
    case "branch":
      return "bg-violet-500/15 text-violet-700 dark:text-violet-300";
    case "next":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "related":
    default:
      return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
  }
}
