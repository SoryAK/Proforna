/**
 * useWorklogFolders — fetch + CRUD for user-defined WorkLog folders.
 *
 * Mutations invalidate both the folder list (`["worklog-folders"]`) and the
 * note list (`["worklogs"]`) because folder ops affect derived note placement
 * (delete-orphan re-files notes to Unfiled; rename surfaces in note metadata).
 *
 * Cache key shape (single source of truth used by rail + page):
 *   ["worklog-folders"] → { folders: WorkLogFolderWithCount[]; unfiledCount: number }
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkLogFolder, WorkLogFolderWithCount } from "@/types/worklog";

export type FolderListResponse = {
  folders: WorkLogFolderWithCount[];
  unfiledCount: number;
};

const QK = ["worklog-folders"] as const;

export function useWorklogFolders() {
  const qc = useQueryClient();

  const folders = useQuery<FolderListResponse>({
    queryKey: QK,
    queryFn: async () => {
      const res = await fetch("/api/work-logs/folders");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    staleTime: 30_000,
  });

  const createFolder = useMutation({
    mutationFn: async (input: { name: string; parentId?: string | null; color?: string | null }) => {
      const res = await fetch("/api/work-logs/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<WorkLogFolderWithCount>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });

  const updateFolder = useMutation({
    mutationFn: async (
      input: { id: string } & Partial<Pick<WorkLogFolder, "name" | "parentId" | "color" | "icon" | "sortOrder">>,
    ) => {
      const { id, ...patch } = input;
      const res = await fetch(`/api/work-logs/folders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<WorkLogFolder>;
    },
    // Optimistic rename so the rail updates immediately.
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: QK });
      const previous = qc.getQueryData<FolderListResponse>(QK);
      if (previous) {
        qc.setQueryData<FolderListResponse>(QK, {
          ...previous,
          folders: previous.folders.map((f) =>
            f.id === input.id ? { ...f, ...input } as WorkLogFolderWithCount : f,
          ),
        });
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(QK, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QK }),
  });

  const deleteFolder = useMutation({
    mutationFn: async (input: {
      id: string;
      mode: "orphan" | "delete";
      /** Required when `mode === "delete"`. Server compares against folder.name. */
      nameConfirm?: string;
    }) => {
      const url = `/api/work-logs/folders/${input.id}?mode=${input.mode}`;
      const res = await fetch(url, {
        method: "DELETE",
        headers:
          input.mode === "delete" && input.nameConfirm
            ? { "x-folder-name-confirm": input.nameConfirm }
            : undefined,
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      qc.invalidateQueries({ queryKey: ["worklogs"] }); // notes may have been deleted/moved
    },
  });

  return {
    foldersQuery: folders,
    folders: folders.data?.folders ?? [],
    unfiledCount: folders.data?.unfiledCount ?? 0,
    createFolder,
    updateFolder,
    deleteFolder,
  };
}
