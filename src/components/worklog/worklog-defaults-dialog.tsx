"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MOODS, resolveCategoryMeta } from "@/components/worklog/constants";
import { useWorklogCategories } from "@/components/worklog/hooks/use-worklog-categories";
import { WORKLOG_CATEGORY_FALLBACK } from "@/lib/worklog-categories";
import { timeLabelFromMinutes } from "@/lib/worklog-shifts";
import type { Position, WorkShift, WorklogPreferences } from "@/types/worklog";

type DraftPreferences = WorklogPreferences;

export interface WorklogDefaultsDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  value: WorklogPreferences;
  positions: Position[];
  shifts: WorkShift[];
  loadingShifts: boolean;
  onSave: (next: WorklogPreferences) => void;
  saving?: boolean;
}

export function WorklogDefaultsDialog(props: WorklogDefaultsDialogProps) {
  const {
    open,
    onOpenChange,
    value,
    positions,
    shifts,
    loadingShifts,
    onSave,
    saving,
  } = props;

  const [draft, setDraft] = useState<DraftPreferences>(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const companyOptions = useMemo(
    () => positions.filter((p) => p.type === "job"),
    [positions],
  );

  const shiftOptions = useMemo(
    () => shifts.filter((s) => s.workHistoryId === draft.defaultPositionId),
    [shifts, draft.defaultPositionId],
  );

  // User-defined categories from Sprint A's WorkLogCategory table, plus the
  // synthetic "Other" fallback for users who want to default to it.
  const { categories: userCategories } = useWorklogCategories();
  const categoryOptions = useMemo(
    () => [
      ...userCategories.map((c) => ({
        key: c.name,
        label: resolveCategoryMeta(c.name).label,
      })),
      { key: WORKLOG_CATEGORY_FALLBACK, label: resolveCategoryMeta(WORKLOG_CATEGORY_FALLBACK).label },
    ],
    [userCategories],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Worklog defaults</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Default company</Label>
            <Select
              value={draft.defaultPositionId ?? "none"}
              onValueChange={(next) =>
                setDraft((prev) => ({
                  ...prev,
                  defaultPositionId: next === "none" ? null : next,
                  defaultShiftId: next === "none" ? null : prev.defaultShiftId,
                }))
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="No default company" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No default company</SelectItem>
                {companyOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.company}
                    {p.title ? ` — ${p.title}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Default shift</Label>
            <Select
              value={draft.defaultShiftId ?? "none"}
              onValueChange={(next) =>
                setDraft((prev) => ({
                  ...prev,
                  defaultShiftId: next === "none" ? null : next,
                }))
              }
              disabled={!draft.defaultPositionId || loadingShifts}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue
                  placeholder={
                    !draft.defaultPositionId
                      ? "Select default company first"
                      : loadingShifts
                        ? "Loading shifts..."
                        : "No default shift"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No default shift</SelectItem>
                {shiftOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({timeLabelFromMinutes(s.startMinute)}-{timeLabelFromMinutes(s.endMinute)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Default category</Label>
              <Select
                value={draft.defaultCategory}
                onValueChange={(next) =>
                  setDraft((prev) => ({
                    ...prev,
                    defaultCategory: next ?? "task",
                  }))
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map(({ key, label }) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Default mood</Label>
              <Select
                value={draft.defaultMood ?? "none"}
                onValueChange={(next) =>
                  setDraft((prev) => ({
                    ...prev,
                    defaultMood: next === "none" ? null : next,
                  }))
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No default mood</SelectItem>
                  {MOODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Default hours</Label>
            <Input
              type="number"
              min="0"
              step="0.25"
              value={draft.defaultHours ?? ""}
              onChange={(e) => {
                const next = e.target.value.trim();
                setDraft((prev) => ({
                  ...prev,
                  defaultHours: next === "" ? null : Number(next),
                }));
              }}
              placeholder="Leave blank for no default"
              className="h-8 text-xs"
            />
          </div>

          <p className="text-[11px] text-muted-foreground">
            Defaults are synced to your account and applied to all new notes unless overridden by template or manual edits.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onSave(draft)} disabled={saving}>
            Save defaults
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
