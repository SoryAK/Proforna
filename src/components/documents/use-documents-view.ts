"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Crumb, Doc, DocFolder, FolderTreeNode, ViewMode } from "./types";
import { DEFAULT_VIEW_MODE, VIEW_MODE_STORAGE_KEY } from "./types";

/**
 * Hook that owns the documents view state:
 *   - current folder (URL: ?folderId=<uuid>; absent = root)
 *   - view mode (localStorage: docs-view; "grid" | "list")
 *   - search query (local component state)
 *   - folders flat list + tree
 *   - documents for the current folder
 *   - breadcrumb path from root → current folder
 *
 * Folder list is fetched once and cached as ["document-folders"].
 * Documents are scoped per folder: ["documents", folderKey].
 */
export function useDocumentsView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const folderId = searchParams.get("folderId");
  const folderKey = folderId ?? "root";

  // ── view mode (persisted in localStorage) ──────────────────────────────
  const [viewMode, setViewModeState] = useState<ViewMode>(DEFAULT_VIEW_MODE);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (stored === "grid" || stored === "list") setViewModeState(stored);
  }, []);
  const setViewMode = useCallback((next: ViewMode) => {
    setViewModeState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, next);
    }
  }, []);

  // ── search ─────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");

  // ── navigation ─────────────────────────────────────────────────────────
  const navigateToFolder = useCallback(
    (nextFolderId: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextFolderId) params.set("folderId", nextFolderId);
      else params.delete("folderId");
      const qs = params.toString();
      router.push(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, searchParams]
  );

  // ── folders (flat list) ────────────────────────────────────────────────
  const foldersQuery = useQuery<DocFolder[]>({
    queryKey: ["document-folders"],
    queryFn: () => fetch("/api/document-folders").then((r) => r.json()),
  });
  const folders = foldersQuery.data ?? [];

  // ── documents for current folder ───────────────────────────────────────
  const docsQuery = useQuery<Doc[]>({
    queryKey: ["documents", folderKey],
    queryFn: () => {
      const params = new URLSearchParams({ folderId: folderKey });
      return fetch(`/api/documents?${params}`).then((r) => r.json());
    },
  });
  const docs = docsQuery.data ?? [];

  // ── derived: folder tree + lookup ──────────────────────────────────────
  const folderById = useMemo(() => {
    const m = new Map<string, DocFolder>();
    for (const f of folders) m.set(f.id, f);
    return m;
  }, [folders]);

  const folderTree = useMemo<FolderTreeNode[]>(() => {
    const nodes = new Map<string, FolderTreeNode>();
    for (const f of folders) nodes.set(f.id, { folder: f, children: [] });
    const roots: FolderTreeNode[] = [];
    for (const node of nodes.values()) {
      const parentId = node.folder.parentId;
      if (parentId && nodes.has(parentId)) {
        nodes.get(parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    const sortRec = (list: FolderTreeNode[]) => {
      list.sort((a, b) => a.folder.name.localeCompare(b.folder.name));
      for (const n of list) sortRec(n.children);
    };
    sortRec(roots);
    return roots;
  }, [folders]);

  /** Folders to render in the current view (children of the current folder). */
  const currentChildFolders = useMemo<DocFolder[]>(() => {
    return folders
      .filter((f) => (f.parentId ?? null) === folderId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [folders, folderId]);

  /** Breadcrumb path: always starts with the "Documents" root crumb (id=null). */
  const breadcrumb = useMemo<Crumb[]>(() => {
    const path: Crumb[] = [{ id: null, name: "Documents" }];
    if (!folderId) return path;
    // Walk up via parentId until we hit root; safe because folderById is bounded by folders length.
    const chain: DocFolder[] = [];
    let cursor: DocFolder | undefined = folderById.get(folderId);
    const guard = new Set<string>();
    while (cursor && !guard.has(cursor.id)) {
      guard.add(cursor.id);
      chain.unshift(cursor);
      cursor = cursor.parentId ? folderById.get(cursor.parentId) : undefined;
    }
    for (const f of chain) path.push({ id: f.id, name: f.name });
    return path;
  }, [folderId, folderById]);

  // ── search filter (applies to current folder only; deep search comes later) ─
  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(
      (d) => d.name.toLowerCase().includes(q) || d.fileName.toLowerCase().includes(q)
    );
  }, [docs, search]);

  const filteredFolders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return currentChildFolders;
    return currentChildFolders.filter((f) => f.name.toLowerCase().includes(q));
  }, [currentChildFolders, search]);

  return {
    // state
    folderId,
    folderKey,
    viewMode,
    setViewMode,
    search,
    setSearch,
    // queries
    foldersQuery,
    docsQuery,
    // data
    folders,
    folderById,
    folderTree,
    currentChildFolders,
    filteredFolders,
    docs,
    filteredDocs,
    breadcrumb,
    // actions
    navigateToFolder,
  };
}
