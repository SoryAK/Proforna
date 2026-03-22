"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Upload,
  Download,
  Trash2,
  Search,
  Plus,
  File,
  Image,
  FileSpreadsheet,
  Pencil,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

const CATEGORIES = [
  { value: "offer_letter", label: "Offer Letter" },
  { value: "cover_letter", label: "Cover Letter" },
  { value: "certificate", label: "Certificate" },
  { value: "contract", label: "Contract" },
  { value: "pay_stub", label: "Pay Stub" },
  { value: "tax_form", label: "Tax Form" },
  { value: "other", label: "Other" },
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  offer_letter: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  cover_letter: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  certificate: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  contract: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  pay_stub: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  tax_form: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  other: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

interface Doc {
  id: string;
  name: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  category: string;
  entityType: string | null;
  entityId: string | null;
  notes: string | null;
  createdAt: string;
}

function fileIcon(mime: string) {
  if (mime.startsWith("image/")) return Image;
  if (mime.includes("spreadsheet") || mime === "text/csv") return FileSpreadsheet;
  return File;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<Doc | null>(null);

  // Upload form state
  const [uploadName, setUploadName] = useState("");
  const [uploadCategory, setUploadCategory] = useState("other");
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("other");
  const [editNotes, setEditNotes] = useState("");

  const { data: docs, isLoading } = useQuery<Doc[]>({
    queryKey: ["documents", filterCat],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterCat !== "all") params.set("category", filterCat);
      return fetch(`/api/documents?${params}`).then((r) => r.json());
    },
  });

  const uploadMut = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch("/api/documents", { method: "POST", body: formData });
      if (!res.ok) throw new Error((await res.json()).error || "Upload failed");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Document uploaded");
      qc.invalidateQueries({ queryKey: ["documents"] });
      resetUpload();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name: string; category: string; notes: string }) => {
      const res = await fetch(`/api/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Update failed");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Document updated");
      qc.invalidateQueries({ queryKey: ["documents"] });
      setEditDoc(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => fetch(`/api/documents/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Document deleted");
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
  });

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

  const filtered = (docs || []).filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.fileName.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: docs?.length ?? 0,
    totalSize: (docs || []).reduce((s, d) => s + d.fileSize, 0),
    byCategory: CATEGORIES.map((c) => ({
      ...c,
      count: (docs || []).filter((d) => d.category === c.value).length,
    })),
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FileText className="h-5 w-5 text-orange-600" />
            Documents
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {stats.total} documents &middot; {formatSize(stats.totalSize)} total
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Upload Document
        </Button>
      </div>

      {/* Category stat badges */}
      <div className="flex flex-wrap gap-2">
        <Badge
          variant="outline"
          className={`cursor-pointer ${filterCat === "all" ? "ring-2 ring-orange-500" : ""}`}
          onClick={() => setFilterCat("all")}
        >
          All ({stats.total})
        </Badge>
        {stats.byCategory
          .filter((c) => c.count > 0)
          .map((c) => (
            <Badge
              key={c.value}
              className={`cursor-pointer ${CATEGORY_COLORS[c.value]} ${filterCat === c.value ? "ring-2 ring-orange-500" : ""}`}
              onClick={() => setFilterCat(c.value)}
            >
              {c.label} ({c.count})
            </Badge>
          ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search documents…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Documents grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Upload className="mx-auto h-12 w-12 mb-4 opacity-50" />
            <p>No documents found. Upload your first document to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((doc) => {
            const Icon = fileIcon(doc.mimeType);
            return (
              <Card key={doc.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                      <CardTitle className="text-sm truncate">{doc.name}</CardTitle>
                    </div>
                    <Badge className={CATEGORY_COLORS[doc.category] || CATEGORY_COLORS.other}>
                      {CATEGORIES.find((c) => c.value === doc.category)?.label || doc.category}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-xs text-muted-foreground truncate">{doc.fileName}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatSize(doc.fileSize)}</span>
                    <span>&middot;</span>
                    <span>{formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}</span>
                  </div>
                  {doc.notes && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{doc.notes}</p>
                  )}
                  <div className="flex gap-1 pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        window.open(`/api/documents/${doc.id}`, "_blank");
                      }}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(doc)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => deleteMut.mutate(doc.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

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
                accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.txt,.csv"
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
              <Input value={uploadName} onChange={(e) => setUploadName(e.target.value)} placeholder="Document name" />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={uploadCategory} onValueChange={(v) => setUploadCategory(v ?? "other")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} rows={2} />
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

      {/* Edit dialog */}
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
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
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
              onClick={() =>
                editDoc && updateMut.mutate({ id: editDoc.id, name: editName, category: editCategory, notes: editNotes })
              }
              disabled={updateMut.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
