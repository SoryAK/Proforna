/**
 * WorklogSearchPalette — global full-text search overlay.
 *
 * Trigger: `/` keyboard shortcut, or programmatic `open` prop.
 * Backed by GET /api/work-logs/search (W1.2 — Postgres tsvector + ts_headline).
 *
 * UX:
 *   • Debounced query (250ms) — avoids hammering Postgres on each keystroke.
 *   • Arrow keys ↑/↓ move highlight; Enter selects; Esc closes.
 *   • Results show title + server-rendered snippet (already <mark>-wrapped).
 *   • Footer hint shows current scope ("All notes" or current folder).
 *
 * The snippet HTML comes from Postgres `ts_headline` with StartSel=<mark>
 * StopSel=</mark>. We sanitize defensively (only <mark> tags allowed) before
 * rendering, even though ts_headline escapes the source text.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, FileText, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  folderId: string | null;
  date: string;
  rank: number;
}

interface SearchResponse {
  results: SearchResult[];
}

export interface WorklogSearchPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, results are scoped to this folder + its descendants. */
  scopedFolderId?: string | null;
  /** Human label for the active scope (e.g. folder name, "Unfiled"). */
  scopeLabel?: string;
  /** Called when the user picks a result. */
  onSelect: (noteId: string) => void;
}

/**
 * Allowed tags from ts_headline are `<mark>` and `</mark>` only.
 * Everything else is escaped. ts_headline already escapes the source text
 * so HTML in note bodies cannot leak through; this is belt-and-suspenders.
 */
function sanitizeSnippet(raw: string): string {
  // Escape everything first.
  const escaped = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // Restore <mark>...</mark> wrappers.
  return escaped
    .replace(/&lt;mark&gt;/g, '<mark class="bg-amber-200/60 dark:bg-amber-500/30 rounded px-0.5">')
    .replace(/&lt;\/mark&gt;/g, "</mark>");
}

export function WorklogSearchPalette({
  open,
  onOpenChange,
  scopedFolderId,
  scopeLabel,
  onSelect,
}: WorklogSearchPaletteProps) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Reset state when palette opens.
  useEffect(() => {
    if (open) {
      setQ("");
      setDebouncedQ("");
      setHighlightIdx(0);
      // Focus the input after mount.
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  // 250ms debounce on the input.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(handle);
  }, [q]);

  const shouldFetch = open && debouncedQ.length >= 2;

  const { data, isFetching } = useQuery<SearchResponse>({
    queryKey: ["worklog-search", debouncedQ, scopedFolderId ?? "all"],
    queryFn: async () => {
      const params = new URLSearchParams({ q: debouncedQ, limit: "20" });
      if (scopedFolderId) params.set("folderId", scopedFolderId);
      const res = await fetch(`/api/work-logs/search?${params.toString()}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: shouldFetch,
    staleTime: 30_000,
  });

  const results = data?.results ?? [];

  // Clamp highlight as results change.
  useEffect(() => {
    setHighlightIdx((idx) => Math.min(Math.max(0, idx), Math.max(0, results.length - 1)));
  }, [results.length]);

  const pickResult = useCallback(
    (idx: number) => {
      const r = results[idx];
      if (!r) return;
      onSelect(r.id);
      onOpenChange(false);
    },
    [results, onSelect, onOpenChange],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIdx((i) => Math.min(results.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        pickResult(highlightIdx);
      }
    },
    [results.length, highlightIdx, pickResult],
  );

  // Keep highlighted row scrolled into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-result-idx="${highlightIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightIdx]);

  const status = useMemo(() => {
    if (!open) return "";
    if (debouncedQ.length < 2) return "Type at least 2 characters";
    if (isFetching) return "Searching…";
    if (results.length === 0) return "No notes match";
    return `${results.length} result${results.length === 1 ? "" : "s"}`;
  }, [open, debouncedQ, isFetching, results.length]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-xl p-0 gap-0 overflow-hidden"
      >
        <DialogTitle className="sr-only">Search worklog notes</DialogTitle>
        <DialogDescription className="sr-only">
          Full-text search across your worklog. Use arrow keys to navigate, Enter to open.
        </DialogDescription>

        {/* Input bar */}
        <div className="flex items-center gap-2 border-b px-3 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              scopeLabel ? `Search in “${scopeLabel}”…` : "Search all notes…"
            }
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            maxLength={200}
            aria-label="Search query"
          />
          {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              {status}
            </div>
          ) : (
            <ul role="listbox" aria-label="Search results" className="py-1">
              {results.map((r, idx) => (
                <li key={r.id}>
                  <button
                    type="button"
                    data-result-idx={idx}
                    onClick={() => pickResult(idx)}
                    onMouseEnter={() => setHighlightIdx(idx)}
                    className={cn(
                      "w-full text-left px-3 py-2 flex flex-col gap-0.5 transition-colors",
                      idx === highlightIdx ? "bg-accent" : "hover:bg-accent/60",
                    )}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{r.title || "(untitled)"}</span>
                      <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                        {new Date(r.date).toLocaleDateString()}
                      </span>
                    </div>
                    {r.snippet && (
                      <p
                        className="pl-5 text-xs text-muted-foreground line-clamp-2 [&_mark]:font-medium"
                        // Snippet is server-rendered HTML from ts_headline; we
                        // sanitize to allow only <mark>...</mark> wrappers.
                        dangerouslySetInnerHTML={{ __html: sanitizeSnippet(r.snippet) }}
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer hint */}
        <div className="border-t bg-muted/30 px-3 py-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{status}</span>
          <span className="hidden sm:flex items-center gap-2">
            <kbd className="rounded border px-1 py-0.5 font-mono">↑↓</kbd>
            <span>navigate</span>
            <kbd className="rounded border px-1 py-0.5 font-mono">↵</kbd>
            <span>open</span>
            <kbd className="rounded border px-1 py-0.5 font-mono">esc</kbd>
            <span>close</span>
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
