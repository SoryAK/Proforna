/**
 * EventCreateDialog — free-floating CareerEvent creation surface.
 *
 * ADR-0027 Day 4 Cycle C: lets the user create a free-floating event
 * directly from the dedicated /worklog/map view (FAB → click on map →
 * reverse-geocode → this dialog opens with coords + a default location
 * string baked in).
 *
 * Scope (mirrors the cycle plan):
 *   • Free-floating only — POST /api/events forces workHistoryId=null
 *     (defense-in-depth) and the validator demands lat+lng+location.
 *   • Anchored creation lives elsewhere (career-map flow). We do NOT
 *     reuse this dialog for that path.
 *
 * House-style notes (mirrors EventEditDialog):
 *   • Plain useState + useMutation, no react-hook-form / zod.
 *   • Dialog from @/components/ui/dialog (base-ui), not window.prompt.
 *   • Single shared TanStack key ["career-events", "all"] gets
 *     invalidated so the list, sidebar badge, and map all reflect the
 *     new pin without a full refetch.
 *
 * Visual parity: header uses the fuchsia camera/MapPin tone from the
 * pink #d946ef event marker so the create surface feels of a piece
 * with the map it sits on top of.
 */

"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, Loader2, MapPin } from "lucide-react";
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

interface EventCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-resolved coords from the map's place-mode click. */
  coords: { lat: number; lng: number } | null;
  /** Reverse-geocoded address (best-effort). Empty string falls back to "<lat>, <lng>". */
  defaultLocation: string;
  onCreated?: () => void;
}

export function EventCreateDialog({
  open,
  onOpenChange,
  coords,
  defaultLocation,
  onCreated,
}: EventCreateDialogProps) {
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("company_event");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(() => todayLocalDateInput());
  const [endDate, setEndDate] = useState("");
  const [location, setLocation] = useState("");
  const [metrics, setMetrics] = useState("");

  // Reset whenever the dialog opens (new coords / fresh form).
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setCategory("company_event");
    setDescription("");
    setStartDate(todayLocalDateInput());
    setEndDate("");
    setLocation(
      defaultLocation.trim() ||
        (coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : ""),
    );
    setMetrics("");
  }, [open, coords, defaultLocation]);

  const create = useMutation({
    mutationFn: async () => {
      if (!coords) throw new Error("No coordinates picked");
      const trimmedLocation = location.trim();
      if (!trimmedLocation) {
        // Validator will reject too — surface the message proactively.
        throw new Error("Location is required");
      }
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          category: category.trim() || "other",
          description: description.trim() ? description.trim() : null,
          startDate: dateInputToIso(startDate),
          endDate: dateInputToIso(endDate),
          location: trimmedLocation,
          lat: coords.lat,
          lng: coords.lng,
          metrics: metrics.trim() ? metrics.trim() : null,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `POST failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Event added");
      qc.invalidateQueries({ queryKey: ["career-events", "all"] });
      qc.invalidateQueries({ queryKey: ["career-growth"] });
      onCreated?.();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Could not create event"),
  });

  const canSubmit =
    title.trim().length > 0 &&
    location.trim().length > 0 &&
    coords !== null &&
    !create.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-fuchsia-500" />
            New free-floating event
          </DialogTitle>
          <DialogDescription>
            Anchor-free moments — a conference, a field day, a news event.
            Pinned to the spot you clicked on the map.
          </DialogDescription>
        </DialogHeader>

        {/* Coords + reverse-geocode summary pill */}
        {coords && (
          <div className="flex items-start gap-2 rounded-md border border-fuchsia-500/30 bg-fuchsia-500/5 px-3 py-2 text-xs text-fuchsia-700 dark:text-fuchsia-300">
            <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <div className="font-medium">Pin location</div>
              <div className="opacity-80 tabular-nums">
                {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4 py-1">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="ev-new-title">Title</Label>
            <Input
              id="ev-new-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Conference, field day, news event…"
              disabled={create.isPending}
              autoFocus
            />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label htmlFor="ev-new-category">Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v ?? "company_event")}
              disabled={create.isPending}
            >
              <SelectTrigger id="ev-new-category" className="w-full">
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

          {/* Location (editable — pre-filled from reverse-geocode) */}
          <div className="space-y-1.5">
            <Label htmlFor="ev-new-location">Location</Label>
            <Input
              id="ev-new-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={300}
              placeholder="Where was this?"
              disabled={create.isPending}
            />
            <p className="text-[11px] text-muted-foreground">
              Pre-filled from the map pin. Tweak if you prefer a friendlier name.
            </p>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ev-new-start">Start date</Label>
              <Input
                id="ev-new-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={create.isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-new-end">
                End date{" "}
                <span className="text-muted-foreground font-normal">(opt)</span>
              </Label>
              <Input
                id="ev-new-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={create.isPending}
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="ev-new-description">
              Description{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="ev-new-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              disabled={create.isPending}
            />
          </div>

          {/* Metrics */}
          <div className="space-y-1.5">
            <Label htmlFor="ev-new-metrics">
              Metrics{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="ev-new-metrics"
              value={metrics}
              onChange={(e) => setMetrics(e.target.value)}
              maxLength={500}
              placeholder="e.g. 1.2k attendees · 3 talks"
              disabled={create.isPending}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={create.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => create.mutate()}
            disabled={!canSubmit}
          >
            {create.isPending && (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            )}
            Add event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Helpers (mirrored from event-edit-dialog.tsx; kept local to avoid
//             cross-importing private formatting functions) ─────────────

function todayLocalDateInput(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function dateInputToIso(value: string): string | null {
  if (!value) return null;
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
