/**
 * TagsTab — rail panel body for the Tags tab (ADR-0023).
 *
 * Placeholder for Unit 3. The real Tags lift requires hoisting the
 * `tagsField` autosave wiring out of WorklogNoteReader, which is invasive
 * enough to warrant its own unit (3.1). Until then, this tab points users
 * back to the editor body where Tags still live.
 */

"use client";

import { ArrowLeft } from "lucide-react";

export function TagsTab() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center text-xs text-muted-foreground">
      <ArrowLeft className="h-4 w-4 text-muted-foreground/60" />
      <p className="mt-2 max-w-[16rem] font-medium text-muted-foreground/80">
        Tags are still in the editor body.
      </p>
      <p className="mt-1 max-w-[16rem] text-muted-foreground/70">
        Lifting them into the rail lands in Unit 3.1.
      </p>
    </div>
  );
}
