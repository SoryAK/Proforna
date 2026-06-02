"use client";

/**
 * QuickLogDialog — lightweight "log something fast" modal.
 *
 * Architecture:
 *  • QuickLogDialog: global singleton mounted in LayoutShell. Listens for a
 *    "quick-log:open" CustomEvent dispatched on document. Opens the modal.
 *  • QuickLogTrigger: button (used in Sidebar) that dispatches "quick-log:open".
 *
 * Features:
 *  • Template quick-pick chips (loads from /api/work-logs/templates)
 *  • Fields: title, date, category, hours, notes, mood, accomplishment flag, tags
 *  • POSTs to /api/work-logs, then invalidates ["work-logs"] query cache
 *  • Keyboard shortcut: Ctrl+Shift+L (or Cmd+Shift+L on Mac)
 */

import { useEffect, useRef, useState, type ButtonHTMLAttributes } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  X,
  Plus,
  Star,
  Zap,
} from "lucide-react";
import type { Template } from "@/types/worklog";
import { CATEGORIES, MOODS } from "@/components/worklog/constants";
import { TagInput } from "@/components/ui/tag-input";

// ── Local form defaults ──────────────────────────────────────────────────────

const EMPTY_FORM = {
  title: "",
  date: format(new Date(), "yyyy-MM-dd"),
  category: "task",
  hours: "",
  content: "",
  mood: null as string | null,
  accomplishment: false,
  tags: "",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function openQuickLog() {
  document.dispatchEvent(new CustomEvent("quick-log:open"));
}

// ── QuickLogTrigger ───────────────────────────────────────────────────────────

export function QuickLogTrigger(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", children, onClick, ...rest } = props;
  return (
    <button
      type="button"
      {...rest}
      onClick={(e) => {
        openQuickLog();
        onClick?.(e);
      }}
      className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors ${className}`}
      title="Quick log (Ctrl+Shift+L)"
    >
      <Zap className="h-3.5 w-3.5 shrink-0" />
      {children ?? "Quick Log"}
    </button>
  );
}

// ── QuickLogDialog ────────────────────────────────────────────────────────────

export function QuickLogDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  // Load templates (best-effort)
  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["work-log-templates"],
    queryFn: () => fetch("/api/work-logs/templates").then((r) => r.json()),
    staleTime: 60_000,
  });

  // Open via custom event
  useEffect(() => {
    const handler = () => {
      setForm({ ...EMPTY_FORM, date: format(new Date(), "yyyy-MM-dd") });
      setError(null);
      setOpen(true);
    };
    document.addEventListener("quick-log:open", handler);
    return () => document.removeEventListener("quick-log:open", handler);
  }, []);

  // Keyboard shortcut: Ctrl+Shift+L / Cmd+Shift+L
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        openQuickLog();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Focus title when dialog opens
  useEffect(() => {
    if (open) setTimeout(() => titleRef.current?.focus(), 50);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      fetch("/api/work-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to save");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-logs"] });
      setOpen(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  function applyTemplate(t: Template) {
    setForm((prev) => ({
      ...prev,
      title: t.defaultTitle ?? prev.title,
      category: t.defaultCategory ?? prev.category,
      mood: t.defaultMood ?? prev.mood,
      hours: t.defaultDurationMinutes ? String(t.defaultDurationMinutes / 60) : prev.hours,
      tags: t.defaultTags ?? prev.tags,
    }));
    setTimeout(() => titleRef.current?.focus(), 50);
  }

  function handleSave() {
    if (!form.title.trim()) {
      setError("Title is required");
      titleRef.current?.focus();
      return;
    }
    setError(null);
    createMutation.mutate({
      date: form.date,
      title: form.title.trim(),
      category: form.category,
      hours: form.hours !== "" ? parseFloat(form.hours) : null,
      content: form.content.trim() || null,
      mood: form.mood,
      accomplishment: form.accomplishment,
      tags: form.tags.trim() || null,
    });
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[2000] bg-black/40 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick Log"
        className="fixed left-1/2 top-1/2 z-[2001] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Zap className="h-4 w-4 text-violet-500 shrink-0" />
          <p className="flex-1 text-sm font-semibold">Quick Log</p>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            Ctrl+Shift+L
          </kbd>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="ml-1 p-1 rounded hover:bg-muted transition-colors"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Template chips */}
          {templates.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {templates.slice(0, 6).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border border-border bg-muted/50 hover:bg-muted transition-colors"
                  title={t.description ?? undefined}
                >
                  {t.icon ? <span>{t.icon}</span> : <Plus className="h-2.5 w-2.5" />}
                  {t.name}
                </button>
              ))}
            </div>
          )}

          {/* Title */}
          <input
            ref={titleRef}
            type="text"
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) handleSave(); }}
            placeholder="What did you work on?"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          />

          {/* Date + Hours row */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[11px] text-muted-foreground mb-1 block">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              />
            </div>
            <div className="w-24">
              <label className="text-[11px] text-muted-foreground mb-1 block">Hours</label>
              <input
                type="number"
                min="0"
                step="0.25"
                value={form.hours}
                onChange={(e) => setForm((p) => ({ ...p, hours: e.target.value }))}
                placeholder="0"
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              />
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Category</label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(CATEGORIES).map(([key, { label, icon: Icon }]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, category: key }))}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                    form.category === key
                      ? "bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-700"
                      : "border-border bg-muted/40 hover:bg-muted"
                  }`}
                >
                  <Icon className="h-2.5 w-2.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">
              Notes <span className="opacity-50">(optional)</span>
            </label>
            <textarea
              value={form.content}
              onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
              placeholder="Any details, blockers, or context..."
              rows={2}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none"
            />
          </div>

          {/* Mood + Accomplishment row */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-muted-foreground mr-1">Mood</span>
              {MOODS.map(({ value, label, icon: Icon, color }) => (
                <button
                  key={value}
                  type="button"
                  title={label}
                  onClick={() => setForm((p) => ({ ...p, mood: p.mood === value ? null : value }))}
                  className={`p-1 rounded transition-colors ${form.mood === value ? "bg-muted ring-1 ring-border" : "hover:bg-muted"}`}
                >
                  <Icon className={`h-4 w-4 ${color}`} />
                </button>
              ))}
            </div>
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.accomplishment}
                onChange={(e) => setForm((p) => ({ ...p, accomplishment: e.target.checked }))}
                className="rounded border-border accent-violet-500"
              />
              <Star className={`h-3.5 w-3.5 ${form.accomplishment ? "text-amber-400 fill-amber-400" : "text-muted-foreground"}`} />
              <span className="text-xs text-muted-foreground">Accomplishment</span>
            </label>
          </div>

          {/* Tags */}
          <TagInput
            value={form.tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)}
            onChange={(next) => setForm((p) => ({ ...p, tags: next.join(", ") }))}
            placeholder="Add tags and press Enter"
            className="w-full"
          />

          {/* Error */}
          {error && <p className="text-xs text-destructive">{error}</p>}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={createMutation.isPending}
              className="px-4 py-1.5 text-sm rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {createMutation.isPending ? "Saving…" : "Log it"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
