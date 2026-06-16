/**
 * useWorklogData — fetches all read-only data needed by the worklog page:
 * logs, templates, positions, equipment, assets. Also builds id→entity maps
 * for O(1) lookups during rendering.
 *
 * All queries are owned here so components never call `fetch` directly.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { WorkLog, Template, Position } from "@/types/worklog";
import type { EquipmentItem } from "@/components/equipment-picker";
import type { JobAsset } from "@/components/asset-picker";
import {
  cacheGetAllLogs,
  cacheReplaceAllLogs,
} from "@/lib/worklog/worklog-cache";

async function fetchArrayOrThrow<T>(url: string): Promise<T[]> {
  const r = await fetch(url);
  if (!r.ok) {
    const message = await r.text();
    throw new Error(message || `Request failed for ${url}`);
  }
  const json = await r.json();
  if (!Array.isArray(json)) {
    throw new Error(`Unexpected response shape for ${url}`);
  }
  return json as T[];
}

export function useWorklogData() {
  // Seed the worklog list from Dexie on mount so the page paints instantly
  // (and works offline). `null` = not-yet-checked; `[] / WorkLog[]` = decided.
  const [cachedLogs, setCachedLogs] = useState<WorkLog[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    cacheGetAllLogs().then((rows) => {
      if (cancelled) return;
      setCachedLogs(rows ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const {
    data: logs = [],
    isLoading: loadingLogs,
    isSuccess: logsLoaded,
  } = useQuery<WorkLog[]>({
    queryKey: ["worklogs"],
    // ADR-0026 — fetch BOTH archived and non-archived in a single round
    // trip so client-side bucket-filtering (Inbox vs Archived sidebar row)
    // doesn't refetch. The default API behavior hides archived rows; we
    // opt-in here because the worklog shell owns the bucket toggle.
    //
    // ADR-0029 P0 follow-up — `kind=any` so that navigating to
    // /worklog/notes/<id> with a procedure id still renders the row in
    // the reader. The shell is the single mount for both /worklog/notes
    // and /worklog/procedures detail views; without `kind=any` the list
    // would not contain the selected procedure and the reader would 404.
    //
    // Trade-off: the notes list rail now mixes both kinds. Sidebar
    // badges remain kind-scoped (Notes count = notes only, Procedures
    // count = procedures only) so totals will not match list length.
    // Acceptable until either (a) procedures get a dedicated detail
    // route or (b) the reader does a side-fetch by id and the list
    // returns to kind-pure. See parked-ideas backlog.
    queryFn: () =>
      fetchArrayOrThrow<WorkLog>("/api/work-logs?archived=all&kind=any"),
    // `offlineFirst`: still try the network, but keep cached data on failure.
    networkMode: "offlineFirst",
    // Use cached rows as initial data once Dexie has been consulted.
    initialData: cachedLogs && cachedLogs.length > 0 ? cachedLogs : undefined,
    initialDataUpdatedAt: 0, // force a background refetch even with initialData
  });

  // Mirror server responses to the cache for the next cold load.
  useEffect(() => {
    if (!logsLoaded) return;
    void cacheReplaceAllLogs(logs);
  }, [logsLoaded, logs]);

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["worklog-templates"],
    queryFn: () => fetchArrayOrThrow<Template>("/api/work-logs/templates"),
  });

  const { data: positions = [] } = useQuery<Position[]>({
    queryKey: ["work-history"],
    queryFn: () => fetchArrayOrThrow<Position>("/api/work-history"),
    staleTime: 60_000,
  });

  const { data: equipment = [] } = useQuery<EquipmentItem[]>({
    queryKey: ["personal-equipment"],
    queryFn: async () => {
      const r = await fetch("/api/personal-equipment");
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 60_000,
  });

  const { data: assets = [] } = useQuery<JobAsset[]>({
    queryKey: ["job-assets"],
    queryFn: async () => {
      const r = await fetch("/api/job-assets");
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 60_000,
  });

  const positionMap = useMemo(() => {
    const m = new Map<string, Position>();
    positions.forEach((p) => m.set(p.id, p));
    return m;
  }, [positions]);

  const equipmentMap = useMemo(() => {
    const m = new Map<string, EquipmentItem>();
    equipment.forEach((e) => m.set(e.id, e));
    return m;
  }, [equipment]);

  const assetMap = useMemo(() => {
    const m = new Map<string, JobAsset>();
    assets.forEach((a) => m.set(a.id, a));
    return m;
  }, [assets]);

  return {
    logs,
    loadingLogs,
    templates,
    positions,
    equipment,
    assets,
    positionMap,
    equipmentMap,
    assetMap,
  };
}
