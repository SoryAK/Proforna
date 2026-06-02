/**
 * Per-worklog Y.Doc + IndexedDB persistence registry.
 *
 * Phase 1b: each worklog gets its own Y.Doc, persisted under an IndexedDB
 * database keyed by worklog id. The doc is the source of truth for the
 * editor; on every keystroke it is mutated locally, the change is queued to
 * IndexedDB (offline-safe), and the editor's debounced `onSave` callback
 * pushes a server-side projection (plain text + ProseMirror JSON).
 *
 * Phase 2 may add a network provider (y-websocket / Hocuspocus) on top of
 * the same Y.Doc without touching the editor or the persistence layer.
 */

import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";

export type WorklogYHandle = {
  ydoc: Y.Doc;
  persistence: IndexeddbPersistence;
  /** Resolves once IndexedDB has loaded any prior content into the doc. */
  synced: Promise<void>;
  /** Increment when a consumer mounts; decrement on unmount. Releases at 0. */
  acquire: () => void;
  release: () => void;
};

const handles = new Map<string, WorklogYHandle & { refs: number }>();

function dbName(workLogId: string) {
  return `worklog-y:${workLogId}`;
}

export function getWorklogYHandle(workLogId: string): WorklogYHandle {
  const existing = handles.get(workLogId);
  if (existing) {
    return existing;
  }

  const ydoc = new Y.Doc();
  const persistence = new IndexeddbPersistence(dbName(workLogId), ydoc);
  const synced = new Promise<void>((resolve) => {
    persistence.once("synced", () => resolve());
  });

  const handle: WorklogYHandle & { refs: number } = {
    ydoc,
    persistence,
    synced,
    refs: 0,
    acquire() {
      handle.refs += 1;
    },
    release() {
      handle.refs -= 1;
      if (handle.refs <= 0) {
        handles.delete(workLogId);
        // Destroy persistence first so pending writes flush, then the doc.
        persistence.destroy().catch(() => {});
        ydoc.destroy();
      }
    },
  };

  handles.set(workLogId, handle);
  return handle;
}

/** Test-only helper to drop the cached handle without destroying it. */
export function _resetWorklogYRegistryForTests() {
  handles.clear();
}
