/**
 * `/worklog/events/new` — inline draft editor for a brand-new
 * CareerEvent (ADR-0034, supersedes the EventCreateDialog modal).
 *
 * The page stays in `mode="new"` until the editor's first successful
 * POST, which `router.replace()`s to `/worklog/events/<id>` — no DB
 * row exists for the duration of the draft (Q4=4b decision).
 *
 * Deep-link path: the worklog map view's "place a pin" FAB reverse-
 * geocodes the click and routes here with `?lat&lng&location` so
 * the location section opens already-resolved.
 */

"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { WorklogEventEditor } from "@/components/worklog/events/worklog-event-editor";

function NewEventEditorPage() {
  const params = useSearchParams();

  const latRaw = params.get("lat");
  const lngRaw = params.get("lng");
  const locationParam = params.get("location") ?? undefined;

  const lat = latRaw !== null ? Number(latRaw) : NaN;
  const lng = lngRaw !== null ? Number(lngRaw) : NaN;
  const initialCoords =
    Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;

  return (
    <WorklogEventEditor
      mode="new"
      initialCoords={initialCoords}
      initialLocation={locationParam}
    />
  );
}

export default function Page() {
  // useSearchParams suspends — wrap so the route doesn't bail.
  return (
    <Suspense fallback={null}>
      <NewEventEditorPage />
    </Suspense>
  );
}
