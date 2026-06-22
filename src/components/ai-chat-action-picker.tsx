"use client";

/**
 * AIChatActionPicker — ADR-0046 Phase D.3.
 *
 * Modal target picker invoked when `resolveActionTarget` returns
 * `{ kind: "needs-picker", entityType }`. The dialog wraps
 * `/api/ai/mention-search` (the same backend the chat textarea uses for
 * @-mentions) so the user can pick a job (WorkHistory row) or worklog
 * (WorkLog row) to land the code block on.
 *
 * UI contract is intentionally minimal: a search input, a scrollable list
 * of clickable result rows, and Esc/Cancel close. ArrowUp/ArrowDown +
 * Enter cycle the highlighted row.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type EntityType = "job" | "worklog";

interface PickedTarget {
  type: EntityType;
  id: string;
  label: string;
}

interface MentionSearchResult {
  id: string;
  type: EntityType | "skill" | "contact";
  label: string;
  secondary: string;
  score: number;
}

interface AIChatActionPickerProps {
  open: boolean;
  entityType: EntityType;
  onPick: (target: PickedTarget) => void;
  onCancel: () => void;
}

const SEARCH_DEBOUNCE_MS = 180;
const FETCH_LIMIT = 12;

const TITLE_FOR_TYPE: Record<EntityType, string> = {
  job: "Pick a job",
  worklog: "Pick a worklog",
};

const DESCRIPTION_FOR_TYPE: Record<EntityType, string> = {
  job: "Choose which job to attach this code block to.",
  worklog: "Choose which worklog to send this code block to.",
};

export function AIChatActionPicker({
  open,
  entityType,
  onPick,
  onCancel,
}: AIChatActionPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MentionSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset whenever the dialog opens for a new entity type.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setHighlight(0);
    // Focus the search input shortly after the dialog mounts — base-ui
    // doesn't support `onOpenAutoFocus` so the manual timeout is the
    // documented workaround.
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open, entityType]);

  // Debounced fetch against /api/ai/mention-search.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch("/api/ai/mention-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: entityType,
            q: query.trim() || undefined,
            limit: FETCH_LIMIT,
          }),
        });
        if (!res.ok) {
          if (!cancelled) setResults([]);
          return;
        }
        const data = (await res.json()) as MentionSearchResult[];
        if (!cancelled) {
          setResults(Array.isArray(data) ? data : []);
          setHighlight(0);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [open, entityType, query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const picked = results[highlight];
      if (picked) {
        onPick({
          type: entityType,
          id: picked.id,
          label: picked.label,
        });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{TITLE_FOR_TYPE[entityType]}</DialogTitle>
          <DialogDescription>
            {DESCRIPTION_FOR_TYPE[entityType]}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                entityType === "job"
                  ? "Search by company…"
                  : "Search by title…"
              }
              className="pl-8"
              aria-label="Search"
            />
          </div>
          <div
            className="max-h-72 overflow-y-auto rounded-md border"
            role="listbox"
            aria-label={`${entityType} options`}
          >
            {loading && results.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Searching…
              </div>
            ) : results.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                {query
                  ? "No matches. Try a different search."
                  : entityType === "job"
                    ? "No jobs yet. Add one from Work History first."
                    : "No worklogs yet. Create one from the Worklog page first."}
              </div>
            ) : (
              <ul className="py-1 text-sm">
                {results.map((row, i) => {
                  const active = i === highlight;
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        onMouseEnter={() => setHighlight(i)}
                        onClick={() =>
                          onPick({
                            type: entityType,
                            id: row.id,
                            label: row.label,
                          })
                        }
                        className={`w-full px-3 py-2 text-left transition-colors ${
                          active ? "bg-muted" : "hover:bg-muted/60"
                        }`}
                      >
                        <div className="truncate font-medium">{row.label}</div>
                        {row.secondary ? (
                          <div className="truncate text-xs text-muted-foreground">
                            {row.secondary}
                          </div>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
