"use client";

/**
 * Notion page picker + importer dialog (Sprint 6B v1, ADR-0019).
 *
 * Workflow:
 *   1. Open dialog → GET /api/integrations/notion/pages
 *   2. User filters / selects pages with checkboxes (already-imported pages
 *      are dimmed; the user can still check them but the server will skip).
 *   3. Click "Import N pages" → POST /api/integrations/notion/import
 *   4. Toast summarizes (e.g. "Imported 5, skipped 2, 1 failed"); dialog
 *      closes; ["work-logs"] and ["integrations"] are invalidated so the
 *      worklog notes view shows the new entries on next visit.
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, NotebookText, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type NotionPageSummary = {
  id: string;
  title: string;
  url: string;
  lastEditedTime: string;
  parentLabel: string | null;
};

type ListResponse = {
  pages: NotionPageSummary[];
  importedPageIds: string[];
};

type ImportResultRow = {
  pageId: string;
  status: "imported" | "skipped" | "failed";
  workLogId?: string;
  title?: string;
  error?: string;
};

type ImportResponse = {
  results: ImportResultRow[];
  folderId: string;
};

async function fetchPages(): Promise<ListResponse> {
  const res = await fetch("/api/integrations/notion/pages");
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || "Failed to load Notion pages");
  }
  return res.json();
}

async function postImport(pageIds: string[]): Promise<ImportResponse> {
  const res = await fetch("/api/integrations/notion/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pageIds }),
  });
  const body = (await res.json()) as ImportResponse & { error?: string };
  if (!res.ok) {
    throw new Error(body.error || "Import failed");
  }
  return body;
}

interface NotionImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotionImportDialog({ open, onOpenChange }: NotionImportDialogProps) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const listQuery = useQuery({
    queryKey: ["notion-pages"],
    queryFn: fetchPages,
    enabled: open,
    staleTime: 60_000,
    retry: 1,
  });

  const importMut = useMutation({
    mutationFn: (pageIds: string[]) => postImport(pageIds),
    onSuccess: (data) => {
      const counts = data.results.reduce(
        (acc, r) => {
          acc[r.status] = (acc[r.status] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );
      const parts: string[] = [];
      if (counts.imported) parts.push(`Imported ${counts.imported}`);
      if (counts.skipped) parts.push(`skipped ${counts.skipped} already imported`);
      if (counts.failed) parts.push(`${counts.failed} failed`);
      toast.success(parts.join(" · ") || "No pages imported");

      qc.invalidateQueries({ queryKey: ["work-logs"] });
      qc.invalidateQueries({ queryKey: ["integrations"] });
      qc.invalidateQueries({ queryKey: ["notion-pages"] });

      setSelectedIds(new Set());
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importedSet = useMemo(
    () => new Set(listQuery.data?.importedPageIds ?? []),
    [listQuery.data?.importedPageIds],
  );

  const filteredPages = useMemo(() => {
    const all = listQuery.data?.pages ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter((p) => p.title.toLowerCase().includes(q));
  }, [listQuery.data?.pages, filter]);

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const visibleNew = filteredPages.filter((p) => !importedSet.has(p.id));
    if (visibleNew.every((p) => selectedIds.has(p.id))) {
      // All visible-new are selected → clear them.
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const p of visibleNew) next.delete(p.id);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const p of visibleNew) next.add(p.id);
        return next;
      });
    }
  };

  const selectableVisible = filteredPages.filter((p) => !importedSet.has(p.id));
  const allSelectableChecked =
    selectableVisible.length > 0 &&
    selectableVisible.every((p) => selectedIds.has(p.id));

  const totalPages = listQuery.data?.pages.length ?? 0;
  const importedCount = importedSet.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <NotebookText className="w-5 h-5" />
            Import from Notion
          </DialogTitle>
          <DialogDescription>
            Pages land in a new &ldquo;Imported from Notion&rdquo; folder in your worklog.
            Already-imported pages are skipped &mdash; your local edits are never overwritten.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Filter by title…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {totalPages === 0
                ? listQuery.isLoading
                  ? "Loading pages…"
                  : "No pages granted"
                : `${totalPages} page${totalPages === 1 ? "" : "s"} accessible · ${importedCount} already imported`}
            </span>
            {selectableVisible.length > 0 && (
              <button
                type="button"
                onClick={toggleAll}
                className="hover:underline"
              >
                {allSelectableChecked ? "Clear selection" : "Select all visible"}
              </button>
            )}
          </div>

          <div className="border rounded-lg max-h-[420px] overflow-y-auto">
            {listQuery.isLoading ? (
              <div className="p-8 text-sm text-muted-foreground flex items-center gap-2 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading pages from Notion…
              </div>
            ) : listQuery.isError ? (
              <div className="p-8 text-sm text-destructive text-center">
                {(listQuery.error as Error).message}
              </div>
            ) : filteredPages.length === 0 ? (
              <EmptyState query={filter} totalAvailable={totalPages} />
            ) : (
              <ul className="divide-y">
                {filteredPages.map((p) => {
                  const isImported = importedSet.has(p.id);
                  const isChecked = selectedIds.has(p.id);
                  return (
                    <li
                      key={p.id}
                      className={`flex items-center gap-3 p-3 ${isImported ? "opacity-60" : ""}`}
                    >
                      <Checkbox
                        checked={isChecked}
                        disabled={isImported}
                        onCheckedChange={() => !isImported && toggleOne(p.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">
                            {p.title || "Untitled"}
                          </span>
                          {isImported && (
                            <Badge variant="secondary" className="text-xs shrink-0">
                              Imported
                            </Badge>
                          )}
                          {p.parentLabel && (
                            <Badge variant="outline" className="text-xs shrink-0">
                              {p.parentLabel}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Edited {formatDistanceToNow(new Date(p.lastEditedTime), { addSuffix: true })}
                        </div>
                      </div>
                      {p.url && (
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground hover:text-foreground shrink-0"
                          aria-label="Open in Notion"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={importMut.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => importMut.mutate([...selectedIds])}
            disabled={selectedIds.size === 0 || importMut.isPending}
          >
            {importMut.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importing…
              </>
            ) : (
              `Import ${selectedIds.size} page${selectedIds.size === 1 ? "" : "s"}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ query, totalAvailable }: { query: string; totalAvailable: number }) {
  if (query.trim().length > 0) {
    return (
      <div className="p-8 text-sm text-muted-foreground text-center">
        No pages match &ldquo;{query}&rdquo;.
      </div>
    );
  }
  if (totalAvailable === 0) {
    return (
      <div className="p-8 text-sm text-center space-y-2">
        <p className="text-muted-foreground">
          No pages have been granted to Resumsify yet.
        </p>
        <p className="text-xs text-muted-foreground">
          Open Notion → click any page → ⋯ menu → Connections → add Resumsify.
        </p>
      </div>
    );
  }
  return null;
}
