"use client";

/**
 * ViewPresetSwitcher — segmented pill switcher for the under-map frame.
 *
 * Three presets: Map · Work Log · Career Analytics
 * Includes a small "Reset" ghost button that clears all persisted preset state.
 */

import { MapPin, ClipboardList, BarChart3, RotateCcw } from "lucide-react";
import {
  VIEW_PRESETS,
  PRESET_META,
  type ViewPreset,
} from "./view-preset";

const ICONS: Record<ViewPreset, React.ElementType> = {
  map: MapPin,
  worklog: ClipboardList,
  analytics: BarChart3,
};

export interface ViewPresetSwitcherProps {
  current: ViewPreset;
  onChange: (next: ViewPreset) => void;
  onResetAll: () => void;
  className?: string;
}

export function ViewPresetSwitcher({
  current,
  onChange,
  onResetAll,
  className = "",
}: ViewPresetSwitcherProps) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <div
        role="tablist"
        aria-label="View preset"
        className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-0.5"
      >
        {VIEW_PRESETS.map((preset) => {
          const Icon = ICONS[preset];
          const active = preset === current;
          return (
            <button
              key={preset}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(preset)}
              title={PRESET_META[preset].description}
              className={[
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/60",
              ].join(" ")}
            >
              <Icon className="h-3.5 w-3.5" />
              {PRESET_META[preset].label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onResetAll}
        title="Reset all preset tweaks"
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <RotateCcw className="h-3 w-3" />
        Reset
      </button>
    </div>
  );
}
