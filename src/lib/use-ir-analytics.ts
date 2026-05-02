"use client";

import { useEffect, useRef } from "react";

/**
 * IR engagement-event tracker.
 *
 * Returns a stable `track(eventType, eventData?)` function that batches
 * events and flushes them to /api/ir/events:
 *   - every FLUSH_INTERVAL_MS while the page is visible
 *   - on `visibilitychange` -> hidden  (via sendBeacon)
 *   - on `pagehide` / `beforeunload`   (via sendBeacon)
 *
 * Also auto-fires:
 *   - one "view" event on mount
 *   - "session_heartbeat" every HEARTBEAT_MS while the page is focused
 */

export type IrEventType =
  | "view"
  | "role_click"
  | "contact_open"
  | "contact_method_click"
  | "education_click"
  | "journey_play"
  | "comp_view"
  | "annot_view"
  | "tour_complete"
  | "session_heartbeat";

const FLUSH_INTERVAL_MS = 10_000;
const HEARTBEAT_MS = 30_000;

type Pending = { eventType: IrEventType; eventData?: unknown };

export function useIrAnalytics(slug: string | null | undefined, accessRequestId?: string | null) {
  const pendingRef = useRef<Pending[]>([]);
  const slugRef = useRef(slug);
  const accessRef = useRef(accessRequestId ?? null);
  useEffect(() => { slugRef.current = slug; }, [slug]);
  useEffect(() => { accessRef.current = accessRequestId ?? null; }, [accessRequestId]);

  // Stable enqueue + flush API exposed via ref so consumers don't re-render
  const apiRef = useRef<{
    track: (eventType: IrEventType, eventData?: unknown) => void;
    flush: (useBeacon?: boolean) => void;
  } | null>(null);

  if (apiRef.current === null) {
    apiRef.current = {
      track(eventType, eventData) {
        pendingRef.current.push({ eventType, eventData });
      },
      flush(useBeacon = false) {
        const slugVal = slugRef.current;
        if (!slugVal) return;
        const batch = pendingRef.current;
        if (batch.length === 0) return;
        pendingRef.current = [];
        const body = JSON.stringify({
          irSlug: slugVal,
          accessRequestId: accessRef.current,
          events: batch,
        });
        try {
          if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
            const blob = new Blob([body], { type: "application/json" });
            navigator.sendBeacon("/api/ir/events", blob);
          } else {
            void fetch("/api/ir/events", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body,
              keepalive: true,
              credentials: "same-origin",
            }).catch(() => {
              /* swallow — analytics best-effort */
            });
          }
        } catch {
          /* swallow */
        }
      },
    };
  }

  // Mount: fire initial "view" + set up timers/listeners
  useEffect(() => {
    if (!slug) return;
    const api = apiRef.current!;
    api.track("view");

    const flushTimer = window.setInterval(() => api.flush(false), FLUSH_INTERVAL_MS);
    const heartbeatTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        api.track("session_heartbeat");
      }
    }, HEARTBEAT_MS);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") api.flush(true);
    };
    const onPageHide = () => api.flush(true);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.clearInterval(flushTimer);
      window.clearInterval(heartbeatTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      api.flush(true);
    };
  }, [slug]);

  return apiRef.current!;
}
