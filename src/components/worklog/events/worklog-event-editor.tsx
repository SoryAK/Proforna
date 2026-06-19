/**
 * WorklogEventEditor — inline editor surface for CareerEvent (ADR-0034).
 *
 * Replaces the modal `EventCreateDialog` + `EventEditDialog` with a
 * notes-style page-level shell:
 *   • Title input (large, top)
 *   • "What happened" textarea (plaintext — Q3=3a slim editor; not Tiptap)
 *   • Right-rail Properties panel with Location + Category/Dates/Metrics
 *
 * Two modes — the route shells decide which:
 *
 *   mode="new"
 *     Client-side draft until first save (Q4=4b, ADR-0034). All fields
 *     live in local state. The Location section runs in `draft` mode
 *     (chip row + autocomplete + mini-map). On submit, validate, POST
 *     to the right endpoint, then `router.replace("/worklog/events/<id>")`.
 *
 *   mode="existing"
 *     Event already exists. Each field commits via PATCH (autosave on
 *     change for selects/dates, blur for free-text). Location section
 *     runs in `floating` mode for free-floating events (autocomplete
 *     editable; coords + location PATCH together when Places resolves)
 *     or `anchored` mode (read-only badge — Q1=A immutability).
 *
 * Cache contract: every successful POST/PATCH/DELETE invalidates
 * `["career-events", "all"]` and `["career-growth"]` — same keys the
 * sidebar badge + events list rely on.
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CalendarDays, Images, ListChecks, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { WorklogEventEditorRail, type RailTab } from "./worklog-event-editor-rail";
import { EventLocationSection } from "./event-location-section";
import { EventPropertiesFields } from "./event-properties-fields";
import { EventPhotosSection } from "./event-photos-section";
import { EventDeleteConfirm } from "./event-delete-confirm";
import { eventPatchUrl, eventPhotosUrl } from "./event-patch-url";

// ── Types ────────────────────────────────────────────────────────────

/**
 * Existing-event data shape passed to the editor in `mode="existing"`.
 * Mirrors the row shape returned by `GET /api/events`. Local to this
 * file because no other surface needs the full editor view yet.
 */
export interface EventEditorData {
  id: string;
  workHistoryId: string | null;
  title: string;
  description: string | null;
  category: string;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
  metrics: string | null;
}

interface AnchoredJobInfo {
  company: string;
  title: string | null;
  location: string | null;
}

interface NewEventEditorProps {
  mode: "new";
  /** Pre-filled coords from the map FAB deep-link path. */
  initialCoords?: { lat: number; lng: number } | null;
  /** Pre-filled location text from the map FAB reverse-geocode. */
  initialLocation?: string;
}

interface ExistingEventEditorProps {
  mode: "existing";
  event: EventEditorData;
  /** Resolved when the event is anchored — looked up by the route shell. */
  anchoredJob?: AnchoredJobInfo | null;
}

export type WorklogEventEditorProps = NewEventEditorProps | ExistingEventEditorProps;

// ── Component ────────────────────────────────────────────────────────

export function WorklogEventEditor(props: WorklogEventEditorProps) {
  if (props.mode === "new") {
    return <NewEventEditor {...props} />;
  }
  return <ExistingEventEditor {...props} />;
}

// ── New-event (draft) editor ─────────────────────────────────────────

function NewEventEditor({ initialCoords, initialLocation }: NewEventEditorProps) {
  const router = useRouter();
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("company_event");
  const [startDate, setStartDate] = useState(() => todayLocalDateInput());
  const [endDate, setEndDate] = useState("");
  const [metrics, setMetrics] = useState("");

  // Location state — three resolutions:
  //   • selectedJobId set:                      anchored
  //   • addressText + addressCoords both set:   free-floating
  //   • neither:                                submit blocked
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [addressText, setAddressText] = useState(initialLocation ?? "");
  const [addressCoords, setAddressCoords] = useState<
    { lat: number; lng: number } | null
  >(initialCoords ?? null);
  const [coordsLoading, setCoordsLoading] = useState(false);

  // Photo queue — files are held client-side until create.mutate() resolves,
  // then flushed to the photos endpoint of the newly-created event
  // (see onSuccess). ADR-0034 follow-up.
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);

  // Auto-focus the title on mount — same as the notes editor.
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const create = useMutation({
    mutationFn: async () => {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) throw new Error("Title is required");

      const basePayload = {
        title: trimmedTitle,
        category: category.trim() || "other",
        description: description.trim() ? description.trim() : null,
        startDate: dateInputToIso(startDate),
        endDate: dateInputToIso(endDate),
        metrics: metrics.trim() ? metrics.trim() : null,
      };

      // Anchored path
      if (selectedJobId) {
        const res = await fetch(
          `/api/work-history/${encodeURIComponent(selectedJobId)}/events`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(basePayload),
          },
        );
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `POST failed (${res.status})`);
        }
        return (await res.json()) as { id: string };
      }

      // Free-floating path
      const trimmedAddress = addressText.trim();
      if (!trimmedAddress) throw new Error("Pick a job or enter a location");
      if (!addressCoords) {
        throw new Error(
          coordsLoading
            ? "Looking up location coordinates — try again in a moment."
            : "Pick an address from the suggestions so we can map it.",
        );
      }
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...basePayload,
          location: trimmedAddress,
          lat: addressCoords.lat,
          lng: addressCoords.lng,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `POST failed (${res.status})`);
      }
      return (await res.json()) as { id: string };
    },
    onSuccess: (created) => {
      toast.success("Event added");
      qc.invalidateQueries({ queryKey: ["career-events", "all"] });
      qc.invalidateQueries({ queryKey: ["career-growth"] });

      // Queue-and-flush — sequential uploads to dodge per-event contention.
      // The event itself succeeded, so navigate regardless of photo failures;
      // surface upload errors via toast so the user knows to retry from
      // the existing-event view.
      void (async () => {
        if (pendingPhotos.length > 0) {
          const photosUrl = eventPhotosUrl({ id: created.id, workHistoryId: selectedJobId });
          let failures = 0;
          for (const file of pendingPhotos) {
            const fd = new FormData();
            fd.append("file", file);
            try {
              const res = await fetch(photosUrl, { method: "POST", body: fd });
              if (!res.ok) failures++;
            } catch {
              failures++;
            }
          }
          if (failures > 0) {
            toast.error(
              `${failures} of ${pendingPhotos.length} photo${pendingPhotos.length === 1 ? "" : "s"} failed to upload`,
            );
          }
        }
        // Replace so back button skips the empty draft URL.
        router.replace(`/worklog/events/${created.id}`);
      })();
    },
    onError: (e: Error) => toast.error(e.message || "Could not create event"),
  });

  const hasWhere =
    selectedJobId !== null ||
    (addressText.trim().length > 0 && addressCoords !== null);
  const canSubmit = title.trim().length > 0 && hasWhere && !create.isPending;

  // Viewport gate — below xl the rail is `hidden xl:flex`, so the same
  // Properties body remounts INLINE below the textarea. Gated by JS (not
  // CSS alone) so EventLocationSection's Places listeners only mount in
  // one place at a time. Mirrors `useIsXl` pattern from worklog-note-reader.
  const isXl = useIsXl();

  const propsBody = (
    <div className="space-y-4 divide-y divide-border">
      <section>
        <EventLocationSection
          mode="draft"
          selectedJobId={selectedJobId}
          onSelectJob={(id) => {
            setSelectedJobId(id);
            if (id !== null) {
              // Picking a chip clears address state.
              setAddressText("");
              setAddressCoords(null);
              setCoordsLoading(false);
            }
          }}
          addressText={addressText}
          addressCoords={addressCoords}
          coordsLoading={coordsLoading}
          onAddressTextChange={(next) => {
            if (selectedJobId !== null) setSelectedJobId(null);
            setAddressText(next);
            if (addressCoords) setAddressCoords(null);
          }}
          onPlaceSelected={() => setCoordsLoading(true)}
          onCoordsResolved={(c) => {
            setAddressCoords(c);
            setCoordsLoading(false);
          }}
          disabled={create.isPending}
        />
      </section>
      <section className="pt-4">
        <EventPropertiesFields
          category={category}
          onCategoryChange={setCategory}
          startDate={startDate}
          onStartDateChange={setStartDate}
          endDate={endDate}
          onEndDateChange={setEndDate}
          metrics={metrics}
          onMetricsChange={setMetrics}
          disabled={create.isPending}
        />
      </section>
    </div>
  );

  const photosBody = (
    <EventPhotosSection
      eventId={null}
      workHistoryId={selectedJobId}
      pendingFiles={pendingPhotos}
      onPendingChange={setPendingPhotos}
      disabled={create.isPending}
    />
  );

  const railTabs: RailTab[] = [
    { id: "properties", label: "Properties", icon: ListChecks, content: propsBody },
    {
      id: "photos",
      label: "Photos",
      icon: Images,
      content: photosBody,
      badge: pendingPhotos.length,
    },
  ];

  return (
    <div className="h-full flex flex-row min-h-0">
      {/* ── Main content column ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Toolbar */}
        <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 md:px-6 py-2.5 flex-shrink-0">
          <Link
            href="/worklog/events"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to events
          </Link>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5 text-fuchsia-500" />
            <span>New event · draft</span>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => create.mutate()}
            disabled={!canSubmit}
          >
            {create.isPending && (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            )}
            Save event
          </Button>
        </header>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-4">
            <Input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Event title…"
              className={cn(
                "border-0 shadow-none px-0 text-2xl md:text-3xl font-semibold tracking-tight",
                "focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/50",
              )}
              disabled={create.isPending}
            />
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              placeholder="What happened? A few sentences of context."
              rows={6}
              className={cn(
                "border-0 shadow-none px-0 text-sm leading-relaxed resize-none",
                "focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/50",
              )}
              disabled={create.isPending}
            />

            {/* Inline Properties + Photos — only mount at < xl (rail owns
                the same bodies at xl+). `xl:hidden` covers the
                SSR→hydration window before `isXl` flips. Layout reads
                Title → Description → Photos → Properties. */}
            {!isXl && (
              <div className="xl:hidden mt-6 pt-6 border-t border-border/60 space-y-6">
                <div>{photosBody}</div>
                <div className="pt-6 border-t border-border/60">
                  <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                    Properties
                  </h2>
                  {propsBody}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Right-rail (Properties + Photos) — xl+ only ─────────── */}
      {isXl && <WorklogEventEditorRail tabs={railTabs} />}
    </div>
  );
}

// ── Existing-event editor ────────────────────────────────────────────

function ExistingEventEditor({ event, anchoredJob }: ExistingEventEditorProps) {
  const router = useRouter();
  const qc = useQueryClient();

  // Local state — initialized from the event row, then mirrored back via
  // PATCH on commit.
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description ?? "");
  const [category, setCategory] = useState(event.category || "company_event");
  const [startDate, setStartDate] = useState(isoToDateInput(event.startDate));
  const [endDate, setEndDate] = useState(isoToDateInput(event.endDate));
  const [metrics, setMetrics] = useState(event.metrics ?? "");

  // For free-floating events, location is editable. We still hold address
  // + coords in local state so the autocomplete can update them mid-edit.
  const [addressText, setAddressText] = useState(event.location ?? "");
  const [addressCoords, setAddressCoords] = useState<
    { lat: number; lng: number } | null
  >(event.lat != null && event.lng != null ? { lat: event.lat, lng: event.lng } : null);
  const [coordsLoading, setCoordsLoading] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null);

  // Re-sync local state if the underlying event row changes (e.g. cache
  // refetch after a mutation succeeded elsewhere).
  useEffect(() => {
    setTitle(event.title);
    setDescription(event.description ?? "");
    setCategory(event.category || "company_event");
    setStartDate(isoToDateInput(event.startDate));
    setEndDate(isoToDateInput(event.endDate));
    setMetrics(event.metrics ?? "");
    setAddressText(event.location ?? "");
    setAddressCoords(
      event.lat != null && event.lng != null
        ? { lat: event.lat, lng: event.lng }
        : null,
    );
  }, [event]);

  const isFloating = event.workHistoryId === null;

  const url = useMemo(
    () => eventPatchUrl({ id: event.id, workHistoryId: event.workHistoryId }),
    [event.id, event.workHistoryId],
  );

  // Single-field PATCH commit. Optimistic-ish: surfaces errors via toast
  // and re-fetches the canonical row on success so any server-side
  // normalization (trim, slice) is reflected.
  const commitField = async (key: string, body: Record<string, unknown>) => {
    setSavingField(key);
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `PATCH failed (${res.status})`);
      }
      qc.invalidateQueries({ queryKey: ["career-events", "all"] });
      qc.invalidateQueries({ queryKey: ["career-growth"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      toast.error(msg);
    } finally {
      setSavingField(null);
    }
  };

  const isSaving = savingField !== null;
  const locationMode: "anchored" | "floating" = isFloating ? "floating" : "anchored";

  // Viewport gate — see NewEventEditor for rationale (single-mount of
  // EventLocationSection across rail vs inline).
  const isXl = useIsXl();

  const propsBody = (
    <div className="space-y-4 divide-y divide-border">
      <section>
        <EventLocationSection
          mode={locationMode}
          addressText={addressText}
          addressCoords={addressCoords}
          coordsLoading={coordsLoading}
          onAddressTextChange={(next) => {
            setAddressText(next);
            if (addressCoords) setAddressCoords(null);
          }}
          onPlaceSelected={() => setCoordsLoading(true)}
          onCoordsResolved={(c) => {
            setAddressCoords(c);
            setCoordsLoading(false);
          }}
          onAddressCommit={() => {
            // Floating-only: PATCH location + lat + lng together.
            // The free-floating route rejects null geo, so we only
            // commit when all three are present.
            if (!isFloating) return;
            const trimmed = addressText.trim();
            if (!trimmed || !addressCoords) return;
            void commitField("location", {
              location: trimmed,
              lat: addressCoords.lat,
              lng: addressCoords.lng,
            });
          }}
          anchoredJob={anchoredJob ?? null}
        />
      </section>
      <section className="pt-4">
        <EventPropertiesFields
          category={category}
          onCategoryChange={setCategory}
          onCategoryCommit={() => {
            if (category !== event.category) {
              void commitField("category", { category });
            }
          }}
          startDate={startDate}
          onStartDateChange={setStartDate}
          onStartDateCommit={() => {
            const iso = dateInputToIso(startDate);
            if (iso !== event.startDate) {
              void commitField("startDate", { startDate: iso });
            }
          }}
          endDate={endDate}
          onEndDateChange={setEndDate}
          onEndDateCommit={() => {
            const iso = dateInputToIso(endDate);
            if (iso !== event.endDate) {
              void commitField("endDate", { endDate: iso });
            }
          }}
          metrics={metrics}
          onMetricsChange={setMetrics}
          onMetricsCommit={() => {
            const next = metrics.trim() ? metrics.trim() : null;
            if (next !== event.metrics) {
              void commitField("metrics", { metrics: next });
            }
          }}
        />
      </section>
    </div>
  );

  const photosBody = (
    <EventPhotosSection
      eventId={event.id}
      workHistoryId={event.workHistoryId}
      disabled={isSaving}
    />
  );

  const railTabs: RailTab[] = [
    { id: "properties", label: "Properties", icon: ListChecks, content: propsBody },
    { id: "photos", label: "Photos", icon: Images, content: photosBody },
  ];

  return (
    <div className="h-full flex flex-row min-h-0">
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 md:px-6 py-2.5 flex-shrink-0">
          <Link
            href="/worklog/events"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to events
          </Link>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5 text-fuchsia-500" />
            <span>{isFloating ? "Free-floating event" : "Anchored event"}</span>
            {isSaving && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/70 ml-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving…
              </span>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Delete
          </Button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-4">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                if (title.trim() && title !== event.title) {
                  void commitField("title", { title: title.trim() });
                }
              }}
              maxLength={200}
              placeholder="Event title…"
              className={cn(
                "border-0 shadow-none px-0 text-2xl md:text-3xl font-semibold tracking-tight",
                "focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/50",
              )}
            />
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => {
                const next = description.trim() ? description.trim() : null;
                if (next !== event.description) {
                  void commitField("description", { description: next });
                }
              }}
              maxLength={2000}
              placeholder="What happened? A few sentences of context."
              rows={6}
              className={cn(
                "border-0 shadow-none px-0 text-sm leading-relaxed resize-none",
                "focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/50",
              )}
            />

            {/* Inline Properties + Photos — only mount at < xl (rail owns
                the same bodies at xl+). `xl:hidden` covers the
                SSR→hydration window before `isXl` flips. Layout reads
                Title → Description → Photos → Properties. */}
            {!isXl && (
              <div className="xl:hidden mt-6 pt-6 border-t border-border/60 space-y-6">
                <div>{photosBody}</div>
                <div className="pt-6 border-t border-border/60">
                  <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                    Properties
                  </h2>
                  {propsBody}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Right-rail (Properties + Photos) — xl+ only ─────────── */}
      {isXl && <WorklogEventEditorRail tabs={railTabs} />}

      <EventDeleteConfirm
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        event={{ id: event.id, workHistoryId: event.workHistoryId, title: event.title }}
        onDeleted={() => router.replace("/worklog/events")}
      />
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function isoToDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function dateInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function todayLocalDateInput(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * useIsXl — inline matchMedia hook for `(min-width: 1280px)` (Tailwind `xl`).
 * SSR-safe: returns false until the client effect runs, so server-rendered
 * HTML matches the sub-xl layout (inline Properties block) and the rail
 * mounts only after hydration confirms xl+. Mirrors the same-named hook
 * in worklog-note-reader.tsx — kept local to avoid a one-off shared file.
 */
function useIsXl(): boolean {
  const [isXl, setIsXl] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1280px)");
    const update = () => setIsXl(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isXl;
}
