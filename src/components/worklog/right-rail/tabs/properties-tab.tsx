/**
 * PropertiesTab — rail panel body for the Properties tab (ADR-0025 Unit 3).
 *
 * Replaces the old TagsTab (ADR-0023 Unit 3.1). The Properties tab now hosts
 * three stacked autosave fields — Tags, Assets, Tools — so all three live
 * under a single, broader header. Each field is the same self-contained
 * Inline*Field component that the inline (mobile / xl-hidden) reader mounts;
 * mounting the same component in two places keeps the autosave + IndexedDB
 * draft contracts canonical.
 *
 * Owns no state of its own — autosave + draft persistence live inside each
 * Inline*Field. The rail panel provides the inner scroller via
 * `flex-1 overflow-y-auto` on its content region.
 */

"use client";

import type { WorkLog } from "@/types/worklog";
import type { JobAsset, AssetPickerPosition } from "@/components/asset-picker";
import type { EquipmentItem } from "@/components/equipment-picker";
import { InlineTagsField } from "@/components/worklog/inline-tags-field";
import { InlineAssetsField } from "@/components/worklog/inline-assets-field";
import { InlineToolsField } from "@/components/worklog/inline-tools-field";

export interface PropertiesTabProps {
  /**
   * The active note. Null while the parent rail is mounted but the log
   * hasn't resolved yet (e.g. first render, list still loading). The tab
   * shows a quiet placeholder in that window.
   */
  log: WorkLog | null;
  /** Commit a single-field update for an existing log. */
  onUpdate: (patch: Partial<WorkLog> & { id: string }) => void | Promise<unknown>;
  /** Autocomplete corpus for the Tags field. */
  tagSuggestions?: string[];
  /** Asset corpus for the Assets field. */
  assets: JobAsset[];
  /** Position dropdown options for the Assets field. */
  positions: AssetPickerPosition[];
  /** Equipment corpus for the Tools field. */
  equipment: EquipmentItem[];
}

export function PropertiesTab({
  log,
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
    <div className="px-3 py-3 space-y-5">
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
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </section>
  );
}
