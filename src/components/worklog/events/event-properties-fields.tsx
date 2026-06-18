/**
 * EventPropertiesFields — non-location, non-content event metadata
 * rendered in the Properties rail tab (ADR-0034).
 *
 * Fields: Category select · Start date · End date · Metrics.
 *
 * Controlled component — the editor shell owns canonical state. In
 * draft mode (`/worklog/events/new`) `onCommit` is a no-op; in persisted
 * mode (`/worklog/events/<id>`) it triggers a PATCH on the relevant
 * field. Date inputs commit on change (picking a date is intentional);
 * Metrics commits on blur.
 */

"use client";

import { CalendarDays, Hash, ListChecks } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CAREER_EVENT_CATEGORY_SUGGESTIONS } from "@/lib/career-event/event-schema";

export interface EventPropertiesFieldsProps {
  category: string;
  onCategoryChange: (next: string) => void;
  /** Commit hook for category — fires after `onCategoryChange`. Persisted mode only. */
  onCategoryCommit?: () => void;

  /** yyyy-mm-dd or "" */
  startDate: string;
  onStartDateChange: (next: string) => void;
  onStartDateCommit?: () => void;

  endDate: string;
  onEndDateChange: (next: string) => void;
  onEndDateCommit?: () => void;

  metrics: string;
  onMetricsChange: (next: string) => void;
  /** Commit hook for metrics — fires on blur, not on every keystroke. */
  onMetricsCommit?: () => void;

  disabled?: boolean;
}

export function EventPropertiesFields({
  category,
  onCategoryChange,
  onCategoryCommit,
  startDate,
  onStartDateChange,
  onStartDateCommit,
  endDate,
  onEndDateChange,
  onEndDateCommit,
  metrics,
  onMetricsChange,
  onMetricsCommit,
  disabled,
}: EventPropertiesFieldsProps) {
  return (
    <div className="space-y-3">
      {/* Category */}
      <div className="space-y-1">
        <Label
          htmlFor="ev-prop-category"
          className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold"
        >
          <Hash className="h-3 w-3" />
          Category
        </Label>
        <Select
          value={category}
          onValueChange={(v) => {
            onCategoryChange(v ?? "company_event");
            onCategoryCommit?.();
          }}
          disabled={disabled}
        >
          <SelectTrigger
            id="ev-prop-category"
            className="h-8 text-xs w-full"
            aria-label="Category"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CAREER_EVENT_CATEGORY_SUGGESTIONS.map((c) => (
              <SelectItem key={c} value={c}>
                {formatCategoryLabel(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Dates — two columns to fit the 320px rail. */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label
            htmlFor="ev-prop-start"
            className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold"
          >
            <CalendarDays className="h-3 w-3" />
            Start
          </Label>
          <Input
            id="ev-prop-start"
            type="date"
            value={startDate}
            onChange={(e) => {
              onStartDateChange(e.target.value);
              onStartDateCommit?.();
            }}
            className="h-8 text-xs tabular-nums"
            disabled={disabled}
          />
        </div>
        <div className="space-y-1">
          <Label
            htmlFor="ev-prop-end"
            className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold"
          >
            <CalendarDays className="h-3 w-3" />
            End
          </Label>
          <Input
            id="ev-prop-end"
            type="date"
            value={endDate}
            onChange={(e) => {
              onEndDateChange(e.target.value);
              onEndDateCommit?.();
            }}
            className="h-8 text-xs tabular-nums"
            disabled={disabled}
          />
        </div>
      </div>

      {/* Metrics */}
      <div className="space-y-1">
        <Label
          htmlFor="ev-prop-metrics"
          className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold"
        >
          <ListChecks className="h-3 w-3" />
          Metrics
        </Label>
        <Input
          id="ev-prop-metrics"
          value={metrics}
          onChange={(e) => onMetricsChange(e.target.value)}
          onBlur={() => onMetricsCommit?.()}
          maxLength={500}
          placeholder="e.g. 1.2k attendees · 3 talks"
          className="h-8 text-xs"
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function formatCategoryLabel(raw: string): string {
  return raw
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}
