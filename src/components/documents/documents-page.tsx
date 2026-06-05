"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { DocumentsBreadcrumb } from "./documents-breadcrumb";
import { DocumentsGrid } from "./documents-grid";
import { DocumentsList } from "./documents-list";
import { DocumentsToolbar } from "./documents-toolbar";
import { NewFolderDialog } from "./new-folder-dialog";
import { DeleteFolderDialog } from "./delete-folder-dialog";
import { MoveTargetPicker, type MoveTargetState } from "./move-target-picker";
import { useDocumentsView } from "./use-documents-view";
import { CATEGORIES, UPLOAD_ACCEPT } from "./constants";
import { parseDragId, parseDropId } from "./dnd-ids";
import type { Doc, DocFolder, FolderTreeNode } from "./types";

/**
 * Drive/OneDrive-style Documents page. Owns:
 *   - DndContext (move documents into folders by drag)
 *   - Mutations (upload / patch / delete; folder create / patch / delete)
 *   - Dialog state (upload, edit, new folder, rename folder, delete folder, move)
 *
 * Rendering is split across documents-{toolbar,breadcrumb,grid,list} and the
 * tile/row components. This file is orchestration only.
 */
export function DocumentsPage() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    folderId,
    viewMode,
    setViewMode,
    search,
    setSearch,
    docsQuery,
    foldersQuery,
    folderById,
    folderTree,
    filteredFolders,
    filteredDocs,
    breadcrumb,
    navigateToFolder,
  } = useDocumentsView();

  // ── dialog state ─────────────────────────────────────────────────────────
  const [uploadOpen, setUploadOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<Doc | null>(null);
  const [renameTarget, setRenameTarget] = useState<DocFolder | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DocFolder | null>(null);
  const [deleteCounts, setDeleteCounts] = useState<{ children: number; documents: number } | null>(null);
  const [moveState, setMoveState] = useState<MoveTargetState | null>(null);
  const [moveSubject, setMoveSubject] = useState<{ kind: "doc"; id: string } | { kind: "folder"; id: string } | null>(null);

  // upload form
  const [uploadName, setUploadName] = useState("");
  const [uploadCategory, setUploadCategory] = useState("other");
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // edit form
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("other");
  const [editNotes, setEditNotes] = useState("");

  // ── mutations ────────────────────────────────────────────────────────────
  const uploadMut = useMutation({
    mutationFn: async (formData: FormData) => {
      if (folderId) formData.append("folderId", folderId);
      const res = await fetch("/api/documents", { method: "POST", body: formData });
      if (!res.ok) throw new Error((await res.json()).error || "Upload failed");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Document uploaded");
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["document-folders"] });
      resetUpload();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateDocMut = useMutation({
    mutationFn: async (input: {
      id: string;
      name?: string;
      category?: string;
      notes?: string;
      folderId?: string | null;
    }) => {
      const { id, ...data } = input;
      const res = await fetch(`/api/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Update failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["document-folders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteDocMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      toast.success("Document deleted");
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["document-folders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const newFolderMut = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/document-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId: folderId ?? null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not create folder");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Folder created");
      qc.invalidateQueries({ queryKey: ["document-folders"] });
      setNewFolderOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateFolderMut = useMutation({
    mutationFn: async (input: { id: string; name?: string; parentId?: string | null }) => {
      const { id, ...data } = input;
      const res = await fetch(`/api/document-folders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Update failed");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["document-folders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /**
   * Folder delete is two-step:
   *   1. First call without cascade → 200 (empty) or 409 with counts (non-empty).
   *   2. On 409 we open the confirm dialog; second call uses cascade=1.
   */
  const deleteFolderMut = useMutation({
    mutationFn: async (input: { folder: DocFolder; cascade: boolean }) => {
      const url = `/api/document-folders/${input.folder.id}${input.cascade ? "?cascade=1" : ""}`;
      const res = await fetch(url, { method: "DELETE" });
      if (res.status === 409) {
        const body = await res.json();
        return { needsConfirm: true as const, folder: input.folder, counts: body };
      }
      if (!res.ok) throw new Error("Could not delete folder");
      return { needsConfirm: false as const };
    },
    onSuccess: (result) => {
      if (result.needsConfirm) {
        setDeleteTarget(result.folder);
        setDeleteCounts({ children: result.counts.children, documents: result.counts.documents });
        return;
      }
      toast.success("Folder deleted");
      setDeleteTarget(null);
      setDeleteCounts(null);
      qc.invalidateQueries({ queryKey: ["document-folders"] });
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── helpers ──────────────────────────────────────────────────────────────
  function resetUpload() {
    setUploadOpen(false);
    setUploadName("");
    setUploadCategory("other");
    setUploadNotes("");
    setUploadFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleUpload() {
    if (!uploadFile) return toast.error("Select a file");
    const fd = new FormData();
    fd.append("file", uploadFile);
    fd.append("name", uploadName || uploadFile.name);
    fd.append("category", uploadCategory);
    if (uploadNotes) fd.append("notes", uploadNotes);
    uploadMut.mutate(fd);
  }

  function openEdit(doc: Doc) {
    setEditDoc(doc);
    setEditName(doc.name);
    setEditCategory(doc.category);
    setEditNotes(doc.notes || "");
  }

  function openRename(folder: DocFolder) {
    setRenameTarget(folder);
    setRenameValue(folder.name);
  }

  /** Compute the descendant set of a folder (used to forbid circular moves in the picker). */
  const collectDescendants = useMemo(
    () =>
      function collect(rootId: string): Set<string> {
        const out = new Set<string>([rootId]);
        const walk = (node: FolderTreeNode | undefined) => {
          if (!node) return;
          for (const c of node.children) {
            if (!out.has(c.folder.id)) {
              out.add(c.folder.id);
              walk(c);
            }
          }
        };
        const find = (nodes: FolderTreeNode[]): FolderTreeNode | undefined => {
          for (const n of nodes) {
            if (n.folder.id === rootId) return n;
            const sub = find(n.children);
            if (sub) return sub;
          }
          return undefined;
        };
        walk(find(folderTree));
        return out;
      },
    [folderTree]
  );

  function openMoveDoc(doc: Doc) {
    setMoveSubject({ kind: "doc", id: doc.id });
    setMoveState({
      kind: "document",
      name: doc.name,
      forbiddenIds: new Set(),
      initialTargetId: doc.folderId,
    });
  }

  function openMoveFolder(folder: DocFolder) {
    setMoveSubject({ kind: "folder", id: folder.id });
    setMoveState({
      kind: "folder",
      name: folder.name,
      forbiddenIds: collectDescendants(folder.id),
      initialTargetId: folder.parentId,
    });
  }

  function handleMoveConfirm(targetFolderId: string | null) {
    if (!moveSubject) return;
    if (moveSubject.kind === "doc") {
      updateDocMut.mutate(
        { id: moveSubject.id, folderId: targetFolderId },
        {
          onSuccess: () => {
            toast.success("Document moved");
            setMoveState(null);
            setMoveSubject(null);
          },
        }
      );
    } else {
      updateFolderMut.mutate(
        { id: moveSubject.id, parentId: targetFolderId },
        {
          onSuccess: () => {
            toast.success("Folder moved");
            setMoveState(null);
            setMoveSubject(null);
          },
        }
      );
    }
  }

  // ── DnD ──────────────────────────────────────────────────────────────────
  // 5px activation distance prevents click-vs-drag ambiguity on tiles.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(e: DragEndEvent) {
    if (!e.over) return;
    const drag = parseDragId(String(e.active.id));
    const drop = parseDropId(String(e.over.id));
    if (!drag || !drop) return;

    if (drag.kind === "doc") {
      const doc = (docsQuery.data ?? []).find((d) => d.id === drag.id);
      if (!doc) return;
      // Already in target → no-op.
      if ((doc.folderId ?? null) === drop.folderId) return;
      updateDocMut.mutate(
        { id: drag.id, folderId: drop.folderId },
        {
          onSuccess: () => {
            const targetName = drop.folderId ? folderById.get(drop.folderId)?.name ?? "folder" : "Documents";
            toast.success(`Moved to ${targetName}`);
          },
        }
      );
    }
  }

  const isLoading = foldersQuery.isLoading || docsQuery.isLoading;

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="space-y-4">
        <DocumentsBreadcrumb path={breadcrumb} onNavigate={navigateToFolder} />

        <DocumentsToolbar
          search={search}
          onSearchChange={setSearch}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onNewFolder={() => setNewFolderOpen(true)}
          onUpload={() => setUploadOpen(true)}
        />

        {viewMode === "grid" ? (
          <DocumentsGrid
            folders={filteredFolders}
            docs={filteredDocs}
            isLoading={isLoading}
            onOpenFolder={navigateToFolder}
            onRenameFolder={openRename}
            onMoveFolder={openMoveFolder}
            onDeleteFolder={(f) => deleteFolderMut.mutate({ folder: f, cascade: false })}
            onEditDoc={openEdit}
            onMoveDoc={openMoveDoc}
            onDeleteDoc={(id) => deleteDocMut.mutate(id)}
          />
        ) : (
          <DocumentsList
            folders={filteredFolders}
            docs={filteredDocs}
            isLoading={isLoading}
            onOpenFolder={navigateToFolder}
            onRenameFolder={openRename}
            onMoveFolder={openMoveFolder}
            onDeleteFolder={(f) => deleteFolderMut.mutate({ folder: f, cascade: false })}
            onEditDoc={openEdit}
            onMoveDoc={openMoveDoc}
            onDeleteDoc={(id) => deleteDocMut.mutate(id)}
          />
        )}

        <NewFolderDialog
          open={newFolderOpen}
          onOpenChange={setNewFolderOpen}
          onCreate={(name) => newFolderMut.mutate(name)}
          isPending={newFolderMut.isPending}
        />

        <DeleteFolderDialog
          folder={deleteTarget}
          counts={deleteCounts}
          isPending={deleteFolderMut.isPending}
          onCancel={() => {
            setDeleteTarget(null);
            setDeleteCounts(null);
          }}
          onConfirm={() => {
            if (!deleteTarget) return;
            deleteFolderMut.mutate({ folder: deleteTarget, cascade: true });
          }}
        />

        <MoveTargetPicker
          state={moveState}
          tree={folderTree}
          isPending={updateDocMut.isPending || updateFolderMut.isPending}
          onCancel={() => {
            setMoveState(null);
            setMoveSubject(null);
          }}
          onConfirm={handleMoveConfirm}
        />

        {/* Rename folder dialog */}
        <Dialog
          open={!!renameTarget}
          onOpenChange={(o) => {
            if (!o) {
              setRenameTarget(null);
              setRenameValue("");
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename folder</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="rename-folder">Name</Label>
              <Input
                id="rename-folder"
                value={renameValue}
                autoFocus
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && renameTarget && renameValue.trim()) {
                    updateFolderMut.mutate(
                      { id: renameTarget.id, name: renameValue.trim() },
                      {
                        onSuccess: () => {
                          toast.success("Folder renamed");
                          setRenameTarget(null);
                          setRenameValue("");
                        },
                      }
                    );
                  }
                }}
              />
            </div>
            <DialogFooter>
              <DialogClose>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button
                disabled={!renameValue.trim() || updateFolderMut.isPending}
                onClick={() => {
                  if (!renameTarget || !renameValue.trim()) return;
                  updateFolderMut.mutate(
                    { id: renameTarget.id, name: renameValue.trim() },
                    {
                      onSuccess: () => {
                        toast.success("Folder renamed");
                        setRenameTarget(null);
                        setRenameValue("");
                      },
                    }
                  );
                }}
              >
                {updateFolderMut.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Upload dialog */}
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Document</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>File</Label>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept={UPLOAD_ACCEPT}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setUploadFile(f);
                      if (!uploadName) setUploadName(f.name.replace(/\.[^.]+$/, ""));
                    }
                  }}
                />
              </div>
              <div>
                <Label>Name</Label>
                <Input
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="Document name"
                />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={uploadCategory} onValueChange={(v) => setUploadCategory(v ?? "other")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Textarea
                  value={uploadNotes}
                  onChange={(e) => setUploadNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button onClick={handleUpload} disabled={uploadMut.isPending}>
                {uploadMut.isPending ? "Uploading…" : "Upload"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit doc dialog */}
        <Dialog open={!!editDoc} onOpenChange={(open) => !open && setEditDoc(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Document</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={editCategory} onValueChange={(v) => setEditCategory(v ?? "other")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <DialogClose>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button
                onClick={() => {
                  if (!editDoc) return;
                  updateDocMut.mutate(
                    {
                      id: editDoc.id,
                      name: editName,
                      category: editCategory,
                      notes: editNotes,
                    },
                    {
                      onSuccess: () => {
                        toast.success("Document updated");
                        setEditDoc(null);
                      },
                    }
                  );
                }}
                disabled={updateDocMut.isPending}
              >
                {updateDocMut.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DndContext>
  );
}
