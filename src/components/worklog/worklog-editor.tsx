/**
 * WorklogEditor — Tiptap 3 rich editor backed by Y.js + IndexedDB.
 *
 * Phase 1b:
 *   • The Y.Doc keyed by `workLogId` is the source of truth in the browser.
 *   • IndexedDB persists every keystroke locally (offline-safe).
 *   • `onSave` is invoked (debounced) with both ProseMirror JSON and a
 *     plain-text projection so the parent can persist to the server.
 *   • On first mount, if the local Y.Doc is empty after IndexedDB sync, we
 *     seed it from `initialContentJson` (preferred) or `initialContent`
 *     (legacy plain-text fallback).
 *
 * Structure:
 *   <WorklogEditor>  — acquires the Y handle, waits for IndexedDB sync,
 *                      then mounts <EditorBody>. This split is necessary
 *                      because Tiptap 3's `useEditor` cannot accept `null`
 *                      options (it dereferences `options.immediatelyRender`
 *                      synchronously), so we must avoid calling it until
 *                      we have a real ydoc to bind to.
 *   <EditorBody>     — the Tiptap editor itself. Mounted exactly once per
 *                      sync cycle.
 */

"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Collaboration from "@tiptap/extension-collaboration";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import * as Y from "yjs";
import { prosemirrorJSONToYDoc } from "y-prosemirror";
import { getWorklogYHandle, type WorklogYHandle } from "@/lib/worklog/yjs-provider";
import {
  plainTextToProseMirrorDoc,
  proseMirrorDocToPlainText,
} from "@/lib/worklog/prosemirror-to-text";
import { ShiftBlock } from "@/lib/worklog/tiptap/shift-block";
import { MoodBlock } from "@/lib/worklog/tiptap/mood-block";
import { TagMention } from "@/lib/worklog/tiptap/tag-mention";
import { SlashCommands, SLASH_COMMANDS, type SlashCommandItem } from "@/lib/worklog/tiptap/slash-commands";
import { PhotoNode, type PhotoNodeAttrs } from "@/lib/worklog/tiptap/photo-node";
import { CanvasNode, type CanvasNodeAttrs } from "@/lib/worklog/tiptap/canvas-node";
import { MentionNode } from "@/lib/worklog/tiptap/mention-node";
import { createSlashCommandRender } from "@/components/worklog/slash-command-menu";
import { WorklogEditorToolbar } from "@/components/worklog/worklog-editor-toolbar";
import { uploadBodyPhoto, reconcileBodyPhotos } from "@/lib/worklog/photo-upload";
import { ImageIcon, PenLine } from "lucide-react";
import type { WorkShift } from "@/types/worklog";
import { cn } from "@/lib/utils";

// Module-level schema for seed-time conversion (`prosemirrorJSONToYDoc` needs
// the schema BEFORE the editor exists). We exclude Collaboration (no nodes/
// marks) and SlashCommands/Placeholder (no nodes/marks) since they don't
// contribute to the schema, and we exclude per-instance config so this can
// live at module scope.
const SCHEMA_EXTENSIONS = [
  StarterKit.configure({ undoRedo: false }),
  Link,
  ShiftBlock,
  MoodBlock,
  TagMention,
  TaskList,
  TaskItem.configure({ nested: true }),
  PhotoNode,
  CanvasNode,
  MentionNode,
];
const seedSchema = getSchema(SCHEMA_EXTENSIONS);

export interface WorklogEditorHandle {
  /** Flush the debounced save immediately (e.g. on Cmd+S or blur-of-shell). */
  flush: () => void;
  /** Focus the editor body. */
  focus: () => void;
}

export interface WorklogEditorChange {
  json: unknown;
  text: string;
}

export interface WorklogEditorProps {
  workLogId: string;
  initialContentJson?: unknown | null;
  initialContent?: string | null;
  placeholder?: string;
  className?: string;
  editable?: boolean;
  /** Debounce window for `onSave`. Defaults to 800ms to match other autosave fields. */
  debounceMs?: number;
  /** Shifts available for insertion via the editor toolbar's "Shift" menu. */
  shifts?: WorkShift[];
  onSave: (change: WorklogEditorChange) => void | Promise<unknown>;
  /** Optional: receive dirty/saving state for parent UI (badges, save button). */
  onStateChange?: (state: { dirty: boolean; saving: boolean }) => void;
}

export const WorklogEditor = forwardRef<WorklogEditorHandle, WorklogEditorProps>(function WorklogEditor(
  props,
  ref,
) {
  const { workLogId, className } = props;

  // Acquire the per-worklog Y handle once and release on unmount.
  const handleRef = useRef<WorklogYHandle | null>(null);
  if (handleRef.current === null) {
    handleRef.current = getWorklogYHandle(workLogId);
    handleRef.current.acquire();
  }
  const yHandle = handleRef.current;

  useEffect(() => {
    return () => {
      handleRef.current?.release();
      handleRef.current = null;
    };
  }, []);

  // Allow the parent to flush/focus even before the editor is mounted.
  const bodyRef = useRef<WorklogEditorHandle | null>(null);
  useImperativeHandle(
    ref,
    () => ({
      flush() {
        bodyRef.current?.flush();
      },
      focus() {
        bodyRef.current?.focus();
      },
    }),
    [],
  );

  // Wait for IndexedDB sync before mounting the editor, AND seed the Y.Doc
  // from server snapshot if local is empty. Mounting Tiptap against an
  // already-populated Y.Doc is the only reliable way to get Collaboration
  // to render content on first paint — trying to seed after mount races
  // with the y-prosemirror binding and was leaving the editor blank.
  const [ready, setReady] = useState(false);
  const initialContentJsonProp = props.initialContentJson ?? null;
  const initialContentProp = props.initialContent ?? null;
  // Latch the seed source on first render so a later parent re-render with
  // a fresh object identity for `contentJson` doesn't retrigger the effect.
  const seedSourceRef = useRef<{ json: unknown | null; text: string | null }>({
    json: initialContentJsonProp,
    text: initialContentProp,
  });
  useEffect(() => {
    let cancelled = false;
    void yHandle.synced.then(() => {
      if (cancelled) return;
      const fragment = yHandle.ydoc.getXmlFragment("default");

      // A previously-buggy mount could have written an empty paragraph
      // to IndexedDB, so `fragment.length === 0` is no longer a reliable
      // "needs seed" signal. Treat the fragment as empty when it has no
      // textual content (zero children OR only structural-empty nodes).
      const fragmentText = fragment.toString().replace(/<[^>]*>/g, "").trim();
      const fragmentEffectivelyEmpty = fragmentText.length === 0;

      const { json, text } = seedSourceRef.current;
      let seedDoc: unknown = null;
      if (json && typeof json === "object") {
        seedDoc = json;
      } else if (typeof text === "string" && text.length > 0) {
        seedDoc = plainTextToProseMirrorDoc(text);
      }

      if (fragmentEffectivelyEmpty && seedDoc) {
        try {
          // Wipe stale empty state in-memory before applying the seed,
          // so the merge doesn't keep the old empty paragraph alongside
          // the seeded content. We fire-and-forget `clearData()` since
          // it only matters for *future* loads — blocking on the IDB
          // transaction here adds visible latency to every open.
          yHandle.ydoc.transact(() => {
            if (fragment.length > 0) fragment.delete(0, fragment.length);
          });
          void yHandle.persistence.clearData().catch(() => {});

          const tempDoc = prosemirrorJSONToYDoc(
            seedSchema,
            seedDoc as Parameters<typeof prosemirrorJSONToYDoc>[1],
            "default",
          );
          Y.applyUpdate(yHandle.ydoc, Y.encodeStateAsUpdate(tempDoc));
          tempDoc.destroy();
        } catch (err) {
          console.warn("[worklog-editor] seed failed; starting empty", err);
        }
      }
      if (!cancelled) setReady(true);
    });
    // Safety net: never block the editor forever if IndexedDB hangs.
    // Keep this short — IDB sync is normally <50ms; anything longer is
    // almost certainly a hang, and we'd rather mount an empty editor
    // than show a loading state for seconds.
    const fallback = setTimeout(() => {
      if (!cancelled) setReady(true);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yHandle]);

  return (
    <div className={cn("worklog-editor", className)}>
      {ready ? (
        <EditorBody
          ref={bodyRef}
          yHandle={yHandle}
          workLogId={workLogId}
          placeholder={props.placeholder ?? "Start writing…"}
          editable={props.editable ?? true}
          debounceMs={props.debounceMs ?? 800}
          shifts={props.shifts ?? []}
          onSave={props.onSave}
          onStateChange={props.onStateChange}
        />
      ) : (
        <div className="min-h-[6rem]" aria-hidden />
      )}
    </div>
  );
});

interface EditorBodyProps {
  yHandle: WorklogYHandle;
  workLogId: string;
  placeholder: string;
  editable: boolean;
  debounceMs: number;
  shifts: WorkShift[];
  onSave: (change: WorklogEditorChange) => void | Promise<unknown>;
  onStateChange?: (state: { dirty: boolean; saving: boolean }) => void;
}

const EditorBody = forwardRef<WorklogEditorHandle, EditorBodyProps>(function EditorBody(
  { yHandle, workLogId, placeholder, editable, debounceMs, shifts, onSave, onStateChange },
  ref,
) {
  // Stable refs for callbacks so the editor isn't recreated when parent re-renders.
  const onSaveRef = useRef(onSave);
  const onStateRef = useRef(onStateChange);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);
  useEffect(() => {
    onStateRef.current = onStateChange;
  }, [onStateChange]);

  const debouncedSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  // Hidden file input shared by /photo and Insert (+).
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Where to insert the next picked file. Captured at pick time so the
  // selection cannot drift between click and file-chooser dismissal.
  const pendingInsertRef = useRef<{ from: number; to: number } | null>(null);
  // Stable handle to the live editor so paste/drop callbacks (declared
  // inside useEditor before `editor` exists) can call commands on it.
  const editorRef = useRef<Editor | null>(null);

  function emitState() {
    onStateRef.current?.({ dirty: dirtyRef.current, saving: savingRef.current });
  }

  /** Walk the doc collecting bodyPhotoIds so reconcile can prune orphans. */
  function collectBodyPhotoIds(targetEditor: Editor): string[] {
    const ids: string[] = [];
    targetEditor.state.doc.descendants((node) => {
      if (node.type.name === "photo") {
        const id = (node.attrs as PhotoNodeAttrs).photoId;
        if (id) ids.push(id);
      }
    });
    return ids;
  }

  /**
   * Upload `file` and insert the resulting PhotoNode at `range`. If `range`
   * is null the node is inserted at the current selection. Used by paste,
   * drop, /photo, and the Insert (+) toolbar.
   */
  async function uploadAndInsertPhoto(
    targetEditor: Editor,
    file: File,
    range: { from: number; to: number } | null,
  ) {
    try {
      const uploaded = await uploadBodyPhoto(workLogId, file);
      const attrs: PhotoNodeAttrs = {
        photoId: uploaded.id,
        src: uploaded.src,
        alt: file.name,
        width: uploaded.width,
        height: uploaded.height,
        caption: null,
      };
      const chain = targetEditor.chain().focus();
      if (range) chain.deleteRange(range);
      chain.insertContent({ type: "photo", attrs }).run();
    } catch (err) {
      // Surface the server's reason (cap exceeded, MIME, size, etc.) without
      // crashing the editor. Future: wire to a toast system.
      console.error("[worklog photo upload]", err);
      if (typeof window !== "undefined") {
        window.alert(err instanceof Error ? err.message : "Photo upload failed");
      }
    }
  }

  /** Open the OS file picker; on selection, upload + insert at `range`. */
  function pickAndInsertPhoto(range: { from: number; to: number } | null) {
    const input = fileInputRef.current;
    if (!input) return;
    pendingInsertRef.current = range;
    input.value = ""; // allow re-picking the same file
    input.click();
  }

  // Inject /photo into the slash menu and the Insert (+) toolbar so the
  // picker logic stays colocated with the editor that owns `workLogId`.
  const slashCommandsWithPhoto: SlashCommandItem[] = [
    ...SLASH_COMMANDS,
    {
      id: "photo",
      title: "Photo",
      description: "Embed an image inline (max 20 per note)",
      icon: ImageIcon,
      searchTerms: ["photo", "image", "picture", "screenshot", "img"],
      run: ({ range }) => {
        pickAndInsertPhoto(range);
      },
    },
    {
      id: "canvas",
      title: "Canvas",
      description: "Draw a freehand diagram or whiteboard",
      icon: PenLine,
      searchTerms: ["canvas", "draw", "whiteboard", "diagram", "sketch", "freehand"],
      run: ({ editor: ed, range }) => {
        const attrs: CanvasNodeAttrs = {
          canvasId: crypto.randomUUID(),
          snapshot: "",
          title: null,
        };
        ed.chain().deleteRange(range).insertCanvasBlock(attrs).run();
      },
    },
  ];

  async function runSave(payload: WorklogEditorChange) {
    if (debouncedSaveRef.current) {
      clearTimeout(debouncedSaveRef.current);
      debouncedSaveRef.current = null;
    }
    savingRef.current = true;
    emitState();
    try {
      await onSaveRef.current(payload);
      dirtyRef.current = false;
    } finally {
      savingRef.current = false;
      emitState();
    }
  }

  const editor = useEditor(
    {
      extensions: [
        // Collaboration replaces Tiptap's built-in undo/redo with Y.js history.
        StarterKit.configure({
          undoRedo: false,
        }),
        Placeholder.configure({ placeholder }),
        Link.configure({
          openOnClick: false,
          autolink: true,
          protocols: ["http", "https", "mailto"],
          HTMLAttributes: {
            rel: "noopener noreferrer nofollow",
            target: "_blank",
          },
        }),
        Collaboration.configure({
          document: yHandle.ydoc,
          field: "default",
        }),
        ShiftBlock,
        MoodBlock,
        TagMention,
        TaskList,
        TaskItem.configure({ nested: true }),
        PhotoNode,
        CanvasNode,
        MentionNode.configure({ currentLogId: workLogId }),
        SlashCommands.configure({
          render: createSlashCommandRender(),
          items: slashCommandsWithPhoto,
        }),
      ],
      editable,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: cn(
            "prose prose-sm dark:prose-invert max-w-none focus:outline-none",
            "min-h-[140px] px-2 py-1 leading-relaxed",
          ),
        },
        handlePaste(view, event) {
          const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
          if (files.length === 0) return false;
          const ed = editorRef.current;
          if (!ed) return false;
          event.preventDefault();
          for (const file of files) void uploadAndInsertPhoto(ed, file, null);
          return true;
        },
        handleDrop(view, event) {
          const dt = event.dataTransfer;
          if (!dt) return false;
          const files = Array.from(dt.files ?? []).filter((f) => f.type.startsWith("image/"));
          if (files.length === 0) return false;
          const ed = editorRef.current;
          if (!ed) return false;
          event.preventDefault();
          const dropPos = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (dropPos) ed.chain().focus().setTextSelection(dropPos.pos).run();
          for (const file of files) void uploadAndInsertPhoto(ed, file, null);
          return true;
        },
      },
      onUpdate({ editor }: { editor: Editor }) {
        dirtyRef.current = true;
        emitState();
        if (debouncedSaveRef.current) clearTimeout(debouncedSaveRef.current);
        debouncedSaveRef.current = setTimeout(() => {
          void runSave({ json: editor.getJSON(), text: editor.getText() });
        }, debounceMs);
      },
    },
    // Only re-create the editor if the worklog identity changes.
    [workLogId],
  );

  // Track the live editor for paste/drop/photo callbacks. Seeding now
  // happens BEFORE this component mounts (in the outer <WorklogEditor>),
  // so by the time `useEditor` runs the Y.Doc is already populated and
  // Collaboration renders content on first paint.
  useEffect(() => {
    if (!editor) return;
    editorRef.current = editor;
    return () => {
      if (editorRef.current === editor) editorRef.current = null;
    };
  }, [editor]);

  // Flush pending debounce on unmount so an in-flight edit is not lost.
  // Also reconcile body photos so any images the user removed before
  // closing the note become free disk space.
  useEffect(() => {
    return () => {
      if (debouncedSaveRef.current) {
        clearTimeout(debouncedSaveRef.current);
        debouncedSaveRef.current = null;
      }
      const ed = editorRef.current;
      if (ed && !ed.isDestroyed) {
        const keep = collectBodyPhotoIds(ed);
        void reconcileBodyPhotos(workLogId, keep);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      flush() {
        if (!editor) return;
        if (dirtyRef.current) {
          void runSave({ json: editor.getJSON(), text: editor.getText() });
        }
        // Best-effort photo cleanup on every explicit flush (e.g. Cmd+S).
        const keep = collectBodyPhotoIds(editor);
        void reconcileBodyPhotos(workLogId, keep);
      },
      focus() {
        editor?.commands.focus();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor],
  );

  if (!editor) {
    return <div className="px-2 py-3 text-xs text-muted-foreground">Loading editor…</div>;
  }

  return (
    <>
      {editable && (
        <WorklogEditorToolbar
          editor={editor}
          shifts={shifts}
          slashCommands={slashCommandsWithPhoto}
        />
      )}
      <EditorContent editor={editor} />
      {/* Hidden picker shared by /photo and Insert (+). Lives in the React
          tree so its onChange has access to the `pendingInsertRef` closure. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const range = pendingInsertRef.current;
          pendingInsertRef.current = null;
          if (!file || !editor) return;
          void uploadAndInsertPhoto(editor, file, range);
        }}
      />
    </>
  );
});

// Re-export the plain-text projection so callers (e.g. QuickCapture in 1c)
// can derive a `content` string from any editor JSON without re-importing.
export { proseMirrorDocToPlainText };
