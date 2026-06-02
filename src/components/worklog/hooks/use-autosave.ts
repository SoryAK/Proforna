/**
 * useAutosaveField — small controlled-input helper for save-on-blur fields
 * with debounced idle save.
 *
 * Pattern:
 *   const { value, onChange, onBlur } = useAutosaveField(
 *     remoteValue,
 *     (v) => saveLog({ id, title: v }),
 *   );
 *   <Input value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
 *
 * Responsibilities:
 *   • Mirrors the remote value into local state and resets when the source
 *     changes (e.g. user switches to a different note).
 *   • Schedules a debounced save while the user types (default 800 ms idle).
 *   • Flushes any pending save on blur and on unmount.
 *   • Skips redundant saves when local matches last-committed remote value.
 *
 * Intentionally narrow: one field per hook so each input owns its own dirty
 * state. For multi-field forms call it once per field — Reader does this.
 */

import { useEffect, useRef, useState } from "react";

const DRAFT_STORAGE_VERSION = 1;

type PersistEnvelope<T> = {
  version: number;
  savedAt: number;
  value: T;
};

function readPersistedValue<T>(persistKey: string, ttlMs: number): T | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(persistKey);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as PersistEnvelope<T>;
    if (!parsed || parsed.version !== DRAFT_STORAGE_VERSION) {
      window.localStorage.removeItem(persistKey);
      return undefined;
    }
    if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > ttlMs) {
      window.localStorage.removeItem(persistKey);
      return undefined;
    }
    return parsed.value;
  } catch {
    window.localStorage.removeItem(persistKey);
    return undefined;
  }
}

export function readAutosaveDraft<T>(persistKey: string, ttlMs = 7 * 24 * 60 * 60 * 1000) {
  return readPersistedValue<T>(persistKey, ttlMs);
}

function persistValue<T>(persistKey: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    const envelope: PersistEnvelope<T> = {
      version: DRAFT_STORAGE_VERSION,
      savedAt: Date.now(),
      value,
    };
    window.localStorage.setItem(persistKey, JSON.stringify(envelope));
  } catch {
    // Ignore storage quota/privacy errors; autosave still commits remotely.
  }
}

export function useAutosaveField<T>(
  remote: T,
  commit: (next: T) => void | Promise<unknown>,
  opts: {
    debounceMs?: number;
    equal?: (a: T, b: T) => boolean;
    persistKey?: string;
    persistTtlMs?: number;
    initialValue?: T;
    draftDebounceMs?: number;
    onDraftChange?: (next: T) => void | Promise<unknown>;
    onCommitSuccess?: () => void | Promise<unknown>;
  } = {},
) {
  const {
    debounceMs = 800,
    equal = Object.is,
    persistKey,
    persistTtlMs = 7 * 24 * 60 * 60 * 1000,
    initialValue,
    draftDebounceMs = 700,
    onDraftChange,
    onCommitSuccess,
  } = opts;
  const [value, setValue] = useState<T>(() => (initialValue === undefined ? remote : initialValue));
  const [isSaving, setIsSaving] = useState(false);
  const lastCommittedRef = useRef<T>(remote);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from remote when it changes (e.g. switching notes). We only adopt the
  // new value if local has no pending changes vs the previous committed value.
  useEffect(() => {
    if (equal(value, lastCommittedRef.current)) {
      lastCommittedRef.current = remote;
      setValue(remote);
    } else {
      // Local has unsaved edits; preserve them and just update baseline.
      lastCommittedRef.current = remote;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote]);

  function flush() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!equal(value, lastCommittedRef.current)) {
      lastCommittedRef.current = value;
      setIsSaving(true);
      Promise.resolve(commit(value)).then(() => {
        if (onCommitSuccess) void onCommitSuccess();
      }).catch(() => {}).finally(() => {
        setIsSaving(false);
      });
      if (persistKey) persistValue(persistKey, value);
    }
  }

  // Flush pending save on unmount so nothing is lost when the reader closes.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        if (!equal(value, lastCommittedRef.current)) {
          lastCommittedRef.current = value;
          setIsSaving(true);
          Promise.resolve(commit(value)).then(() => {
            if (onCommitSuccess) void onCommitSuccess();
          }).catch(() => {}).finally(() => {
            setIsSaving(false);
          });
        }
      }
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onChange(next: T) {
    setValue(next);
    if (persistKey) persistValue(persistKey, next);
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    if (onDraftChange) {
      draftTimerRef.current = setTimeout(() => {
        void onDraftChange(next);
        draftTimerRef.current = null;
      }, draftDebounceMs);
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!equal(next, lastCommittedRef.current)) {
        lastCommittedRef.current = next;
        setIsSaving(true);
        Promise.resolve(commit(next)).finally(() => {
          setIsSaving(false);
        });
        if (persistKey) persistValue(persistKey, next);
      }
      timerRef.current = null;
    }, debounceMs);
  }

  function onBlur() {
    flush();
  }

  return { value, onChange, onBlur, flush, isDirty: !equal(value, lastCommittedRef.current), isSaving };
}
