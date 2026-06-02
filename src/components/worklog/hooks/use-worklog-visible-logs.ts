/**
 * useWorklogVisibleLogs — composes the visible notes list from:
 *   activeFolder × filters × selectedDate × search.
 *
 * Owns the underlying `useWorklogFilters` + `useWorklogFolders` so the
 * orchestrator doesn't have to thread them, and keeps the folder→filter
 * sync effect (so legacy callers of the filter setters still get the
 * invariants they expect).
 */

import { useEffect, useMemo } from "react";
import { isSameDay, parseISO } from "date-fns";
import type { WorkLog } from "@/types/worklog";
import { useWorklogFilters } from "@/components/worklog/hooks/use-worklog-filters";
import { useWorklogFolders } from "@/components/worklog/hooks/use-worklog-folders";
import { collectDescendantIds } from "@/lib/worklog-folders";
import type { FolderSelection } from "@/components/worklog/worklog-folders-rail";

export function useWorklogVisibleLogs(
  logs: WorkLog[],
  activeFolder: FolderSelection,
  selectedDate: Date | null,
  search: string,
) {
  const {
    filterPositionId,
    setFilterPositionId,
    setFilterCategory,
    filterNotable,
    setFilterNotable,
    filterEquipmentId,
    setFilterEquipmentId,
    filterAssetId,
    setFilterAssetId,
    isAnyFilterActive,
    clearAll: clearAllFilters,
  } = useWorklogFilters(logs);

  // Sync the folder selection into the underlying category/notable filters
  // so useWorklogFilters' invariants stay intact even though we compute the
  // visible list ourselves below.
  useEffect(() => {
    if (activeFolder.kind === "category") {
      setFilterCategory(activeFolder.category);
      setFilterNotable(false);
    } else if (activeFolder.kind === "notable") {
      setFilterCategory("all");
      setFilterNotable(true);
    } else {
      setFilterCategory("all");
      setFilterNotable(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFolder]);

  const { folders: userFolders } = useWorklogFolders();

  const visibleLogs = useMemo(() => {
    let out = logs;
    if (activeFolder.kind === "category") {
      out = out.filter((l) => l.category === activeFolder.category);
    } else if (activeFolder.kind === "notable") {
      out = out.filter((l) => l.isNotable || l.accomplishment);
    } else if (activeFolder.kind === "folder") {
      const ids = collectDescendantIds(userFolders, activeFolder.folderId);
      out = out.filter((l) => l.folderId != null && ids.has(l.folderId));
    } else if (activeFolder.kind === "unfiled") {
      out = out.filter((l) => l.folderId == null);
    }
    if (filterPositionId !== "all") {
      if (filterPositionId === "none") out = out.filter((l) => !l.positionId);
      else out = out.filter((l) => l.positionId === filterPositionId);
    }
    if (filterEquipmentId !== "all") {
      out = out.filter((l) => (l.equipmentIds ?? []).includes(filterEquipmentId));
    }
    if (filterAssetId !== "all") {
      out = out.filter((l) => (l.assetIds ?? []).includes(filterAssetId));
    }
    if (filterNotable && activeFolder.kind !== "notable") {
      out = out.filter((l) => l.isNotable || l.accomplishment);
    }
    if (selectedDate) {
      out = out.filter((l) => isSameDay(parseISO(l.date), selectedDate));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((l) => {
        const hay = `${l.title ?? ""} ${l.content ?? ""} ${l.tags ?? ""}`.toLowerCase();
        return hay.includes(q);
      });
    }
    return out;
  }, [
    logs,
    activeFolder,
    userFolders,
    filterPositionId,
    filterEquipmentId,
    filterAssetId,
    filterNotable,
    selectedDate,
    search,
  ]);

  return {
    visibleLogs,
    filterPositionId,
    setFilterPositionId,
    filterNotable,
    setFilterNotable,
    filterEquipmentId,
    setFilterEquipmentId,
    filterAssetId,
    setFilterAssetId,
    isAnyFilterActive,
    clearAllFilters,
  };
}
