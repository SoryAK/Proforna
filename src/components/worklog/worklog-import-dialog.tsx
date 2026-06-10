"use client";

/**
 * WorklogImportDialog — drag-and-drop / file-picker wizard for the Sprint 4
 * note-import flow. POSTs each selected file sequentially to
 * /api/work-logs/import, surfaces per-file status (queued → uploading →
 * succeeded / deduped / failed / unsupported / too-large), and offers a
 * direct link to the created WorkLog reader.
 *
 * Design choices (per Sprint 4 plan):
 *   - Hybrid auto-start (Q1=C): drops start uploading immediately, but the
 *     folder picker locks after the first upload begins.
 *   - Session-only history (Q3=A): rows are state, not persisted.
 *   - Client-side 5 MB cap mirrors the server (so the user gets a fast,
 *     local rejection instead of a 413 round-trip).
 *   - Sprint 5: clipboard paste (Cmd/Ctrl+V) while the dialog is open
 *     synthesizes a File from text/html or text/plain (or text/markdown)
 *     payloads and feeds it through the existing ingestFiles pipeline so the
 *     row/status state machine is reused as-is.
 *
 * Out of scope for this dialog: cancel-mid-flight, progress bars per file,
 * image-paste / OCR (parked — see docs/parked-ideas), bulk-retry of failed rows.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  FileText,
  Loader2,
  RefreshCcw,
  Upload,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useWorklogFolders } from "@/components/worklog/hooks/use-worklog-folders";
import { fileToSource } from "@/lib/worklog/import/file-to-source";
import { clipboardToSource } from "@/lib/worklog/import/clipboard-to-source";
import {
  ImportRequestError,
  useImportMutation,
} from "@/lib/worklog/import/use-import-mutation";

interface WorklogImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ACCEPT = ".md,.markdown,.html,.htm,text/markdown,text/html";
const CLIENT_SIZE_CAP = 5 * 1024 * 1024; // 5 MB — mirrors server cap
const UNFILED_VALUE = "__unfiled__"; // Select cannot use null/empty string as a value

type RowStatus =
  | "queued"
  | "uploading"
  | "succeeded"
  | "deduped"
  | "reimported"
  | "conflict"
  | "needs-picker"
  | "not-found"
  | "failed"
  | "unsupported"
  | "too-large";

type ImportRow = {
  id: string;
  filename: string;
  size: number;
  status: RowStatus;
  workLogId: string | null;
  message: string | null;
};

function statusBadgeClass(status: RowStatus): string {
  switch (status) {
    case "queued":
      return "text-muted-foreground";
    case "uploading":
      return "text-blue-600 dark:text-blue-400";
    case "succeeded":
    case "reimported":
      return "text-emerald-600 dark:text-emerald-400";
    case "deduped":
    case "conflict":
    case "needs-picker":
    case "not-found":
      return "text-amber-600 dark:text-amber-400";
    case "failed":
      return "text-rose-600 dark:text-rose-400";
    case "unsupported":
      return "text-rose-600 dark:text-rose-400";
    case "too-large":
      return "text-rose-600 dark:text-rose-400";
  }
}

function statusLabel(status: RowStatus): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "uploading":
      return "Uploading…";
    case "succeeded":
      return "Imported";
    case "deduped":
      return "Already imported";
    case "reimported":
      return "Re-imported";
    case "conflict":
      return "Conflict — note changed since export";
    case "needs-picker":
      return "Couldn’t auto-link — missing identity";
    case "not-found":
      return "Original note not found";
    case "failed":
      return "Failed";
    case "unsupported":
      return "Unsupported file";
    case "too-large":
      return "Too large (>5 MB)";
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

let rowCounter = 0;
function nextRowId(): string {
  rowCounter += 1;
  return `row-${rowCounter}`;
}

/**
 * Cheap client-side check for grill-me frontmatter.
 *
 * The exporter writes a YAML block fenced by `---` lines containing both
 * `id:` and `version:` keys. We discriminate on those two markers so we
 * can route the file to the re-import endpoint instead of the regular
 * note-import endpoint. False positives are harmless — the server
 * re-validates and falls back to `needs-picker` if the frontmatter is
 * malformed.
 */
function hasGrillFrontmatter(source: string): boolean {
  const head = source.startsWith("\uFEFF") ? source.slice(1) : source;
  if (!head.startsWith("---\n") && !head.startsWith("---\r\n")) return false;
  const fenceEnd = head.indexOf("\n---", 4);
  if (fenceEnd === -1) return false;
  const block = head.slice(4, fenceEnd);
  return /^\s*id\s*:/m.test(block) && /^\s*version\s*:/m.test(block);
}

type ImportMdResponse =
  | { status: "imported"; workLogId: string; snapshotCreated: boolean }
  | {
      status: "conflict";
      workLogId: string;
      fileVersion: number;
      currentVersion: number;
    }
  | { status: "needs-picker"; reason: string }
  | { status: "not-found"; attemptedId: string };

export function WorklogImportDialog({ open, onOpenChange }: WorklogImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [folderId, setFolderId] = useState<string>(UNFILED_VALUE);
  const [isDragging, setIsDragging] = useState(false);

  const { folders } = useWorklogFolders();
  const importMutation = useImportMutation();
  const queryClient = useQueryClient();

  // Folder picker locks the moment the first upload starts (Q1=C: hybrid).
  const folderLocked = useMemo(
    () => rows.some((r) => r.status !== "queued"),
    [rows],
  );
  const successCount = useMemo(
    () => rows.filter((r) => r.status === "succeeded").length,
    [rows],
  );
  const reimportedCount = useMemo(
    () => rows.filter((r) => r.status === "reimported").length,
    [rows],
  );
  const dedupedCount = useMemo(
    () => rows.filter((r) => r.status === "deduped").length,
    [rows],
  );
  const reviewCount = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.status === "conflict" ||
          r.status === "needs-picker" ||
          r.status === "not-found",
      ).length,
    [rows],
  );
  const failedCount = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.status === "failed" ||
          r.status === "unsupported" ||
          r.status === "too-large",
      ).length,
    [rows],
  );

  // Reset everything when the dialog closes — Q3=A, session-only history.
  useEffect(() => {
    if (!open) {
      setRows([]);
      setFolderId(UNFILED_VALUE);
      setIsDragging(false);
    }
  }, [open]);

  const uploadRow = useCallback(
    async (row: ImportRow, file: File) => {
      // Locally short-circuit unsupported + too-large so we don't waste a round-trip.
      if (file.size > CLIENT_SIZE_CAP) {
        setRows((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, status: "too-large" } : r)),
        );
        return;
      }

      const payload = await fileToSource(file);
      if (!payload.sourceType) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  status: "unsupported",
                  message: "Only .md, .markdown, .html, and .htm files are supported.",
                }
              : r,
          ),
        );
        return;
      }

      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, status: "uploading" } : r)),
      );

      // Grill Me re-import path. When the file has grill-me frontmatter
      // (`id` + `version` in the YAML head), route to /api/work-logs/import-md
      // instead of the regular note-import endpoint. The new endpoint
      // handles four outcomes: imported / conflict / needs-picker / not-found.
      if (
        payload.sourceType === "markdown" &&
        hasGrillFrontmatter(payload.source)
      ) {
        try {
          const res = await fetch("/api/work-logs/import-md", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source: payload.source }),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(text || `Import failed (${res.status})`);
          }
          const data = (await res.json()) as ImportMdResponse;
          if (data.status === "imported") {
            // Success — invalidate the worklogs cache so the editor / list
            // pick up the freshly-written contentJson.
            queryClient.invalidateQueries({ queryKey: ["work-logs"] });
            queryClient.invalidateQueries({
              queryKey: ["worklog-versions", data.workLogId],
            });
            setRows((prev) =>
              prev.map((r) =>
                r.id === row.id
                  ? {
                      ...r,
                      status: "reimported",
                      workLogId: data.workLogId,
                      message: null,
                    }
                  : r,
              ),
            );
          } else if (data.status === "conflict") {
            setRows((prev) =>
              prev.map((r) =>
                r.id === row.id
                  ? {
                      ...r,
                      status: "conflict",
                      workLogId: data.workLogId,
                      message: `Server is at v${data.currentVersion}, file is at v${data.fileVersion}. Open the note to compare, then re-export and try again.`,
                    }
                  : r,
              ),
            );
          } else if (data.status === "needs-picker") {
            setRows((prev) =>
              prev.map((r) =>
                r.id === row.id
                  ? {
                      ...r,
                      status: "needs-picker",
                      message:
                        "This file has no Grill Me identity — it can’t be auto-linked back to a worklog.",
                    }
                  : r,
              ),
            );
          } else if (data.status === "not-found") {
            setRows((prev) =>
              prev.map((r) =>
                r.id === row.id
                  ? {
                      ...r,
                      status: "not-found",
                      message:
                        "The original worklog wasn’t found in your library. It may have been deleted.",
                    }
                  : r,
              ),
            );
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Re-import error.";
          setRows((prev) =>
            prev.map((r) =>
              r.id === row.id ? { ...r, status: "failed", message } : r,
            ),
          );
        }
        return;
      }

      try {
        const result = await importMutation.mutateAsync({
          sourceType: payload.sourceType,
          source: payload.source,
          sourceFilename: payload.sourceFilename,
          folderId: folderId === UNFILED_VALUE ? null : folderId,
        });
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  status: result.outcome === "created" ? "succeeded" : "deduped",
                  workLogId: result.workLog.id,
                  message: null,
                }
              : r,
          ),
        );
      } catch (err) {
        const message =
          err instanceof ImportRequestError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Unknown import error.";
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id ? { ...r, status: "failed", message } : r,
          ),
        );
      }
    },
    [folderId, importMutation, queryClient],
  );

  const ingestFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;

      const newRows: ImportRow[] = list.map((f) => ({
        id: nextRowId(),
        filename: f.name,
        size: f.size,
        status: "queued" as const,
        workLogId: null,
        message: null,
      }));

      setRows((prev) => [...prev, ...newRows]);

      // Kick off uploads sequentially so we don't hammer the API / hit
      // dedupe races across two parallel uploads of the same file.
      (async () => {
        for (let i = 0; i < newRows.length; i += 1) {
          await uploadRow(newRows[i], list[i]);
        }
      })();
    },
    [uploadRow],
  );

  // ── drag-and-drop wiring ───────────────────────────────────
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => {
    // Only leave when the pointer actually exits the dropzone bounds.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsDragging(false);
  }, []);
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const dt = e.dataTransfer;
      if (dt?.files?.length) ingestFiles(dt.files);
    },
    [ingestFiles],
  );

  // ── clipboard paste wiring (Sprint 5) ──────────────────────
  // Listens at the DialogContent level so it only fires while the dialog is
  // open. Pasted files (e.g. dragged-then-copied) reuse the same FileList
  // path as drop. Pasted text/html or text/plain is synthesized into a
  // virtual File so the row/status pipeline is identical to a drop.
  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const cb = e.clipboardData;
      if (!cb) return;

      // Real files in the clipboard (e.g. file-manager copy) → existing path.
      if (cb.files && cb.files.length > 0) {
        e.preventDefault();
        ingestFiles(cb.files);
        return;
      }

      const payload = clipboardToSource(cb);
      if (!payload) return; // nothing usable — let default behavior continue
      e.preventDefault();

      // Synthesize a File so ingestFiles → fileToSource discriminates on the
      // synthesized filename extension (matches clipboardToSource's decision).
      const mime =
        payload.sourceType === "markdown" ? "text/markdown" : "text/html";
      const fake = new File([payload.source], payload.sourceFilename, {
        type: mime,
      });
      ingestFiles([fake]);
    },
    [ingestFiles],
  );

  const browseClick = () => fileInputRef.current?.click();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {/* onPaste lives on a wrapper div because base-ui's DialogContent
            does not forward arbitrary DOM event props to its underlying
            Popup element (Sprint 5 bug surfaced during smoke testing). */}
        <div onPaste={onPaste} className="contents">
        <DialogHeader>
          <DialogTitle>Import notes</DialogTitle>
          <DialogDescription>
            Drop Markdown (.md, .markdown) or HTML (.html, .htm) files, or paste
            text/HTML from your clipboard. Each file becomes a worklog note.
            Files exported with “Grill Me” are auto-detected and re-imported
            into their original note (canvas blocks are stripped — mentions
            are re-resolved).
          </DialogDescription>
        </DialogHeader>

        {/* Folder picker — locks after the first upload starts. */}
        <div className="flex items-center gap-3">
          <label
            htmlFor="import-folder"
            className="text-sm font-medium text-foreground"
          >
            Folder
          </label>
          <Select
            value={folderId}
            onValueChange={(v) => setFolderId(v ?? UNFILED_VALUE)}
            disabled={folderLocked}
          >
            <SelectTrigger id="import-folder" className="w-[260px]">
              {/* Base-UI Select.Value renders the raw `value` by default — which
                  for our Unfiled row leaks the placeholder string "__unfiled__"
                  into the trigger. Map the value back to its human label here. */}
              <SelectValue>
                {(value) =>
                  value === UNFILED_VALUE
                    ? "Unfiled"
                    : folders.find((f) => f.id === value)?.name ?? "Unfiled"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNFILED_VALUE}>Unfiled</SelectItem>
              {folders.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {folderLocked && (
            <span className="text-xs text-muted-foreground">
              Locked after first upload
            </span>
          )}
        </div>

        {/* Dropzone */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={browseClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              browseClick();
            }
          }}
          className={cn(
            "rounded-md border border-dashed px-4 py-6 text-sm",
            "flex items-center justify-center gap-3 cursor-pointer",
            "transition-colors",
            isDragging
              ? "border-primary bg-primary/5 text-foreground"
              : "border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/60 hover:text-foreground",
          )}
        >
          <Upload className="h-4 w-4" aria-hidden />
          <span>
            Drop files here,{" "}
            <span className="text-foreground underline underline-offset-2">
              browse
            </span>
            , or paste (⌘V) from your clipboard
          </span>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) ingestFiles(e.target.files);
              // Reset so re-selecting the same file re-fires onChange.
              e.target.value = "";
            }}
          />
        </div>

        {/* File rows */}
        {rows.length > 0 && (
          <ul className="max-h-[300px] overflow-y-auto divide-y rounded-md border bg-card text-card-foreground">
            {rows.map((row) => (
              <ImportRowItem key={row.id} row={row} onCloseDialog={() => onOpenChange(false)} />
            ))}
          </ul>
        )}

        {/* Summary line */}
        {rows.length > 0 && (
          <div className="text-xs text-muted-foreground flex items-center gap-3">
            <span>{rows.length} file{rows.length === 1 ? "" : "s"}</span>
            {successCount > 0 && (
              <span className="text-emerald-600 dark:text-emerald-400">
                {successCount} imported
              </span>
            )}
            {reimportedCount > 0 && (
              <span className="text-emerald-600 dark:text-emerald-400">
                {reimportedCount} re-imported
              </span>
            )}
            {dedupedCount > 0 && (
              <span className="text-amber-600 dark:text-amber-400">
                {dedupedCount} duplicate{dedupedCount === 1 ? "" : "s"}
              </span>
            )}
            {reviewCount > 0 && (
              <span className="text-amber-600 dark:text-amber-400">
                {reviewCount} need{reviewCount === 1 ? "s" : ""} review
              </span>
            )}
            {failedCount > 0 && (
              <span className="text-rose-600 dark:text-rose-400">
                {failedCount} failed
              </span>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {rows.length === 0 ? "Cancel" : "Close"}
          </Button>
        </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── per-row sub-component ────────────────────────────────────

interface ImportRowItemProps {
  row: ImportRow;
  onCloseDialog: () => void;
}

function ImportRowItem({ row, onCloseDialog }: ImportRowItemProps) {
  const [showError, setShowError] = useState(false);
  const Icon = iconForStatus(row.status);

  return (
    <li className="flex items-start gap-3 px-3 py-2 text-sm">
      <Icon
        className={cn(
          "h-4 w-4 mt-0.5 shrink-0",
          row.status === "uploading"
            ? "animate-spin text-blue-600 dark:text-blue-400"
            : statusBadgeClass(row.status),
        )}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-foreground">{row.filename}</span>
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
            {formatBytes(row.size)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className={cn("font-medium", statusBadgeClass(row.status))}>
            {statusLabel(row.status)}
          </span>
          {row.workLogId && (
            <Link
              href={`/worklog/notes/${row.workLogId}`}
              onClick={onCloseDialog}
              className="text-primary underline underline-offset-2"
            >
              Open
            </Link>
          )}
          {row.status === "failed" && row.message && (
            <button
              type="button"
              onClick={() => setShowError((v) => !v)}
              className="text-muted-foreground underline underline-offset-2"
            >
              {showError ? "Hide error" : "Show error"}
            </button>
          )}
        </div>
        {showError && row.message && (
          <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs text-rose-600 dark:text-rose-400">
            {row.message}
          </pre>
        )}
        {(row.status === "unsupported" ||
          row.status === "too-large" ||
          row.status === "conflict" ||
          row.status === "needs-picker" ||
          row.status === "not-found") &&
          row.message && (
            <p className="mt-1 text-xs text-muted-foreground">{row.message}</p>
          )}
      </div>
    </li>
  );
}

function iconForStatus(status: RowStatus) {
  switch (status) {
    case "uploading":
      return Loader2;
    case "succeeded":
      return CheckCircle2;
    case "reimported":
      return RefreshCcw;
    case "deduped":
      return Copy;
    case "conflict":
    case "needs-picker":
    case "not-found":
      return AlertCircle;
    case "failed":
    case "unsupported":
    case "too-large":
      return AlertCircle;
    case "queued":
    default:
      return FileText;
  }
}
