/**
 * PropertiesTab — rail panel body for the Properties tab
 * (ADR-0025 Units 3 + 4).
 *
 * Unit 3 absorbed the old Tags tab and added Assets + Tools sections.
 * Unit 4 collapses the standalone Backlinks and Version History tabs into
 * this same panel, so the rail now exposes just two tabs (Properties +
 * Photos) and the Properties column becomes the single context surface for
 * the active note.
 *
 * Architectural decision — Option B (inner scrollers): each variable-height
 * section (Backlinks + History) caps at `max-h-64` with its own scrollbar,
 * so the picker sections above always stay reachable without scrolling
 * past someone else's queue.
 *
 * Owns no state of its own — autosave + draft persistence live inside each
 * Inline*Field. The rail panel provides the outer scroller via
 * `flex-1 overflow-y-auto` on its content region.
 */

"use client";

import type { Position, WorkLog } from "@/types/worklog";
import type { JobAsset } from "@/components/asset-picker";
import type { EquipmentItem } from "@/components/equipment-picker";
import { InlineTagsField } from "@/components/worklog/inline-tags-field";
import { InlineAssetsField } from "@/components/worklog/inline-assets-field";
import { InlineToolsField } from "@/components/worklog/inline-tools-field";
import { WorklogBacklinksPanel } from "@/components/worklog/worklog-backlinks-panel";
import { WorklogHistoryPanel } from "@/components/worklog/worklog-history-panel";
import { PropertiesFields } from "./properties-fields";

export interface PropertiesTabProps {
  /**
   * The active note. Null while the parent rail is mounted but the log
   * hasn't resolved yet (e.g. first render, list still loading). The tab
   * shows a quiet placeholder in that window.
   */
  log: WorkLog | null;
  /**
   * Active note id — needed by the Backlinks and History sub-panels which
   * key their own queries off it. Provided separately from `log` because
   * the rail already has it before the log record resolves.
   */
  noteId: string;
  /** Current document plain-text — needed by the History panel for diffs. */
  currentPlainText: string;
  /** Commit a single-field update for an existing log. */
  onUpdate: (patch: Partial<WorkLog> & { id: string }) => void | Promise<unknown>;
  /** Autocomplete corpus for the Tags field. */
  tagSuggestions?: string[];
  /** Asset corpus for the Assets field. */
  assets: JobAsset[];
  /**
   * Position list — needed by both the Details fields (Job select with
   * full title) and the Assets field (which only needs id/company/type).
   * Full Position is structurally compatible with AssetPickerPosition.
   */
  positions: Position[];
  /** Equipment corpus for the Tools field. */
  equipment: EquipmentItem[];
}

export function PropertiesTab({
  log,
  noteId,
  currentPlainText,
  onUpdate,
  tagSuggestions,
  assets,
  positions,
  equipment,
}: PropertiesTabProps) {
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
    <div className="px-3 divide-y divide-border">
      {/* Details — Tolaria-style key-value rows for the note's editable
          metadata. The body's <WorklogNoteMetaStrip> is hidden at xl+ so
          this rail panel is the canonical Properties surface on desktop. */}
      <Section label="Details">
        <PropertiesFields log={log} positions={positions} onUpdate={onUpdate} />
      </Section>

      <Section label="Tags">
        <InlineTagsField
          log={log}
          onUpdate={onUpdate}
          tagSuggestions={tagSuggestions}
          hideLabel
        />
      </Section>

      <Section label="Assets">
        <InlineAssetsField
          log={log}
          assets={assets}
          positions={positions}
          onUpdate={onUpdate}
          hideLabel
        />
      </Section>

      <Section label="Tools">
        <InlineToolsField
          log={log}
          equipment={equipment}
          onUpdate={onUpdate}
          hideLabel
        />
      </Section>

      {/* Backlinks — inner scroller per ADR-0025 Option B so a long
          incoming-links list never pushes Properties pickers off-screen. */}
      <Section label="Backlinks">
        <div className="max-h-64 overflow-y-auto">
          <WorklogBacklinksPanel noteId={noteId} bare />
        </div>
      </Section>

      {/* Version History — same scroller cap. */}
      <Section label="Version history">
        <div className="max-h-64 overflow-y-auto">
          <WorklogHistoryPanel
            noteId={noteId}
            currentPlainText={currentPlainText}
            bare
          />
        </div>
      </Section>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="py-4 space-y-2 first:pt-3 last:pb-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </section>
  );
}
