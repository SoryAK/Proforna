/**
 * useWorklogData — fetches all read-only data needed by the worklog page:
 * logs, templates, positions, equipment, assets. Also builds id→entity maps
 * for O(1) lookups during rendering.
 *
 * All queries are owned here so components never call `fetch` directly.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { WorkLog, Template, Position } from "@/types/worklog";
import type { EquipmentItem } from "@/components/equipment-picker";
import type { JobAsset } from "@/components/asset-picker";

export function useWorklogData() {
  const { data: logs = [], isLoading: loadingLogs } = useQuery<WorkLog[]>({
    queryKey: ["worklogs"],
    queryFn: () => fetch("/api/work-logs").then((r) => r.json()),
  });

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["worklog-templates"],
    queryFn: () => fetch("/api/work-logs/templates").then((r) => r.json()),
  });

  const { data: positions = [] } = useQuery<Position[]>({
    queryKey: ["work-history"],
    queryFn: () => fetch("/api/work-history").then((r) => r.json()),
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
