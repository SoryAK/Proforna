/**
 * canvas-dialog.tsx
 *
 * Exports two components, both requiring tldraw (lazy-loaded by the importer):
 *
 *   CanvasDialog    — full-screen editing dialog wrapping <Tldraw>.
 *   CanvasThumbnail — lightweight static preview using <TldrawImage>.
 *
 * Both live in one module so they share the single tldraw bundle chunk
 * (Next.js dynamic() imports them from the same file).
 *
 * CSS: '@tldraw/tldraw/tldraw.css' is imported here so it only loads when
 * this module is first evaluated (i.e., when the canvas block mounts).
 * tldraw v5 scopes all its styles under `.tl-container`, so there is no
 * bleed into Tailwind or shadcn styles.
 */

"use client";

import { useCallback, useEffect, useRef } from "react";
import { Tldraw, TldrawImage } from "@tldraw/tldraw";
import type { Editor as TLEditor, TLStoreSnapshot } from "@tldraw/tldraw";
import "@tldraw/tldraw/tldraw.css";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseSnapshot } from "@/lib/worklog/parse-snapshot";

const SAVE_DEBOUNCE_MS = 800;

// ─────────────────────────────────────────────────────────────────────────────
// CanvasDialog
// ─────────────────────────────────────────────────────────────────────────────

export interface CanvasDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: string;
  canvasId: string;
  title: string | null;
  onSnapshot: (snapshot: string) => void;
}

export function CanvasDialog({
  open,
  onOpenChange,
  snapshot,
  title,
  onSnapshot,
}: CanvasDialogProps) {
  const editorRef = useRef<TLEditor | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flush any pending snapshot save on close so no changes are lost.
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
        const ed = editorRef.current;
        if (ed) {
          onSnapshot(JSON.stringify(ed.store.getSnapshot()));
        }
      }
      onOpenChange(next);
    },
    [onOpenChange, onSnapshot],
  );

  // Clear the debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleMount = useCallback(
    (ed: TLEditor) => {
      editorRef.current = ed;

      // Listen for user-originated document changes and debounce saves.
      const unsub = ed.store.listen(
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            onSnapshot(JSON.stringify(ed.store.getSnapshot()));
          }, SAVE_DEBOUNCE_MS);
        },
        { source: "user", scope: "document" },
      );

      return unsub;
    },
    [onSnapshot],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-full w-screen h-[100dvh] p-0 flex flex-col gap-0 rounded-none border-0">
        <DialogHeader className="flex flex-row items-center gap-2 px-4 py-2.5 border-b shrink-0">
          <DialogTitle className="text-sm font-semibold flex-1 truncate">
            {title ?? "Canvas"}
          </DialogTitle>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 shrink-0"
            onClick={() => handleOpenChange(false)}
            aria-label="Close canvas"
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        {/* tldraw fills the remaining height */}
        <div className="flex-1 min-h-0">
          <Tldraw
            key={open ? "open" : "closed"}
            snapshot={parseSnapshot(snapshot)}
            onMount={handleMount}
            autoFocus
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CanvasThumbnail
// ─────────────────────────────────────────────────────────────────────────────

export interface CanvasThumbnailProps {
  snapshot: string;
  className?: string;
}

export function CanvasThumbnail({ snapshot, className }: CanvasThumbnailProps) {
  const parsed = parseSnapshot(snapshot);
  if (!parsed) return null;

  return (
    <TldrawImage
      snapshot={parsed}
      background={false}
      className={className}
    />
  );
}
