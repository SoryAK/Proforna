/**
 * promote-to-event-dialog.tsx
 *
 * Promotion flow: Notable WorkLog → CareerEvent (Phase D).
 *
 * Steps:
 *   1. POST /api/work-history/{positionId}/events  → creates the CareerEvent
 *   2. PATCH /api/work-logs/{logId}               → writes promotedToCareerEventId back
 *
 * The dialog is pre-filled from the worklog (title, date) and lets the user
 * add a description, category, and metrics before confirming.
 */

"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trophy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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

const EVENT_CATEGORIES = [
  { value: "project",       label: "Project" },
  { value: "milestone",     label: "Milestone" },
  { value: "responsibility",label: "Responsibility" },
  { value: "training",      label: "Training" },
  { value: "outcome",       label: "Outcome" },
  { value: "context_shift", label: "Context Shift" },
] as const;

export interface PromoteToEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Worklog record being promoted */
  logId: string;
  logTitle: string;
  /** ISO date string from WorkLog.date */
  logDate: string;
  /** WorkLog.positionId — required because CareerEvent links to WorkHistory */
  positionId: string;
  /** Called after both API calls succeed, with the new CareerEvent id */
  onPromoted: (careerEventId: string) => void;
}

export function PromoteToEventDialog({
  open,
  onOpenChange,
  logId,
  logTitle,
  logDate,
  positionId,
  onPromoted,
}: PromoteToEventDialogProps) {
  const qc = useQueryClient();

  // Local form state — reset whenever the dialog opens with a new worklog.
  const [title, setTitle] = useState(logTitle);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("project");
  const [metrics, setMetrics] = useState("");

  useEffect(() => {
    if (open) {
      setTitle(logTitle);
      setDescription("");
      setCategory("project");
      setMetrics("");
    }
  }, [open, logTitle]);

  const promote = useMutation({
    mutationFn: async () => {
      // Step 1 — create the CareerEvent
      const evRes = await fetch(`/api/work-history/${positionId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          category,
          startDate: logDate,
          metrics: metrics.trim() || null,
        }),
      });
      if (!evRes.ok) {
        const msg = await evRes.text().catch(() => "Request failed");
        throw new Error(msg);
      }
      const event: { id: string } = await evRes.json();

      // Step 2 — write the event id back onto the worklog
      const wlRes = await fetch(`/api/work-logs/${logId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promotedToCareerEventId: event.id }),
      });
      if (!wlRes.ok) {
        const msg = await wlRes.text().catch(() => "Request failed");
        throw new Error(msg);
      }

      return event.id;
    },
    onSuccess: (eventId) => {
      toast.success("Promoted to career event");
      // Refresh both the worklog list and career-growth evidence section.
      qc.invalidateQueries({ queryKey: ["worklogs"] });
      qc.invalidateQueries({ queryKey: ["career-growth"] });
      onPromoted(eventId);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Promotion failed"),
  });

  const canSubmit = title.trim().length > 0 && !promote.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            Promote to career event
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="pte-title">Title</Label>
            <Input
              id="pte-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Led GCP Migration"
              maxLength={200}
              disabled={promote.isPending}
            />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label htmlFor="pte-category">Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v ?? "project")}
              disabled={promote.isPending}
            >
              <SelectTrigger id="pte-category" className="w-full">
                <SelectValue placeholder="Pick a category" />
              </SelectTrigger>
              <SelectContent>
                {EVENT_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="pte-description">
              Description{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="pte-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="STAR narrative, context, outcome…"
              rows={3}
              maxLength={2000}
              disabled={promote.isPending}
            />
          </div>

          {/* Metrics */}
          <div className="space-y-1.5">
            <Label htmlFor="pte-metrics">
              Metrics{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="pte-metrics"
              value={metrics}
              onChange={(e) => setMetrics(e.target.value)}
              placeholder="e.g. 200 services migrated, $2M cost saved"
              maxLength={500}
              disabled={promote.isPending}
            />
          </div>
        </div>

        <DialogFooter showCloseButton>
          <Button
            onClick={() => promote.mutate()}
            disabled={!canSubmit}
            className="gap-1.5"
          >
            <Trophy className="h-3.5 w-3.5" />
            {promote.isPending ? "Promoting…" : "Promote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
