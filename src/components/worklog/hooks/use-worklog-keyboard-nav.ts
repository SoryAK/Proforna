/**
 * useWorklogKeyboardNav — global keyboard shortcuts + cross-pane focus
 * helpers for the worklog 3-pane shell.
 *
 * Shortcuts (non-typing context):
 *   • `/`                              → focus search input
 *   • `n`                              → new blank note
 *   • `j` / `k`                        → next / prev note in visible list
 *
 * Shortcuts (always-on):
 *   • Cmd/Ctrl+S                       → flush autosave
 *   • Cmd/Ctrl+Shift+ArrowRight/Left   → cycle pane focus (rail → list → view)
 *
 * Exposes `focusPane(target)` so the orchestrator can hand off focus on
 * "activate" actions (e.g. Enter on a rail row → focus the list).
 */

import { useCallback, useEffect, type RefObject } from "react";
import type { WorkLog } from "@/types/worklog";
import type { WorklogNoteReaderHandle } from "@/components/worklog/worklog-note-reader";

type PaneId = "rail" | "list" | "view";
const PANE_ORDER: PaneId[] = ["rail", "list", "view"];

interface UseWorklogKeyboardNavArgs {
  /** Pane container refs (used by detectActivePane + focusPane). */
  railPaneRef: RefObject<HTMLDivElement | null>;
  listPaneRef: RefObject<HTMLDivElement | null>;
  viewPaneRef: RefObject<HTMLDivElement | null>;
  /** Search input ref — `/` focuses it. */
  searchInputRef: RefObject<HTMLInputElement | null>;
  /** Reader handle — used by Cmd+S flush and focus("view"). */
  readerRef: RefObject<WorklogNoteReaderHandle | null>;
  /** Current visible notes (for j/k navigation). */
  visibleLogs: WorkLog[];
  /** Currently selected note id. */
  selectedNoteId: string | null;
  /** Selector for the currently-rendered note (drives focusPane("view")). */
  hasSelectedLog: boolean;
  /** Set the selected note id (j/k). */
  setSelectedNoteId: (id: string) => void;
  /** Reveal the reader on mobile when j/k changes selection. */
  setMobileShowReader: (v: boolean) => void;
  /** Skip shortcuts while in the templates view. */
  inTemplatesView: boolean;
  /** "+ New" action for the `n` shortcut. */
  startBlank: () => void;
}

export function useWorklogKeyboardNav({
  railPaneRef,
  listPaneRef,
  viewPaneRef,
  searchInputRef,
  readerRef,
  visibleLogs,
  selectedNoteId,
  hasSelectedLog,
  setSelectedNoteId,
  setMobileShowReader,
  inTemplatesView,
  startBlank,
}: UseWorklogKeyboardNavArgs) {
  const focusPane = useCallback(
    (target: PaneId): boolean => {
      if (target === "rail") {
        const btn = railPaneRef.current?.querySelector<HTMLButtonElement>("[data-rail-row]");
        if (btn) {
          btn.focus();
          return true;
        }
        return false;
      }
      if (target === "list") {
        const lb = listPaneRef.current?.querySelector<HTMLElement>('[role="listbox"]');
        if (lb) {
          lb.focus();
          return true;
        }
        return false;
      }
      if (!hasSelectedLog) return false;
      readerRef.current?.focusTitle();
      return true;
    },
    [railPaneRef, listPaneRef, readerRef, hasSelectedLog],
  );

  const detectActivePane = useCallback((): PaneId | null => {
    const active = document.activeElement;
    if (!active || active === document.body) return null;
    if (railPaneRef.current?.contains(active)) return "rail";
    if (listPaneRef.current?.contains(active)) return "list";
    if (viewPaneRef.current?.contains(active)) return "view";
    return null;
  }, [railPaneRef, listPaneRef, viewPaneRef]);

  const cyclePane = useCallback(
    (direction: "next" | "prev") => {
      const current = detectActivePane();
      const startIdx = current ? PANE_ORDER.indexOf(current) : direction === "next" ? -1 : 0;
      const step = direction === "next" ? 1 : -1;
      for (let i = 1; i <= PANE_ORDER.length; i++) {
        const idx = (startIdx + step * i + PANE_ORDER.length) % PANE_ORDER.length;
        if (focusPane(PANE_ORDER[idx])) return;
      }
    },
    [detectActivePane, focusPane],
  );

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target.isContentEditable
      );
    }

    function handleShortcuts(e: KeyboardEvent) {
      if (inTemplatesView) return;

      const metaOrCtrl = e.metaKey || e.ctrlKey;
      const typing = isTypingTarget(e.target);

      if (metaOrCtrl && e.key.toLowerCase() === "s") {
        e.preventDefault();
        readerRef.current?.flushAutosave();
        return;
      }

      // Pane cycling — Cmd/Ctrl+Shift+ArrowLeft/Right works even while typing.
      if (
        metaOrCtrl &&
        e.shiftKey &&
        (e.key === "ArrowRight" || e.key === "ArrowLeft")
      ) {
        e.preventDefault();
        cyclePane(e.key === "ArrowRight" ? "next" : "prev");
        return;
      }

      if (typing) return;

      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (!e.altKey && !metaOrCtrl) {
        if (e.key.toLowerCase() === "n") {
          e.preventDefault();
          startBlank();
          return;
        }

        const currentIdx = selectedNoteId
          ? visibleLogs.findIndex((l) => l.id === selectedNoteId)
          : -1;

        if (e.key.toLowerCase() === "j") {
          e.preventDefault();
          const nextIdx = Math.min(visibleLogs.length - 1, currentIdx + 1);
          if (visibleLogs[nextIdx]) {
            setSelectedNoteId(visibleLogs[nextIdx].id);
            setMobileShowReader(true);
          }
        }

        if (e.key.toLowerCase() === "k") {
          e.preventDefault();
          const prevIdx = Math.max(0, currentIdx <= 0 ? 0 : currentIdx - 1);
          if (visibleLogs[prevIdx]) {
            setSelectedNoteId(visibleLogs[prevIdx].id);
            setMobileShowReader(true);
          }
        }
      }
    }

    window.addEventListener("keydown", handleShortcuts);
    return () => window.removeEventListener("keydown", handleShortcuts);
  }, [
    inTemplatesView,
    selectedNoteId,
    visibleLogs,
    cyclePane,
    readerRef,
    searchInputRef,
    setMobileShowReader,
    setSelectedNoteId,
    startBlank,
  ]);

  return { focusPane };
}
