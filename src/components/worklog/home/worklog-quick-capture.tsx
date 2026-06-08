/**
 * WorklogQuickCapture — capture-first hero for `/worklog` (ADR-0014).
 *
 * Behavior (Quick Capture submit option B):
 *   1. User types a title.
 *   2. User optionally picks a category chip.
 *   3. Save → POST /api/work-logs with title+category+date+today defaults.
 *   4. router.push(`/worklog/notes?focus=<id>`) — escalates into the editor
 *      with the new note pre-selected. The existing useWorklogDeepLinks hook
 *      consumes ?focus and brings the reader into focus automatically.
 *
 * No inline-save state. No optimistic UI on /worklog itself — by design,
 * the capture is a route handoff, not a here-and-now mutation.
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { resolveCategoryMeta } from "@/components/worklog/constants";
import { cn } from "@/lib/utils";
import type { WorkLog } from "@/types/worklog";

const QUICK_CHIPS: Array<{ key: string; label: string; dotClass: string }> = [
  { key: "task", label: "Task", dotClass: "bg-orange-500" },
  { key: "project", label: "Project", dotClass: "bg-purple-500" },
  { key: "training", label: "Learning", dotClass: "bg-emerald-500" },
  { key: "troubleshooting", label: "Blocker", dotClass: "bg-rose-400" },
];

export function WorklogQuickCapture() {
  const router = useRouter();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("task");

  const create = useMutation({
    mutationFn: async (input: { title: string; category: string }) => {
      const res = await fetch("/api/work-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: new Date().toISOString(),
          title: input.title.trim() || "Untitled",
          category: input.category,
          content: "",
          isNotable: false,
          equipmentIds: [],
          assetIds: [],
        }),
      });
      if (!res.ok) throw new Error("Failed to save note");
      return (await res.json()) as WorkLog;
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["worklogs"] });
      // Escalate into the full editor — useWorklogDeepLinks consumes ?focus.
      router.push(`/worklog/notes?focus=${saved.id}`);
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (create.isPending) return;
    create.mutate({ title, category });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border bg-gradient-to-br from-orange-500/[0.06] to-transparent p-5"
    >
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-orange-500" />
        <span className="text-sm font-semibold">Capture</span>
        <span className="text-xs text-muted-foreground">Press Enter to open in editor</span>
      </div>

      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What did you work on?"
        className="w-full bg-transparent text-2xl placeholder:text-muted-foreground/50 focus:outline-none"
        disabled={create.isPending}
      />

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/60">
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          {QUICK_CHIPS.map((chip) => {
            const meta = resolveCategoryMeta(chip.key);
            const active = category === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setCategory(chip.key)}
                className={cn(
                  "px-2 py-1 rounded flex items-center gap-1.5 transition-colors",
                  active
                    ? "bg-orange-100 text-orange-900 dark:bg-orange-900/30 dark:text-orange-100"
                    : "bg-muted/40 hover:bg-muted/60",
                )}
                title={meta?.label ?? chip.label}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full", chip.dotClass)} />
                {chip.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={create.isPending || title.trim().length === 0}
            className="text-xs px-3 py-1.5 rounded bg-orange-600 text-white font-medium hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {create.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
            Save and open
          </button>
        </div>
      </div>

      {create.isError && (
        <p className="mt-2 text-xs text-destructive">
          Couldn&rsquo;t save the note. Try again.
        </p>
      )}
    </form>
  );
}
