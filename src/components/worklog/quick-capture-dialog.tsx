"use client";

/**
 * QuickCaptureDialog — keyboard-first "new worklog" capture, available globally
 * via the command palette (Cmd/Ctrl+K → "New worklog") or directly via
 * Cmd/Ctrl+Shift+N. Phase 1c of the worklog editor revamp.
 *
 * Design choices:
 *  - Plain <Textarea> for the body (not the Tiptap editor) — capture should be
 *    instant; richer formatting lives one click away in the full reader.
 *  - Reads /api/work-logs/preferences to seed defaults (category, hours, position).
 *  - Cmd/Ctrl+Enter submits; Esc closes (Dialog default).
 *  - After save, invalidates the relevant React Query keys so the worklog page
 *    and command palette pick up the new entry immediately, then routes the
 *    user to the full reader for that note.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { resolveCategoryMeta } from "@/components/worklog/constants";
import { useWorklogCategories } from "@/components/worklog/hooks/use-worklog-categories";
import { VoiceDictationButton } from "@/components/worklog/voice/voice-dictation-button";
import { WORKLOG_CATEGORY_FALLBACK } from "@/lib/worklog-categories";
import type { WorklogPreferences } from "@/types/worklog";

interface QuickCaptureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EMPTY_PREFS: WorklogPreferences = {
  defaultPositionId: null,
  defaultShiftId: null,
  defaultCategory: "task",
  defaultMood: null,
  defaultHours: null,
  voiceDictationConsentedAt: null,
  // ADR-0023 / ADR-0025 — reader right-rail defaults (unused here, included for type completeness).
  readerRailTab: "properties",
  readerRailCollapsed: false,
};

export function QuickCaptureDialog({ open, onOpenChange }: QuickCaptureDialogProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const titleRef = useRef<HTMLInputElement | null>(null);

  const { data: prefs = EMPTY_PREFS } = useQuery<WorklogPreferences>({
    queryKey: ["worklog-preferences"],
    queryFn: async () => {
      const r = await fetch("/api/work-logs/preferences");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    staleTime: 60_000,
  });

  // User-defined categories from Sprint A's WorkLogCategory table. We always
  // append the synthetic "Other" entry so users can capture into the fallback
  // bucket even if they haven't defined any custom categories yet.
  const { categories: userCategories } = useWorklogCategories();
  const categoryOptions = useMemo(
    () => [
      ...userCategories.map((c) => ({
        key: c.name,
        label: resolveCategoryMeta(c.name).label,
      })),
      { key: WORKLOG_CATEGORY_FALLBACK, label: resolveCategoryMeta(WORKLOG_CATEGORY_FALLBACK).label },
    ],
    [userCategories],
  );

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<string>(prefs.defaultCategory ?? "task");
  const [hours, setHours] = useState<string>(
    prefs.defaultHours != null ? String(prefs.defaultHours) : "",
  );
  const [error, setError] = useState<string | null>(null);

  // Reset/seed form whenever the dialog opens, so defaults are always fresh.
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setContent("");
    setCategory(prefs.defaultCategory ?? "task");
    setHours(prefs.defaultHours != null ? String(prefs.defaultHours) : "");
    setError(null);
    // Autofocus title input on next tick (after dialog mounts).
    const t = window.setTimeout(() => titleRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open, prefs.defaultCategory, prefs.defaultHours]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) throw new Error("Title is required");
      const now = new Date().toISOString();
      const parsedHours = hours.trim() ? Number(hours) : null;
      const payload = {
        date: now,
        title: trimmedTitle,
        content: content.trim() || null,
        category: category || "task",
        hours: parsedHours != null && Number.isFinite(parsedHours) ? parsedHours : null,
        positionId: prefs.defaultPositionId ?? null,
        shiftId: prefs.defaultShiftId ?? null,
        mood: prefs.defaultMood ?? null,
      };
      const r = await fetch("/api/work-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(text || "Failed to create worklog");
      }
      return (await r.json()) as { id: string };
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["worklogs"] });
      qc.invalidateQueries({ queryKey: ["work-logs"] });
      qc.invalidateQueries({ queryKey: ["command-palette-search"] });
      onOpenChange(false);
      router.push(`/worklog/notes/${saved.id}`);
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : "Failed to create worklog");
    },
  });

  const submit = useCallback(() => {
    if (createMutation.isPending) return;
    if (!title.trim()) {
      setError("Title is required");
      titleRef.current?.focus();
      return;
    }
    setError(null);
    createMutation.mutate();
  }, [createMutation, title]);

  // Cmd/Ctrl+Enter to submit from anywhere inside the dialog.
  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !createMutation.isPending && onOpenChange(v)}>
      <DialogContent
        className="sm:max-w-lg"
        onKeyDown={onKeyDown}
      >
        <DialogHeader>
          <DialogTitle>New worklog</DialogTitle>
          <DialogDescription>
            Capture a quick note. Press <kbd className="rounded border bg-muted px-1 text-xs">⌘/Ctrl + Enter</kbd> to save.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="qc-title" className="text-xs font-medium text-muted-foreground">
              Title
            </label>
            <Input
              id="qc-title"
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What happened?"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label htmlFor="qc-content" className="text-xs font-medium text-muted-foreground">
                Notes <span className="text-muted-foreground/70">(optional)</span>
              </label>
              <VoiceDictationButton
                onFinalChunk={(chunk) =>
                  setContent((prev) => (prev ? `${prev} ${chunk}` : chunk))
                }
              />
            </div>
            <Textarea
              id="qc-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Add any details… (rich formatting available in the full editor)"
              rows={4}
              className="resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              <Select value={category} onValueChange={(v) => setCategory(v ?? "task")}>
                <SelectTrigger>
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map(({ key, label }) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label htmlFor="qc-hours" className="text-xs font-medium text-muted-foreground">
                Hours <span className="text-muted-foreground/70">(optional)</span>
              </label>
              <Input
                id="qc-hours"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="e.g. 1.5"
                inputMode="decimal"
                autoComplete="off"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={createMutation.isPending || !title.trim()}>
            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save & open
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
