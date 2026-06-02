/**
 * useWorklogDeepLinks — wires the URL-driven entry points the rest of the app
 * uses to jump into the worklog page.
 *
 *   • ?focus=<logId>          → clear filters, select that note, then strip the param
 *   • ?focusPosition=<id>     → pre-filter to one position
 *   • ?focusEquipment=<id>    → pre-filter to one equipment item
 *   • ?focusAsset=<id>        → pre-filter to one job asset
 *   • ?new=1[&positionId=<id>] → create a blank note (optionally pre-linked)
 *
 * The hook owns the URL reads + cleanups; it calls back into the orchestrator
 * via the provided actions object to mutate state.
 */

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { WorkLog } from "@/types/worklog";
import type { FolderSelection } from "@/components/worklog/worklog-folders-rail";

export interface WorklogDeepLinkActions {
  setSelectedDate: (d: Date | null) => void;
  setFilterPositionId: (v: string) => void;
  setFilterEquipmentId: (v: string) => void;
  setFilterAssetId: (v: string) => void;
  setActiveFolder: (f: FolderSelection) => void;
  setSelectedNoteId: (id: string | null) => void;
  createBlankNote: (opts: { positionId: string | null }) => void;
  clearAllFilters: () => void;
}

export function useWorklogDeepLinks(logs: WorkLog[], actions: WorklogDeepLinkActions) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const focusId = searchParams.get("focus");
  const focusPositionId = searchParams.get("focusPosition");
  const focusEquipmentId = searchParams.get("focusEquipment");
  const focusAssetId = searchParams.get("focusAsset");
  const newParam = searchParams.get("new");
  const newPositionId = searchParams.get("positionId");

  // ?focus=<id>: select + scroll-into-view, then strip the param.
  useEffect(() => {
    if (!focusId) return;
    const target = logs.find((l) => l.id === focusId);
    if (!target) return; // wait for data — effect re-runs on logs change
    actions.setSelectedDate(null);
    actions.clearAllFilters();
    actions.setActiveFolder({ kind: "all" });
    actions.setSelectedNoteId(focusId);
    const t = setTimeout(() => {
      router.replace("/worklog", { scroll: false });
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, logs, router]);

  // ?focusPosition=<id>
  useEffect(() => {
    if (!focusPositionId) return;
    actions.setActiveFolder({ kind: "all" });
    actions.setFilterPositionId(focusPositionId);
    const t = setTimeout(() => router.replace("/worklog", { scroll: false }), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPositionId, router]);

  // ?focusEquipment=<id>
  useEffect(() => {
    if (!focusEquipmentId) return;
    actions.setActiveFolder({ kind: "all" });
    actions.setFilterEquipmentId(focusEquipmentId);
    const t = setTimeout(() => router.replace("/worklog", { scroll: false }), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusEquipmentId, router]);

  // ?focusAsset=<id>
  useEffect(() => {
    if (!focusAssetId) return;
    actions.setActiveFolder({ kind: "all" });
    actions.setFilterAssetId(focusAssetId);
    const t = setTimeout(() => router.replace("/worklog", { scroll: false }), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusAssetId, router]);

  // ?new=1[&positionId=<id>] — create a blank note immediately.
  useEffect(() => {
    if (newParam !== "1") return;
    actions.setActiveFolder({ kind: "all" });
    actions.createBlankNote({ positionId: newPositionId ?? null });
    const t = setTimeout(() => router.replace("/worklog", { scroll: false }), 100);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newParam, newPositionId, router]);

  // Surface focusId so the list pane can apply a momentary highlight class.
  return { focusId };
}
