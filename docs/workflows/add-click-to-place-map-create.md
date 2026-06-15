# Workflow: Add a click-to-place create surface on a Google Maps view

Recipe for adding a FAB-armed, click-to-place creation surface to an existing Google Maps page (e.g. drop a pin → reverse-geocode → open a create dialog prefilled with coords + address). Anchored events on `career-map`, any future map-based "drop a thing here" flow, etc.

**Last Updated:** 2026-06-15 (validated by ADR-0027 Day 4 Cycle C — `/worklog/map` free-floating event creation)

---

## Stack Context

- **Map:** `@googlemaps/js-api-loader` v2 (NOT v1 `Loader` class — already deprecated in this project, see ADR-0005). `setOptions({ key, v: "weekly" })` + `importLibrary("maps" | "marker" | "geocoding")`.
- **Page shell:** `<FullBleedShell>` (h-full, non-flex). View root MUST be `h-full flex flex-col`. NOT `flex-1 min-h-0` — collapses to 0 height inside FullBleedShell.
- **Dialog primitive:** base-ui `<Dialog>` from `@/components/ui/dialog`. NEVER `window.prompt` / `window.confirm` (Next.js 16 / React 19 throws).
- **Mutation:** TanStack Query v5 `useMutation`. Invalidate the SHARED queryKey (e.g. `["career-events", "all"]`) — never fork. Cache invalidation drives marker re-render.
- **Icons:** `lucide-react`. Plus button is `Plus`, pin is `MapPin`.

---

## Successful Sequence (validated path)

1. **Add the create dialog component** alongside the edit dialog (`event-create-dialog.tsx` mirrors `event-edit-dialog.tsx`). Props shape:

   ```tsx
   { open: boolean; onOpenChange: (b: boolean) => void;
     coords: { lat: number; lng: number } | null;
     defaultLocation: string;
     onCreated?: (id: string) => void; }
   ```

   - Use plain `useState` + `useMutation` (no zod / RHF unless you already have it elsewhere on this surface).
   - Reset effect resets ALL fields when `open` flips true OR `coords`/`defaultLocation` change. Never carry stale state between pins.
   - Pin chip at top of dialog (fuchsia bg, `MapPin` icon, tabular-nums `lat.toFixed(5), lng.toFixed(5)`). Location field is editable, prefilled with `defaultLocation`.
   - On success: invalidate the shared queryKey + any dependent keys (e.g. `["career-growth"]`), toast, close dialog. Marker effect picks up the new item via cache invalidation — no manual rerender.
2. **Extend the map renderer** (`events-map.tsx`) with two new optional props:

   ```tsx
   placeMode?: boolean;
   onPickCoords?: (lat: number, lng: number) => void;
   ```

   New `useEffect` keyed on `[placeMode, ready]`:

   ```ts
   if (!placeMode || !mapRef.current) return;
   const map = mapRef.current;
   map.setOptions({ draggableCursor: "crosshair" });
   const listener = map.addListener("click", (e: google.maps.MapMouseEvent) => {
     const ll = e.latLng;
     if (!ll) return;
     onPickCoords?.(ll.lat(), ll.lng());
     map.setOptions({ draggableCursor: null });
   });
   return () => {
     google.maps.event.removeListener(listener);
     map.setOptions({ draggableCursor: null });
   };
   ```

   Single-shot per arming — parent flips `placeMode` false in its `onPickCoords` handler.
3. **Add state + handlers to the page view** (`worklog-map-view.tsx`):

   ```ts
   const [placeMode, setPlaceMode] = useState(false);
   const [pickedCoords, setPickedCoords] = useState<{lat:number;lng:number}|null>(null);
   const [defaultLocation, setDefaultLocation] = useState("");
   const [dialogOpen, setDialogOpen] = useState(false);
   ```

   `handlePickCoords(lat, lng)`:
   - Set `pickedCoords`, set fallback `defaultLocation` to `${lat.toFixed(5)}, ${lng.toFixed(5)}`, open the dialog, flip `placeMode` off.
   - Then async-reverse-geocode and (best effort) overwrite `defaultLocation` with the first formatted_address.
   - Failure is silent — fallback string is already prefilled.
4. **Add the FAB**:

   ```tsx
   <button
     onClick={() => setPlaceMode(true)}
     className="absolute bottom-5 right-24 z-30 h-12 w-12 rounded-full bg-fuchsia-500 text-white shadow-lg hover:bg-fuchsia-600 ..."
   >
     <Plus className="h-5 w-5" />
   </button>
   ```

   **Right offset MUST clear the global Open AI Chat button** (`fixed bottom-6 right-6 z-40`). `right-24 z-30` is the proven offset.
5. **Add the place-mode banner** (top-center, `absolute top-3 left-1/2 -translate-x-1/2 z-10`, fuchsia bg, "Click anywhere on the map to add a career event · Esc to cancel").
6. **Wire Esc to cancel**:

   ```ts
   useEffect(() => {
     if (!placeMode) return;
     const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPlaceMode(false); };
     window.addEventListener("keydown", onKey);
     return () => window.removeEventListener("keydown", onKey);
   }, [placeMode]);
   ```

7. **Mount the create dialog at the view root**, pass `coords={pickedCoords}` and `defaultLocation`.
8. **Browser smoke test**: arm FAB → click map → confirm crosshair cursor → confirm pin coords prefilled → save → confirm marker appears + list/badge updates via shared queryKey invalidation.

---

## First-Attempt Failures (don't repeat these)

1. **Layout root used `flex-1 min-h-0 flex flex-col`** → map body collapsed to 0 height. `<FullBleedShell>` is `h-full`, not a flex parent — `flex-1` has nothing to grow against. **Fix**: `h-full flex flex-col`.
2. **FAB placed at `bottom-5 right-5 z-10`** → completely hidden behind the global Open AI Chat button (`fixed bottom-6 right-6 z-40`). **Fix**: `bottom-5 right-24 z-30`.
3. **Empty-state was a separate render branch that hid the map** → FAB unreachable when there were no events to plot. **Fix**: render map+FAB always, overlay empty-state nudge with `pointer-events-none` parent + `pointer-events-auto` inner pill.
4. **Stray identifier (`co`) + undeclared `bounds` reference** in the marker effect after a copy-paste edit. TS LSP returned "No errors" (stale `.tsbuildinfo` / Turbopack cache lag) but Turbopack SWC parser correctly failed at runtime. Cycle B's smoke test never hit it because `mappable.length===0` short-circuited above. **Lesson**: when copy-pasting the marker effect from a god-file (`job-map-google.tsx`), grep the new file for any 1-2 char identifiers and verify every variable is declared.
5. **Reaching for Places API for reverse-geocode** → unnecessary scope. **Fix**: `importLibrary("geocoding")` returns `Geocoder`. `geocoder.geocode({ location: { lat, lng } })` is sync-styled async, returns `{ results: GeocoderResult[] }`. Use `result.results[0]?.formatted_address`.

---

## Gotchas

- **The map renderer must touch `window.google` at module-eval time** (typings reference `google.maps.*`). Always dynamic-import with `ssr: false` from the parent view.
- **`importLibrary` is idempotent** — calling it from both the init effect and the geocode handler is fine; the loader caches.
- **`google.maps.event.removeListener` MUST run in the cleanup**, not `listener.remove()`. The latter doesn't exist on the v2 typings.
- **Place-mode listener fires once then resets cursor** — but the cleanup ALSO resets cursor. Both paths are safe / idempotent; don't over-think it.
- **The dialog's location field is editable**, even though we prefill with the geocoded address. Users may want to override "14066 FM2613, Kemp, TX 75143, USA" with "TX countryside near Kemp" for personal labelling.
- **Don't add a back-channel from dialog to map** for "show a temporary preview pin while the dialog is open" — the next cache invalidation on save will paint the real marker. Optimistic preview marker is YAGNI.
