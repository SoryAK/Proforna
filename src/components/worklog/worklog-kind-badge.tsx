/**
 * WorklogKindBadge — small rose icon-only badge that appears next to a
 * note's title when the row represents a procedure (kind === "procedure").
 *
 * Used in row surfaces that mix kinds: /worklog/notes list rail,
 * /worklog home Today list, /worklog home Recent list. Returns null
 * for plain notes so the absence of the badge is itself the signal —
 * regular note rows look unchanged.
 *
 * Color matches the rose `@r:` mention chip and the Procedures sidebar
 * row so the procedure visual language is uniform across the app.
 */

import { ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkLog } from "@/types/worklog";

export interface WorklogKindBadgeProps {
  kind: WorkLog["kind"];
  className?: string;
}

export function WorklogKindBadge({ kind, className }: WorklogKindBadgeProps) {
  if (kind !== "procedure") return null;
  return (
    <span
      role="img"
      aria-label="Procedure"
      title="Procedure"
      className={cn(
        "inline-flex flex-shrink-0 items-center justify-center rounded-md p-0.5",
        "bg-rose-500 text-white shadow-sm",
        "dark:bg-rose-500 dark:text-white",
        className,
      )}
    >
      <ListChecks className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
    </span>
  );
}
