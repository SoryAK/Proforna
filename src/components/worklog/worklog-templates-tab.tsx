/**
 * WorklogTemplatesTab — the "Templates" tab pane of the worklog page.
 *
 * Pure presentation: lists templates as cards with Use / Edit / Delete actions
 * and a header CTA to create a new template. All side effects flow through
 * callback props so the orchestrator owns mutation state.
 */

"use client";

import { Plus, Pencil, Trash2, Briefcase, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Template, Position } from "@/types/worklog";
import { CATEGORIES } from "@/components/worklog/constants";

export interface WorklogTemplatesTabProps {
  templates: Template[];
  positionMap: Map<string, Position>;
  onApply: (t: Template) => void;
  onEdit: (t: Template) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}

export function WorklogTemplatesTab({
  templates,
  positionMap,
  onApply,
  onEdit,
  onDelete,
  onNew,
}: WorklogTemplatesTabProps) {
  return (
    <>
      <div className="flex justify-end mb-3">
        <Button size="sm" onClick={onNew}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> New template
        </Button>
      </div>
      {templates.length === 0 ? (
        <Card className="p-8 text-center">
          <Sparkles className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground mb-1">No templates yet.</p>
          <p className="text-xs text-muted-foreground">
            Templates pre-fill the form so a routine day takes one tap (e.g. &quot;Standard onsite — Acme&quot;).
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map((t) => (
            <Card key={t.id} className="p-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-sm">{t.name}</div>
                {t.description && (
                  <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
                )}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <Badge variant="outline" className={cn("text-[10px]", CATEGORIES[t.defaultCategory]?.color)}>
                    {CATEGORIES[t.defaultCategory]?.label ?? t.defaultCategory}
                  </Badge>
                  {t.defaultPositionId && positionMap.get(t.defaultPositionId) && (
                    <Badge variant="outline" className="text-[10px]">
                      <Briefcase className="h-2.5 w-2.5 mr-1" />
                      {positionMap.get(t.defaultPositionId)!.company}
                    </Badge>
                  )}
                  {t.useCount > 0 && (
                    <span className="text-[10px] text-muted-foreground">used {t.useCount}×</span>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => onApply(t)}>
                  Use
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onEdit(t)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={() => {
                    if (confirm(`Delete template "${t.name}"?`)) onDelete(t.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
