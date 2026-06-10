/**
 * InlineTagsField — self-contained Tags autosave field for a single WorkLog.
 *
 * Originally lived inline inside `WorklogNoteReader` as `tagsField`. Lifted
 * out in ADR-0023 Unit 3.1 so the rail Tags tab can render the same UI
 * without prop-drilling the autosave hook through the reader.
 *
 * Each mount owns its own `useAutosaveField` + `useWorklogDrafts` slice keyed
 * by `worklog:draft:<id>:tags`. Two mounts on the same screen (e.g. rail tab
 * at xl+ and inline reader at <xl) is intentional and safe: they share the
 * same `persistKey`, write through the same `onUpdate({tags})` mutation, and
 * `useAutosaveField` re-syncs to the latest `log.tags` whenever the prop
 * changes — so AssetPicker or editor-mention merges propagate to both.
 */

"use client";

import type { WorkLog } from "@/types/worklog";
import { TagInput } from "@/components/ui/tag-input";
import { useWorklogDrafts } from "@/components/worklog/hooks/use-worklog-drafts";
import { readAutosaveDraft, useAutosaveField } from "@/components/worklog/hooks/use-autosave";
import { cn } from "@/lib/utils";

export interface InlineTagsFieldProps {
  log: WorkLog;
  /** Commit a single-field update for an existing log. */
  onUpdate: (patch: Partial<WorkLog> & { id: string }) => void | Promise<unknown>;
  /** Autocomplete corpus from the visible note set. */
  tagSuggestions?: string[];
  /** Optional wrapper className — used to gate visibility via Tailwind. */
  className?: string;
  /** Hide the "Tags" eyebrow label (rail mounts already render a header). */
  hideLabel?: boolean;
  /** Pass through to the inner <TagInput>. */
  placeholder?: string;
}

export function InlineTagsField({
  log,
  onUpdate,
  tagSuggestions,
  className,
  hideLabel = false,
  placeholder = "Add tags and press Enter",
}: InlineTagsFieldProps) {
  const { draftMap, saveFieldDraft, clearFieldDraft } = useWorklogDrafts(log.id);

  const tagsKey = `worklog:draft:${log.id}:tags`;
  const tagsInitial =
    typeof draftMap.tags === "string"
      ? draftMap.tags
      : readAutosaveDraft<string>(tagsKey) ?? (log.tags ?? "");

  const tagsField = useAutosaveField(log.tags ?? "", (v) =>
    onUpdate({ id: log.id, tags: v || null }),
    {
      persistKey: tagsKey,
      initialValue: tagsInitial,
      onDraftChange: (v) => saveFieldDraft("tags", v),
      onCommitSuccess: () => clearFieldDraft("tags"),
    },
  );

  return (
    <div className={cn("space-y-1.5", className)}>
      {!hideLabel && (
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Tags
        </p>
      )}
      <TagInput
        value={tagsField.value
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)}
        onChange={(next) => tagsField.onChange(next.join(", "))}
        placeholder={placeholder}
        suggestions={tagSuggestions}
        className="w-full"
      />
    </div>
  );
}
