/**
 * EventEditDialog — text-only edit surface for a single CareerEvent
 * (ADR-0027 Day 3 Cycle B, Griller answer Q2=A).
 *
 * Fields editable here: title, category (free-form picker), description,
 * startDate, endDate, metrics.
 *
 * Fields shown READ-ONLY (Cycle B intentionally locks geo):
 *   • workHistoryId / anchored vs floating affiliation
 *   • location, lat, lng
 *
 *   To "move" an event the user must delete + recreate. This avoids
 *   building a geocoder picker inside Cycle B — that's parked for a
 *   future ADR. See `EmptyState` in WorklogEventsView for the redirect
 *   to career-map (anchored creation lives there).
 *
 * Route selection (load-bearing — ADR-0027 Q1A immutable workHistoryId):
 *   • event.workHistoryId === null   → PATCH /api/events/[eventId]
 *   • event.workHistoryId !== null   → PATCH /api/work-history/[id]/events/[eventId]
 *
 * Both routes accept the same body shape (validated by the peer route
 * via event-schema.ts; anchored route uses an inline VALID_CATEGORIES
 * array that mirrors the suggestions). We never pass workHistoryId in
 * the PATCH body — the peer route rejects it as immutable.
 *
 * House-style notes:
 *   • Plain `useState` (no react-hook-form / zod).
 *   • Discriminated-union `Result` not needed here — the API returns
 *     plain JSON; we surface errors through `toast`.
 *   • Dialog from `@/components/ui/dialog` (base-ui), not `window.prompt`
 *     (banned in React 19 — see user-memory).
 */

"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Anchor, CalendarDays, Loader2, MapPin } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CAREER_EVENT_CATEGORY_SUGGESTIONS } from "@/lib/career-event/event-schema";
import { cn } from "@/lib/utils";

export interface EditableEvent {
  id: string;
  workHistoryId: string | null;
  title: string;
  description: string | null;
  category: string;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  metrics: string | null;
}

interface EventEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: EditableEvent | null;
  /** Triggered after a successful save. Parent typically closes the dialog. */
  onSaved?: () => void;
  /** Triggered when the user opens the delete confirm from inside this dialog. */
  onRequestDelete?: () => void;
}

/**
 * Build the correct PATCH URL based on whether the event is floating
 * or anchored to a work history. Centralized so EventDeleteConfirm can
 * reuse the same routing logic.
 */
export function eventPatchUrl(event: { id: string; workHistoryId: string | null }): string {
  if (event.workHistoryId === null) return `/api/events/${event.id}`;
  return `/api/work-history/${event.workHistoryId}/events/${event.id}`;
}

export function EventEditDialog({
  open,
  onOpenChange,
  event,
  onSaved,
  onRequestDelete,
}: EventEditDialogProps) {
  const qc = useQueryClient();

  // Local form state — reset whenever the dialog opens with a new event.
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("company_event");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [metrics, setMetrics] = useState("");

  useEffect(() => {
    if (!open || !event) return;
    setTitle(event.title);
    setCategory(event.category || "company_event");
    setDescription(event.description ?? "");
    setStartDate(isoToDateInput(event.startDate));
    setEndDate(isoToDateInput(event.endDate));
    setMetrics(event.metrics ?? "");
  }, [open, event]);

  const save = useMutation({
    mutationFn: async () => {
      if (!event) throw new Error("No event in scope");
      const url = eventPatchUrl(event);
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          category: category.trim() || "other",
          description: description.trim() ? description.trim() : null,
          // dateInputToIso returns null for "" — both routes accept that.
          startDate: dateInputToIso(startDate),
          endDate: dateInputToIso(endDate),
          metrics: metrics.trim() ? metrics.trim() : null,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `PATCH failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Event updated");
      // Sidebar + list share this key.
      qc.invalidateQueries({ queryKey: ["career-events", "all"] });
      // The anchored path also feeds the career-map / promote flows.
      qc.invalidateQueries({ queryKey: ["career-growth"] });
      onSaved?.();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Update failed"),
  });

  const canSubmit = title.trim().length > 0 && !save.isPending && event !== null;
  const isFloating = event?.workHistoryId === null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-orange-500" />
            Edit event
          </DialogTitle>
          <DialogDescription>
            Update text fields. Location and date-of-place are locked in this view —
            create a new event to move it.
          </DialogDescription>
        </DialogHeader>

        {/* Affiliation summary — read-only metadata pill */}
        {event && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
              isFloating
                ? "border-orange-500/30 bg-orange-500/5 text-orange-700 dark:text-orange-300"
                : "border-border bg-muted/40 text-muted-foreground",
            )}
          >
            {isFloating ? (
              <>
                <MapPin className="h-3.5 w-3.5" />
                <span className="font-medium">Free-floating event</span>
                <span className="opacity-70">— {event.location ?? "(no location)"}</span>
              </>
            ) : (
              <>
                <Anchor className="h-3.5 w-3.5" />
                <span className="font-medium">Anchored to a work history</span>
                <span className="opacity-70 truncate">
                  {event.location ? `— ${event.location}` : ""}
                </span>
              </>
            )}
          </div>
        )}

        <div className="space-y-4 py-1">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="ev-title">Title</Label>
            <Input
              id="ev-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              disabled={save.isPending}
            />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label htmlFor="ev-category">Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v ?? "company_event")}
              disabled={save.isPending}
            >
              <SelectTrigger id="ev-category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAREER_EVENT_CATEGORY_SUGGESTIONS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {formatCategoryLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ev-start">Start date</Label>
              <Input
                id="ev-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={save.isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-end">End date</Label>
              <Input
                id="ev-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={save.isPending}
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="ev-description">
              Description{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="ev-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              disabled={save.isPending}
            />
          </div>

          {/* Metrics */}
          <div className="space-y-1.5">
            <Label htmlFor="ev-metrics">
              Metrics{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="ev-metrics"
              value={metrics}
              onChange={(e) => setMetrics(e.target.value)}
              maxLength={500}
              disabled={save.isPending}
            />
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={onRequestDelete}
            disabled={save.isPending}
          >
            Delete
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={save.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => save.mutate()}
              disabled={!canSubmit}
            >
              {save.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function isoToDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // <input type="date"> needs yyyy-mm-dd in LOCAL time.
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function dateInputToIso(value: string): string | null {
  if (!value) return null;
  // Treat date-only as midnight UTC to keep storage stable across
  // user timezones; same convention the existing event POST handlers use.
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function formatCategoryLabel(raw: string): string {
  return raw
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}
