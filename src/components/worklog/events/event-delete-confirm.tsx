/**
 * EventDeleteConfirm — destructive-action confirm Dialog for a single
 * CareerEvent (ADR-0027 Day 3 Cycle B).
 *
 * Why a Dialog instead of `window.confirm`: React 19 + Next.js 16 throws
 * on synchronous blocking dialogs (see user-memory: "window.prompt /
 * window.confirm BLOCKED"). Every destructive confirm in this repo uses
 * a real Dialog with explicit Cancel + Delete buttons.
 *
 * Route selection mirrors EventEditDialog via `eventPatchUrl`:
 *   • floating → DELETE /api/events/[id]
 *   • anchored → DELETE /api/work-history/[whId]/events/[id]
 *
 * After success the cache key `["career-events", "all"]` (shared with
 * sidebar + list view) is invalidated and `onDeleted` fires so the
 * parent can close any open edit dialog and clear its row selection.
 */

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { eventPatchUrl } from "./event-edit-dialog";

export interface DeletableEvent {
  id: string;
  workHistoryId: string | null;
  title: string;
}

interface EventDeleteConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: DeletableEvent | null;
  /** Fires after a successful delete. Parent typically closes both this
   *  dialog and the edit dialog. */
  onDeleted?: () => void;
}

export function EventDeleteConfirm({
  open,
  onOpenChange,
  event,
  onDeleted,
}: EventDeleteConfirmProps) {
  const qc = useQueryClient();

  const remove = useMutation({
    mutationFn: async () => {
      if (!event) throw new Error("No event in scope");
      const url = eventPatchUrl(event);
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `DELETE failed (${res.status})`);
      }
      return res.json().catch(() => ({ deleted: true }));
    },
    onSuccess: () => {
      toast.success("Event deleted");
      qc.invalidateQueries({ queryKey: ["career-events", "all"] });
      qc.invalidateQueries({ queryKey: ["career-growth"] });
      onDeleted?.();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Delete failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Delete this event?
          </DialogTitle>
          <DialogDescription>
            This permanently removes the event{" "}
            {event ? (
              <strong className="text-foreground">&ldquo;{event.title}&rdquo;</strong>
            ) : (
              "selected"
            )}
            , including any linked skills and photos. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={remove.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => remove.mutate()}
            disabled={remove.isPending || event === null}
          >
            {remove.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Delete event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
