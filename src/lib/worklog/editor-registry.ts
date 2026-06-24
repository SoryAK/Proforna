/**
 * In-memory registry of currently-mounted worklog editors.
 *
 * Lets the AI chat panel's Send-to-Worklog action (ADR-0046 follow-up B)
 * call into a live editor — `editor.commands.insertContentAt(0, content)`
 * plus an autosave flush — instead of creating a brand-new WorkLog every
 * time the user is already editing the active worklog.
 *
 * Scope: client-only, single-process, module-level state. Not for SSR.
 *
 * Lifecycle:
 *  - Editor mount calls `registerEditor(handle)` once it is ready to accept
 *    commands, and keeps the returned disposer for unmount cleanup.
 *  - Consumers call `getEditor(id)` for a synchronous check, or
 *    `waitForEditor(id, timeoutMs)` when the editor may still be mounting
 *    (e.g. the chat panel fires before the editor finishes its first paint).
 *
 * Last-write-wins on re-register. The previous disposer is intentionally
 * idempotent: if a stale handle's disposer runs AFTER a newer handle has
 * taken the slot, the disposer must NOT clear the newer handle.
 */

/**
 * Handle registered in the worklog-editor registry. Named distinctly from
 * `WorklogEditorHandle` (TipTap imperative ref exported by worklog-editor.tsx)
 * so the two never collide at an import site.
 */
export interface RegisteredWorklogEditor {
  /** WorkLog id this handle drives. */
  id: string;
  /** WorkLog.kind ("note" | "procedure" | ...). Callers filter on this. */
  kind: string;
  /**
   * Prepend `content` to the top of the editor's document, then flush the
   * autosave so the new content is persisted before the promise resolves.
   * Implementation lives in the editor component; this is the RPC seam.
   */
  prepend: (content: string) => Promise<void>;
}

const registry = new Map<string, RegisteredWorklogEditor>();

/**
 * Register an editor handle. Returns a disposer; calling it removes the
 * handle ONLY if it is still the active entry (last-write-wins).
 */
export function registerEditor(handle: RegisteredWorklogEditor): () => void {
  registry.set(handle.id, handle);
  return () => {
    if (registry.get(handle.id) === handle) {
      registry.delete(handle.id);
    }
  };
}

/** Synchronous lookup. Returns null when no editor is mounted for `id`. */
export function getEditor(id: string): RegisteredWorklogEditor | null {
  return registry.get(id) ?? null;
}

/**
 * Poll the registry until a handle for `id` is present or `timeoutMs`
 * elapses. Used when a consumer can't guarantee mount order with the
 * editor it wants to drive.
 *
 * Polling cadence is fixed at 50ms — fast enough that a single React
 * commit cycle is enough to surface the handle, slow enough to be
 * negligible CPU. Resolves with `null` on timeout.
 */
export function waitForEditor(
  id: string,
  timeoutMs: number = 500,
): Promise<RegisteredWorklogEditor | null> {
  const POLL_INTERVAL_MS = 50;
  const immediate = getEditor(id);
  if (immediate) return Promise.resolve(immediate);

  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      const found = getEditor(id);
      if (found) {
        resolve(found);
        return;
      }
      if (Date.now() >= deadline) {
        resolve(null);
        return;
      }
      setTimeout(tick, POLL_INTERVAL_MS);
    };
    setTimeout(tick, POLL_INTERVAL_MS);
  });
}

/**
 * TEST-ONLY — clears the registry between specs. Not exported from a
 * production barrel; the underscore prefix marks intent.
 */
export function __resetEditorRegistry(): void {
  registry.clear();
}
