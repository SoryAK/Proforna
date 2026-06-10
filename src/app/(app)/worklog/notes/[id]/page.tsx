/**
 * `/worklog/notes/[id]` — single-note reader (per ADR-0015, superseded
 * by ADR-0024 for the layout).
 *
 * As of ADR-0024 this route mounts the **same** `WorklogNotesView` that
 * `/worklog/notes` uses, just with `selectedNoteId={id}`. The view renders
 * the inline 3-pane layout (list shrinks to w-72, reader middle, rail
 * right) when a selection is present and the bare list when not. This
 * keeps a single shell in charge of every worklog-notes surface.
 */

"use client";

import { use } from "react";
import { WorklogNotesView } from "@/components/worklog/worklog-notes-view";

export default function WorklogNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <WorklogNotesView selectedNoteId={id} />;
}
