/**
 * WorklogProcedureToolbar — toolbar shown above the editor when a worklog
 * is mounted with `kind=procedure` (ADR-0030 Unit 6).
 *
 * Procedure-specific actions:
 *   • Bold / Italic / Bullet list — formatting INSIDE a step body.
 *   • Toggle Tools                — add/remove the optional procedureTools.
 *   • Add step                    — append a new procedureStep.
 *   • Move step ↑ / ↓             — swap with neighbor (uses current selection).
 *   • Step title…                 — set the title attr of the step at cursor.
 *   • Save version                — same as the notes toolbar (ADR-0017).
 *
 * Why a separate toolbar (vs reusing WorklogEditorToolbar): the notes
 * toolbar surfaces shift, mood, tag — none of which are appropriate at
 * procedure top-level. Splitting the surface keeps each toolbar lean and
 * lets each evolve independently. (Per Modularity Auditor.)
 */

"use client";

import { useMemo, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bold,
  Italic,
  List,
  Wrench,
  Plus,
  ArrowUp,
  ArrowDown,
  PencilLine,
  BookmarkPlus,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface WorklogProcedureToolbarProps {
  editor: Editor;
  /**
   * WorkLog id — when provided, surfaces the "Save version" button
   * (ADR-0017 Phase 10). Optional so non-saving editor surfaces (if any
   * are added later) can mount the toolbar without it.
   */
  workLogId?: string;
}

/**
 * Find the index of the procedureStep that contains the current selection.
 * Returns -1 if the selection is not inside a procedureStep.
 *
 * Index is the 0-based position *among steps* (matching the visual
 * numbering and the procedure-transforms helper API), NOT the doc
 * content-index.
 */
function findActiveStepIndex(editor: Editor): number {
  const { selection, doc } = editor.state;
  const $pos = doc.resolve(selection.from);
  // Walk ancestors of the cursor to find the wrapping procedureStep.
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.name === "procedureStep") {
      const stepNode = $pos.node(depth);
      // Count preceding procedureStep siblings under the doc.
      let stepIdx = -1;
      let found = -1;
      doc.forEach((child) => {
        if (child.type.name === "procedureStep") {
          stepIdx += 1;
          if (child === stepNode) found = stepIdx;
        }
      });
      return found;
    }
  }
  return -1;
}

export function WorklogProcedureToolbar({
  editor,
  workLogId,
}: WorklogProcedureToolbarProps) {
  const [titleDialogOpen, setTitleDialogOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [draftLabel, setDraftLabel] = useState("");
  const queryClient = useQueryClient();

  // Recomputed cheaply on every render — Tiptap forces a re-render on
  // selection change so this naturally tracks the cursor.
  const activeStepIndex = useMemo(
    () => findActiveStepIndex(editor),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor.state.selection],
  );
  const stepCount = useMemo(() => {
    let n = 0;
    editor.state.doc.forEach((child) => {
      if (child.type.name === "procedureStep") n += 1;
    });
    return n;
  }, [editor.state.doc]);

  const hasTools = useMemo(() => {
    let found = false;
    editor.state.doc.forEach((child) => {
      if (child.type.name === "procedureTools") found = true;
    });
    return found;
  }, [editor.state.doc]);

  const saveVersionMutation = useMutation({
    mutationFn: async ({ id, label }: { id: string; label: string | null }) => {
      const res = await fetch(`/api/work-logs/${id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      if (!res.ok) throw new Error(`save version failed: ${res.status}`);
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["worklog-versions", vars.id] });
    },
  });

  function handleSaveVersion() {
    if (!workLogId) return;
    setDraftLabel("");
    setLabelDialogOpen(true);
  }

  function confirmSaveVersion() {
    if (!workLogId) return;
    const trimmed = draftLabel.trim();
    const label = trimmed.length === 0 ? null : trimmed.slice(0, 80);
    saveVersionMutation.mutate(
      { id: workLogId, label },
      {
        onSuccess: () => {
          setLabelDialogOpen(false);
        },
      },
    );
  }

  function openTitleDialog() {
    if (activeStepIndex < 0) return;
    // Pre-fill with the current step's title attr.
    let current: string | null = null;
    let i = -1;
    editor.state.doc.forEach((child) => {
      if (child.type.name === "procedureStep") {
        i += 1;
        if (i === activeStepIndex) current = child.attrs.title ?? null;
      }
    });
    setTitleDraft(current ?? "");
    setTitleDialogOpen(true);
  }

  function confirmStepTitle() {
    if (activeStepIndex < 0) {
      setTitleDialogOpen(false);
      return;
    }
    const trimmed = titleDraft.trim();
    editor
      .chain()
      .focus()
      .setProcedureStepTitle(activeStepIndex, trimmed.length === 0 ? null : trimmed)
      .run();
    setTitleDialogOpen(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-1 border-b pb-1.5 mb-2">
      {/* Formatting (inline marks) */}
      <ToolbarBtn
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold (Ctrl+B)"
      >
        <Bold className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic (Ctrl+I)"
      >
        <Italic className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet list"
      >
        <List className="h-3.5 w-3.5" />
      </ToolbarBtn>

      <div className="w-px h-4 bg-border mx-1" />

      {/* Procedure structural actions */}
      <Button
        type="button"
        variant={hasTools ? "secondary" : "ghost"}
        size="sm"
        className="h-7 px-2 gap-1 text-xs"
        title={hasTools ? "Remove Tools block" : "Add Tools block"}
        onClick={() => editor.chain().focus().toggleProcedureTools().run()}
      >
        <Wrench className="h-3.5 w-3.5" />
        Tools
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 gap-1 text-xs"
        title="Append a new step"
        onClick={() => editor.chain().focus().appendProcedureStep().run()}
      >
        <Plus className="h-3.5 w-3.5" />
        Step
      </Button>

      <div className="w-px h-4 bg-border mx-1" />

      {/* Per-step actions — disabled when cursor isn't inside a step. */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        title="Move step up"
        disabled={activeStepIndex <= 0}
        onClick={() =>
          editor.chain().focus().moveProcedureStepUp(activeStepIndex).run()
        }
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        title="Move step down"
        disabled={activeStepIndex < 0 || activeStepIndex >= stepCount - 1}
        onClick={() =>
          editor.chain().focus().moveProcedureStepDown(activeStepIndex).run()
        }
      >
        <ArrowDown className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 gap-1 text-xs"
        title="Edit step title"
        disabled={activeStepIndex < 0}
        onClick={openTitleDialog}
      >
        <PencilLine className="h-3.5 w-3.5" />
        Title
      </Button>

      {/* Save version (ADR-0017 Phase 10) — same affordance as notes
          toolbar, kept here so the procedure user has the same surface. */}
      {workLogId && (
        <>
          <div className="w-px h-4 bg-border mx-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 gap-1 text-xs"
            onClick={handleSaveVersion}
            disabled={saveVersionMutation.isPending}
            title="Save a named snapshot of this procedure"
          >
            {saveVersionMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <BookmarkPlus className="h-3.5 w-3.5" />
            )}
            Save version
          </Button>
        </>
      )}

      {/* Step-title dialog */}
      <Dialog
        open={titleDialogOpen}
        onOpenChange={setTitleDialogOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Step {activeStepIndex >= 0 ? activeStepIndex + 1 : ""} title
            </DialogTitle>
            <DialogDescription>
              Optional title shown after the step number (e.g. &ldquo;Step 3 &mdash;
              Inspect the box&rdquo;). Leave blank to clear.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={titleDraft}
            maxLength={120}
            placeholder="e.g. Inspect the box"
            onChange={(e) => setTitleDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                confirmStepTitle();
              }
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTitleDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmStepTitle}>Save title</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Label dialog — same Save Version dialog as the notes toolbar. */}
      <Dialog
        open={labelDialogOpen}
        onOpenChange={(open) => {
          if (!saveVersionMutation.isPending) setLabelDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save version</DialogTitle>
            <DialogDescription>
              Pin a snapshot of this procedure. Labels are optional (max 80
              chars).
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={draftLabel}
            maxLength={80}
            placeholder="Optional label (e.g. before refactor)"
            onChange={(e) => setDraftLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                confirmSaveVersion();
              }
            }}
            disabled={saveVersionMutation.isPending}
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setLabelDialogOpen(false)}
              disabled={saveVersionMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmSaveVersion}
              disabled={saveVersionMutation.isPending}
            >
              {saveVersionMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
              ) : null}
              Save snapshot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ToolbarBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="sm"
      className="h-7 w-7 p-0"
      title={title}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
