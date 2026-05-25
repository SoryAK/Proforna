/**
 * CanvasNodeView — React-rendered NodeView for the `canvasBlock` Tiptap node.
 *
 * Inline view:
 *   - Header bar: PenLine icon + title + Edit button + Delete button
 *   - Body: CanvasThumbnail (TldrawImage static SVG) when snapshot exists,
 *     otherwise a placeholder prompting the user to draw.
 *   - Clicking the body opens the CanvasDialog.
 *
 * Edit flow:
 *   - CanvasDialog (full-screen Tldraw) opens on first insert (empty snapshot)
 *     and whenever the user clicks Edit.
 *   - Snapshot changes flow: dialog → onSnapshot → updateAttributes → Tiptap
 *     onUpdate → existing debounced autosave path.
 *
 * Both CanvasDialog and CanvasThumbnail are lazy-loaded (ssr: false) so the
 * ~1.5 MB tldraw bundle is not included in the initial page JS.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { PenLine, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CanvasNodeAttrs } from "@/lib/worklog/tiptap/canvas-node";

const CANVAS_PREVIEW_HEIGHT = 280;

// Both lazy-imported from the same module → single shared tldraw chunk.
const CanvasDialog = dynamic(
  () => import("@/components/worklog/canvas-dialog").then((m) => ({ default: m.CanvasDialog })),
  { ssr: false },
);

const CanvasThumbnail = dynamic(
  () =>
    import("@/components/worklog/canvas-dialog").then((m) => ({ default: m.CanvasThumbnail })),
  {
    ssr: false,
    loading: () => <div className="h-full w-full bg-muted/20 animate-pulse" />,
  },
);

// ─────────────────────────────────────────────────────────────────────────────

export function CanvasNodeView(props: NodeViewProps) {
  const { node, updateAttributes, deleteNode, selected, editor } = props;
  const attrs = node.attrs as CanvasNodeAttrs;
  const [dialogOpen, setDialogOpen] = useState(false);
  const editable = editor?.isEditable ?? true;

  // Auto-open the dialog when a fresh (empty) canvas node is inserted.
  useEffect(() => {
    if (editable && !attrs.snapshot) {
      setDialogOpen(true);
    }
    // Only on mount — intentionally omitting attrs.snapshot from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSnapshotChange = useCallback(
    (snapshot: string) => {
      updateAttributes({ snapshot });
    },
    [updateAttributes],
  );

  return (
    <NodeViewWrapper
      as="figure"
      className={cn(
        "my-3 rounded-lg border border-border overflow-hidden bg-background not-prose",
        selected && "ring-2 ring-primary ring-offset-1",
      )}
      data-canvas-id={attrs.canvasId}
    >
      {/* Header bar */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b bg-muted/30">
        <PenLine className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-muted-foreground flex-1 truncate">
          {attrs.title ?? "Canvas"}
        </span>
        {editable && (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 gap-1 text-xs"
              onMouseDown={(e) => {
                e.preventDefault();
                setDialogOpen(true);
              }}
              aria-label="Edit canvas"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onMouseDown={(e) => {
                e.preventDefault();
                deleteNode();
                // Node is gone after this tick; restore editor focus so slash
                // commands keep working without requiring a manual click.
                requestAnimationFrame(() => editor?.commands.focus());
              }}
              aria-label="Delete canvas"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </>
        )}
      </div>

      {/* Preview body — clicking opens the editor */}
      <div
        className={cn(
          "relative overflow-hidden bg-background",
          editable && "cursor-pointer",
        )}
        style={{ height: CANVAS_PREVIEW_HEIGHT }}
        onClick={editable ? () => setDialogOpen(true) : undefined}
        role={editable ? "button" : undefined}
        aria-label={editable ? "Open canvas editor" : undefined}
        tabIndex={editable ? 0 : undefined}
        onKeyDown={
          editable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setDialogOpen(true);
                }
              }
            : undefined
        }
      >
        {attrs.snapshot ? (
          <CanvasThumbnail snapshot={attrs.snapshot} className="w-full h-full object-contain" />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground select-none">
            <PenLine className="h-8 w-8 opacity-25" />
            <span className="text-sm">Click to start drawing</span>
          </div>
        )}
      </div>

      <CanvasDialog
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next);
          // Restore editor focus after dialog closes so the keyboard shortcut
          // guard (isContentEditable check) doesn't block the next "/" press.
          if (!next) {
            requestAnimationFrame(() => editor?.commands.focus());
          }
        }}
        snapshot={attrs.snapshot}
        canvasId={attrs.canvasId}
        title={attrs.title}
        onSnapshot={handleSnapshotChange}
      />
    </NodeViewWrapper>
  );
}
