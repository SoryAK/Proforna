/**
 * TagsTab — rail panel body for the Tags tab (ADR-0023 Unit 3.1).
 *
 * Renders the shared {@link InlineTagsField} bound to the active note so the
 * tags chip set lives in the rail at xl+ instead of inside the editor body.
 * Owns no state of its own — autosave + IndexedDB draft persistence are
 * inside InlineTagsField.
 */

"use client";

import type { WorkLog } from "@/types/worklog";
import { InlineTagsField } from "@/components/worklog/inline-tags-field";

export interface TagsTabProps {
  /**
   * The active note. Null while the parent rail is mounted but the log
   * hasn't resolved yet (e.g. first render, list still loading). The tab
   * shows a quiet placeholder in that window.
   */
  log: WorkLog | null;
  /** Commit a single-field update for an existing log. */
  onUpdate: (patch: Partial<WorkLog> & { id: string }) => void | Promise<unknown>;
  /** Autocomplete corpus from the visible note set. */
  tagSuggestions?: string[];
}

export function TagsTab({ log, onUpdate, tagSuggestions }: TagsTabProps) {
  if (!log) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center text-xs text-muted-foreground">
        <p className="max-w-[16rem] text-muted-foreground/70">
          Loading note details…
        </p>
      </div>
    );
  }

  return (
    <div className="px-3 py-3">
      <InlineTagsField
        log={log}
        onUpdate={onUpdate}
        tagSuggestions={tagSuggestions}
        hideLabel
      />
    </div>
  );
}
