/**
 * useImportMutation — single-file POST to /api/work-logs/import.
 *
 * Isolated as a hook so the import dialog (Sprint 4) and the future paste
 * handler (Sprint 5) can share the exact same upload + cache-invalidation
 * semantics.
 *
 * Status discrimination from the server response:
 *   - 201  → { workLog, import, deduped:false }  -> "succeeded"
 *   - 200  → { workLog, import, deduped:true  }  -> "deduped"
 *   - 4xx  → { error, importId? }                -> "failed"
 *   - 413  → too-large (server cap, distinct from client cap)
 *
 * On any new WorkLog (201) we invalidate `["worklogs"]` and `["worklog-folders"]`
 * so the list + folder counts pick up the import immediately.
 */

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { ImportSourceType } from "@/lib/worklog/import/build-import-record";

export type ImportMutationInput = {
  sourceType: ImportSourceType;
  source: string;
  sourceFilename?: string | null;
  folderId?: string | null;
};

export type ImportMutationSuccess = {
  outcome: "created" | "deduped";
  workLog: { id: string; title: string; folderId: string | null };
  import: { id: string; status: string };
};

type ApiCreatedResponse = {
  workLog: { id: string; title: string; folderId: string | null };
  import: { id: string; status: string };
  deduped: boolean;
};

type ApiErrorResponse = {
  error?: string;
  importId?: string;
};

export class ImportRequestError extends Error {
  readonly status: number;
  readonly importId: string | null;
  constructor(message: string, status: number, importId: string | null) {
    super(message);
    this.name = "ImportRequestError";
    this.status = status;
    this.importId = importId;
  }
}

export function useImportMutation() {
  const qc = useQueryClient();

  return useMutation<ImportMutationSuccess, ImportRequestError, ImportMutationInput>({
    mutationFn: async (input) => {
      const res = await fetch("/api/work-logs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: input.sourceType,
          source: input.source,
          sourceFilename: input.sourceFilename ?? undefined,
          folderId: input.folderId ?? undefined,
        }),
      });

      if (!res.ok) {
        let parsed: ApiErrorResponse = {};
        try {
          parsed = (await res.json()) as ApiErrorResponse;
        } catch {
          // body wasn't JSON — fall through with generic message
        }
        const message =
          parsed.error ??
          (res.status === 413
            ? "File exceeds the 5 MB import cap."
            : `Import failed (HTTP ${res.status}).`);
        throw new ImportRequestError(message, res.status, parsed.importId ?? null);
      }

      const body = (await res.json()) as ApiCreatedResponse;
      return {
        outcome: body.deduped ? "deduped" : "created",
        workLog: body.workLog,
        import: body.import,
      };
    },
    onSuccess: (result) => {
      if (result.outcome === "created") {
        // New WorkLog row → refresh the list + folder counts.
        qc.invalidateQueries({ queryKey: ["worklogs"] });
        qc.invalidateQueries({ queryKey: ["worklog-folders"] });
      }
    },
  });
}
