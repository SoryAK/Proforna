/**
 * useWorklogDeepLinks — wires the 5 URL-driven entry points the rest of the
 * app uses to jump into the worklog page:
 *
 *   • ?focus=<logId>          → clear filters, scroll the row into view, then strip the param
 *   • ?focusPosition=<id>     → pre-filter timeline to one position
 *   • ?focusEquipment=<id>    → pre-filter timeline to one equipment item
 *   • ?focusAsset=<id>        → pre-filter timeline to one job asset
 *   • ?new=1[&positionId=<id>] → open quick-add editor pre-filled with the position
 *
 * The hook owns the URL reads + cleanups; it calls back into the orchestrator
 * via the provided actions object to mutate state.
 */

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { WorkLog } from "@/types/worklog";

export interface WorklogDeepLinkActions {
  setSelectedDate: (d: Date | null) => void;
  setFilterPositionId: (v: string) => void;
  setFilterEquipmentId: (v: string) => void;
  setFilterAssetId: (v: string) => void;
  setTab: (t: "timeline" | "templates") => void;
  setEditing: (e: Partial<WorkLog> | null) => void;
  setShowQuickAdd: (v: boolean) => void;
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

  // ?focus=<id>: scroll-into-view + highlight, then strip the param.
  useEffect(() => {
    if (!focusId) return;
    const target = logs.find((l) => l.id === focusId);
    if (!target) return; // wait for data — effect re-runs on logs change
    actions.setSelectedDate(null);
    actions.clearAllFilters();
    actions.setTab("timeline");
    const t = setTimeout(() => {
      const el = document.getElementById(`worklog-row-${focusId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    const t2 = setTimeout(() => {
      router.replace("/worklog", { scroll: false });
    }, 1500);
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, logs, router]);

  // ?focusPosition=<id>
  useEffect(() => {
    if (!focusPositionId) return;
    actions.setFilterPositionId(focusPositionId);
    actions.setTab("timeline");
    const t = setTimeout(() => router.replace("/worklog", { scroll: false }), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPositionId, router]);

  // ?focusEquipment=<id>
  useEffect(() => {
    if (!focusEquipmentId) return;
    actions.setFilterEquipmentId(focusEquipmentId);
    actions.setTab("timeline");
    const t = setTimeout(() => router.replace("/worklog", { scroll: false }), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusEquipmentId, router]);

  // ?focusAsset=<id>
  useEffect(() => {
    if (!focusAssetId) return;
    actions.setFilterAssetId(focusAssetId);
    actions.setTab("timeline");
    const t = setTimeout(() => router.replace("/worklog", { scroll: false }), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusAssetId, router]);

  // ?new=1[&positionId=<id>]
  useEffect(() => {
    if (newParam !== "1") return;
    actions.setEditing({
      date: new Date().toISOString(),
      title: "",
      category: "task",
      positionId: newPositionId ?? null,
      isNotable: false,
      content: "",
      hours: null,
      tags: null,
      mood: null,
      equipmentIds: [],
      assetIds: [],
      templateId: null,
    });
    actions.setShowQuickAdd(true);
    const t = setTimeout(() => router.replace("/worklog", { scroll: false }), 100);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newParam, newPositionId, router]);

  // Surface focusId so the timeline can apply its highlight class to the matching row.
  return { focusId };
}
