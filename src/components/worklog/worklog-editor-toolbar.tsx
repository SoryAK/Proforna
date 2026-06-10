/**
 * WorklogEditorToolbar — small action row above the Tiptap editor that lets
 * the user insert custom worklog nodes (shift, mood, tag) and toggle basic
 * formatting (bold/italic/bullet list/heading-2).
 *
 * Kept in a separate file from WorklogEditor itself so the editor stays a
 * thin wiring shell (per Modularity Auditor). Receives the live `editor`
 * instance and the list of shifts available to the active worklog.
 */

"use client";

import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bold,
  Italic,
  List,
  Heading2,
  Clock,
  Smile,
  Hash,
  ChevronDown,
  Plus,
  BookmarkPlus,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { normalizeTagLabel } from "@/lib/worklog/tiptap/tag-mention";
import type { MoodValue } from "@/lib/worklog/tiptap/mood-block";
import { SLASH_COMMANDS, type SlashCommandItem } from "@/lib/worklog/tiptap/slash-commands";
import type { WorkShift } from "@/types/worklog";
import { VoiceDictationButton } from "@/components/worklog/voice/voice-dictation-button";

interface WorklogEditorToolbarProps {
  editor: Editor;
  shifts: WorkShift[];
  /** Overrides the slash command list shown in the Insert (+) menu. */
  slashCommands?: SlashCommandItem[];
  /**
   * WorkLog id — when provided, surfaces the "Save version" button
   * (ADR-0017 Phase 10). Optional so non-saving editor surfaces (if
   * any are added later) can mount the toolbar without it.
   */
  workLogId?: string;
}

const MOOD_OPTIONS: { value: MoodValue; label: string; emoji: string }[] = [
  { value: "good",    label: "Good",  emoji: "🙂" },
  { value: "neutral", label: "OK",    emoji: "😐" },
  { value: "tough",   label: "Tough", emoji: "😣" },
];

export function WorklogEditorToolbar({
  editor,
  shifts,
  slashCommands,
  workLogId,
}: WorklogEditorToolbarProps) {
  const [tagDraft, setTagDraft] = useState("");
  const commandList = slashCommands ?? SLASH_COMMANDS;
  const queryClient = useQueryClient();

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
    const raw = window.prompt(
      "Label this version (optional, max 80 chars):",
      "",
    );
    // Cancel → null. Empty string → unlabelled snapshot.
    if (raw === null) return;
    const trimmed = raw.trim();
    const label = trimmed.length === 0 ? null : trimmed.slice(0, 80);
    saveVersionMutation.mutate({ id: workLogId, label });
  }

  function insertShift(shift: WorkShift) {
    editor
      .chain()
      .focus()
      .insertShiftBlock({
        shiftId: shift.id,
        label: shift.name,
        startMinute: shift.startMinute,
        endMinute: shift.endMinute,
      })
      .run();
  }

  function insertMood(value: MoodValue) {
    editor.chain().focus().insertMoodBlock({ value }).run();
  }

  function commitTag(value: string) {
    const label = normalizeTagLabel(value);
    if (!label) return;
    editor.chain().focus().insertTag({ label }).run();
    setTagDraft("");
  }

  return (
    <div className="flex flex-wrap items-center gap-1 border-b pb-1.5 mb-2">
      {/* Formatting */}
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
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="Heading"
      >
        <Heading2 className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet list"
      >
        <List className="h-3.5 w-3.5" />
      </ToolbarBtn>

      <div className="w-px h-4 bg-border mx-1" />

      {/* Shift dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs">
              <Clock className="h-3.5 w-3.5" />
              Shift
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="w-56">
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Insert shift block</div>
          <DropdownMenuSeparator />
          {shifts.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No shifts on this position</div>
          ) : (
            shifts.map((s) => (
              <DropdownMenuItem key={s.id} onClick={() => insertShift(s)} className="text-xs">
                <Clock className="h-3 w-3 mr-2" />
                {s.name}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Mood dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs">
              <Smile className="h-3.5 w-3.5" />
              Mood
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="w-40">
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Insert mood block</div>
          <DropdownMenuSeparator />
          {MOOD_OPTIONS.map((m) => (
            <DropdownMenuItem key={m.value} onClick={() => insertMood(m.value)} className="text-xs">
              <span className="mr-2">{m.emoji}</span>
              {m.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Tag inline input */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs">
              <Hash className="h-3.5 w-3.5" />
              Tag
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="w-56 p-2">
          <div className="text-xs font-semibold text-muted-foreground pb-1">Insert tag</div>
          <Input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitTag(tagDraft);
              }
            }}
            placeholder="tag-label"
            className="h-7 text-xs"
            autoFocus
          />
          <div className="mt-1.5 text-[10px] text-muted-foreground">
            Tip: type <kbd className="px-1 rounded bg-muted">#word</kbd>+ space inline.
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Insert (slash-command fallback for mobile/no-keyboard) */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 gap-1 text-xs"
              title="Insert (same as typing /)"
            >
              <Plus className="h-3.5 w-3.5" />
              Insert
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="w-64">
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            Insert block
          </div>
          <DropdownMenuSeparator />
          {commandList.map((cmd) => {
            const Icon = cmd.icon;
            return (
              <DropdownMenuItem
                key={cmd.id}
                onClick={() => {
                  // Mirror slash-command behavior with an empty range so we
                  // just insert at the current selection instead of deleting
                  // a trigger query (there is none for the toolbar path).
                  const pos = editor.state.selection.from;
                  cmd.run({ editor, range: { from: pos, to: pos } });
                }}
                className="text-xs"
              >
                <Icon className="h-3 w-3 mr-2 opacity-70" />
                <span className="flex-1">{cmd.title}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="w-px h-4 bg-border mx-1" />

      {/* Voice dictation (Web Speech, Beta — Chrome/Edge only). */}
      <VoiceDictationButton
        className="h-7 w-7"
        onFinalChunk={(chunk) => editor.chain().focus().insertContent(`${chunk} `).run()}
      />

      {/* Save version (ADR-0017 Phase 10) — pinned manual snapshot of the
          current document. Only renders when a workLogId is bound. */}
      {workLogId && (
        <>
          <div className="w-px h-4 bg-border mx-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 gap-1 text-xs"
            onClick={handleSaveVersion}
            disabled={saveVersionMutation.isPending}
            title="Save a named snapshot of this note"
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
