/**
 * WorklogTemplatePickerDialog — modal that lists user templates so the
 * user can spawn a new note pre-filled from one. Empty-state offers a
 * "Create your first template" CTA that jumps to the templates tab.
 */

"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { CATEGORIES } from "@/components/worklog/constants";
import type { Position, Template } from "@/types/worklog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: Template[];
  positionMap: Map<string, Position>;
  onApply: (t: Template) => void;
  onCreateFirst: () => void;
}

export function WorklogTemplatePickerDialog({
  open,
  onOpenChange,
  templates,
  positionMap,
  onApply,
  onCreateFirst,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pick a template</DialogTitle>
        </DialogHeader>
        {templates.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground mb-3">
              No templates yet — create one to log routine days in seconds.
            </p>
            <Button size="sm" onClick={onCreateFirst}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Create your first template
            </Button>
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2 pr-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onApply(t)}
                  className="w-full text-left p-3 rounded-md border hover:border-foreground/30 hover:bg-accent/40 transition-colors"
                >
                  <div className="font-medium text-sm">{t.name}</div>
                  {t.description && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {t.description}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        CATEGORIES[t.defaultCategory]?.color,
                      )}
                    >
                      {CATEGORIES[t.defaultCategory]?.label ?? t.defaultCategory}
                    </Badge>
                    {t.defaultPositionId && positionMap.get(t.defaultPositionId) && (
                      <Badge variant="outline" className="text-[10px]">
                        {positionMap.get(t.defaultPositionId)!.company}
                      </Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
