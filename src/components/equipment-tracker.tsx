"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Monitor,
  Wrench,
  Car,
  HardHat,
  Laptop,
  AppWindow,
  Plus,
  Pencil,
  Trash2,
  Package,
  Key,
  CalendarClock,
  Search,
  Loader2,
  ExternalLink,
  X,
  ChevronDown,
  ChevronRight,
  BookOpen,
  AlertTriangle,
  Settings,
  Shield,
  Cog,
  Boxes,
  GraduationCap,
  FileText,
  Link,
  Download,
  Upload,
  Paperclip,
} from "lucide-react";
import { format } from "date-fns";

interface SearchResult {
  title: string;
  description: string | null;
  excerpt: string | null;
  thumbnail: string | null;
}

interface ResourceItem {
  id: string;
  equipmentId: string;
  type: string;
  title: string;
  content: string | null;
  url: string | null;
  fileName: string | null;
  fileMime: string | null;
  hasFile: boolean;
  createdAt: string;
}

interface EquipmentItem {
  id: string;
  positionId: string;
  name: string;
  category: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  assetTag: string | null;
  assignedDate: string | null;
  returnedDate: string | null;
  condition: string;
  licenseKey: string | null;
  version: string | null;
  expiresAt: string | null;
  notes: string | null;
}

const CATEGORIES: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  hardware: { label: "Hardware", icon: Monitor, color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  software: { label: "Software", icon: AppWindow, color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
  vehicle: { label: "Vehicle", icon: Car, color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" },
  safety: { label: "Safety/PPE", icon: HardHat, color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
  tool: { label: "Tool", icon: Wrench, color: "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300" },
  other: { label: "Other", icon: Package, color: "bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300" },
};

const CONDITIONS: Record<string, string> = {
  new: "New",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

const CONDITION_COLORS: Record<string, string> = {
  new: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  good: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  fair: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  poor: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

const RESOURCE_TYPES: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  manual: { label: "Manual", icon: BookOpen, color: "text-blue-600" },
  troubleshooting: { label: "Troubleshooting", icon: AlertTriangle, color: "text-amber-600" },
  operations: { label: "Operations", icon: Settings, color: "text-emerald-600" },
  safety: { label: "Safety", icon: Shield, color: "text-red-600" },
  maintenance: { label: "Maintenance", icon: Cog, color: "text-slate-600" },
  parts: { label: "Parts", icon: Boxes, color: "text-purple-600" },
  training: { label: "Training", icon: GraduationCap, color: "text-indigo-600" },
};

const emptyForm = {
  name: "",
  category: "hardware",
  manufacturer: "",
  model: "",
  serialNumber: "",
  assetTag: "",
  assignedDate: "",
  returnedDate: "",
  condition: "good",
  licenseKey: "",
  version: "",
  expiresAt: "",
  notes: "",
};

function ResourcesPanel({
  equipmentId,
  expanded,
  onToggle,
  onAdd,
  onEdit,
  onRemove,
}: {
  equipmentId: string;
  expanded: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onEdit: (r: ResourceItem) => void;
  onRemove: (id: string) => void;
}) {
  const { data: resources = [] } = useQuery<ResourceItem[]>({
    queryKey: ["equipment-resources", equipmentId],
    queryFn: () => fetch(`/api/equipment-resources?equipmentId=${equipmentId}`).then((r) => r.json()),
    enabled: expanded,
  });

  const count = expanded ? resources.length : 0;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <FileText className="h-3 w-3" />
        Resources{expanded && count > 0 ? ` (${count})` : ""}
      </button>
      {expanded && (
        <div className="mt-1.5 ml-4 space-y-1.5">
          {resources.length === 0 && (
            <p className="text-[10px] text-muted-foreground italic">No resources yet</p>
          )}
          {resources.map((r) => {
            const rt = RESOURCE_TYPES[r.type] ?? RESOURCE_TYPES.manual;
            const RIcon = rt.icon;
            return (
              <div key={r.id} className="flex items-start gap-2 group">
                <RIcon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${rt.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium truncate">{r.title}</span>
                    <Badge variant="secondary" className="text-[9px] px-1 py-0">{rt.label}</Badge>
                    {r.url && (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-700"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link className="h-3 w-3" />
                      </a>
                    )}
                    {r.hasFile && (
                      <a
                        href={`/api/equipment-resources/${r.id}/download`}
                        className="flex items-center gap-0.5 text-emerald-600 hover:text-emerald-700"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Download className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  {r.hasFile && r.fileName && (
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Paperclip className="h-2.5 w-2.5" />
                      {r.fileName}
                    </p>
                  )}
                  {r.content && (
                    <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{r.content}</p>
                  )}
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => onEdit(r)}
                    className="p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(r.id)}
                    className="p-0.5 text-muted-foreground hover:text-red-600"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={onAdd}
            className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 hover:underline mt-1"
          >
            <Plus className="h-3 w-3" /> Add resource
          </button>
        </div>
      )}
    </div>
  );
}

export function EquipmentTracker({ positionId }: { positionId: string }) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EquipmentItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [filter, setFilter] = useState<string>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useState<ReturnType<typeof setTimeout> | null>(null);

  // Resources state
  const [expandedResources, setExpandedResources] = useState<Set<string>>(new Set());
  const [resourceDialogOpen, setResourceDialogOpen] = useState(false);
  const [resourceEquipmentId, setResourceEquipmentId] = useState<string | null>(null);
  const [editingResource, setEditingResource] = useState<ResourceItem | null>(null);
  const [resourceForm, setResourceForm] = useState({ type: "manual", title: "", content: "", url: "" });
  const [resourceFile, setResourceFile] = useState<File | null>(null);
  const [removeExistingFile, setRemoveExistingFile] = useState(false);

  const runSearch = (q: string) => {
    setSearchQuery(q);
    if (searchTimeout[0]) clearTimeout(searchTimeout[0]);
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    searchTimeout[0] = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/equipment-search?q=${encodeURIComponent(q.trim())}`);
        const data = await res.json();
        setSearchResults(data.results ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  };

  const pickSearchResult = (result: SearchResult) => {
    upd("name", result.title);
    if (result.description) {
      upd("notes", result.description);
    }
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
  };

  const { data: items = [] } = useQuery<EquipmentItem[]>({
    queryKey: ["equipment", positionId],
    queryFn: () => fetch(`/api/equipment?positionId=${positionId}`).then((r) => r.json()),
  });

  const save = useMutation({
    mutationFn: async (payload: typeof form) => {
      const url = editing ? `/api/equipment/${editing.id}` : "/api/equipment";
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionId, ...payload }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment", positionId] });
      toast.success(editing ? "Equipment updated" : "Equipment added");
      closeDialog();
    },
    onError: (e) => toast.error(String(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/equipment/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment", positionId] });
      toast.success("Equipment removed");
    },
    onError: (e) => toast.error(String(e)),
  });

  // Resource mutations
  const saveResource = useMutation({
    mutationFn: async (payload: { equipmentId: string; id?: string; type: string; title: string; content: string; url: string; file: File | null; removeFile: boolean }) => {
      const { id, file, removeFile, ...fields } = payload;
      const fd = new FormData();
      fd.append("equipmentId", fields.equipmentId);
      fd.append("type", fields.type);
      fd.append("title", fields.title);
      fd.append("content", fields.content);
      fd.append("url", fields.url);
      if (file) fd.append("file", file);
      if (removeFile) fd.append("removeFile", "true");
      const endpoint = id ? `/api/equipment-resources/${id}` : "/api/equipment-resources";
      const res = await fetch(endpoint, { method: id ? "PUT" : "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["equipment-resources", vars.equipmentId] });
      toast.success(editingResource ? "Resource updated" : "Resource added");
      closeResourceDialog();
    },
    onError: (e) => toast.error(String(e)),
  });

  const removeResource = useMutation({
    mutationFn: async ({ id, equipmentId }: { id: string; equipmentId: string }) => {
      const res = await fetch(`/api/equipment-resources/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return { equipmentId };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["equipment-resources", vars.equipmentId] });
      toast.success("Resource removed");
    },
    onError: (e) => toast.error(String(e)),
  });

  const toggleResources = (equipmentId: string) => {
    setExpandedResources((prev) => {
      const next = new Set(prev);
      if (next.has(equipmentId)) next.delete(equipmentId);
      else next.add(equipmentId);
      return next;
    });
  };

  const openAddResource = (equipmentId: string) => {
    setResourceEquipmentId(equipmentId);
    setEditingResource(null);
    setResourceForm({ type: "manual", title: "", content: "", url: "" });
    setResourceFile(null);
    setRemoveExistingFile(false);
    setResourceDialogOpen(true);
  };

  const openEditResource = (resource: ResourceItem) => {
    setResourceEquipmentId(resource.equipmentId);
    setEditingResource(resource);
    setResourceForm({
      type: resource.type,
      title: resource.title,
      content: resource.content ?? "",
      url: resource.url ?? "",
    });
    setResourceFile(null);
    setRemoveExistingFile(false);
    setResourceDialogOpen(true);
  };

  const closeResourceDialog = () => {
    setResourceDialogOpen(false);
    setEditingResource(null);
    setResourceEquipmentId(null);
    setResourceForm({ type: "manual", title: "", content: "", url: "" });
    setResourceFile(null);
    setRemoveExistingFile(false);
  };

  const updResource = (field: string, value: string) => setResourceForm((f) => ({ ...f, [field]: value }));

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setDialogOpen(true);
  };

  const openEdit = (item: EquipmentItem) => {
    setEditing(item);
    setForm({
      name: item.name,
      category: item.category,
      manufacturer: item.manufacturer ?? "",
      model: item.model ?? "",
      serialNumber: item.serialNumber ?? "",
      assetTag: item.assetTag ?? "",
      assignedDate: item.assignedDate ? item.assignedDate.split("T")[0] : "",
      returnedDate: item.returnedDate ? item.returnedDate.split("T")[0] : "",
      condition: item.condition,
      licenseKey: item.licenseKey ?? "",
      version: item.version ?? "",
      expiresAt: item.expiresAt ? item.expiresAt.split("T")[0] : "",
      notes: item.notes ?? "",
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const upd = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const isSoftware = form.category === "software";

  const filtered = filter === "all" ? items : items.filter((i) => i.category === filter);

  // Group by category
  const grouped = filtered.reduce<Record<string, EquipmentItem[]>>((acc, item) => {
    const cat = item.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const activeCount = items.filter((i) => !i.returnedDate).length;
  const returnedCount = items.filter((i) => i.returnedDate).length;

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Laptop className="h-5 w-5 text-blue-600" />
              Equipment & Software
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{activeCount}</span> active
                {returnedCount > 0 && (
                  <span>· <span className="font-medium text-foreground">{returnedCount}</span> returned</span>
                )}
              </div>
              <Button size="sm" onClick={openAdd}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Category filter */}
          {items.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  filter === "all" ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                All ({items.length})
              </button>
              {Object.entries(CATEGORIES).map(([key, { label }]) => {
                const count = items.filter((i) => i.category === key).length;
                if (count === 0) return null;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      filter === key ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <Package className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No equipment tracked yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Add laptops, software licenses, tools, PPE, and more
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(grouped).map(([cat, catItems]) => {
                const catInfo = CATEGORIES[cat] ?? CATEGORIES.other;
                const CatIcon = catInfo.icon;
                return (
                  <div key={cat}>
                    <div className="flex items-center gap-2 mb-2">
                      <CatIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {catInfo.label}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {catItems.map((item) => {
                        const catMeta = CATEGORIES[item.category] ?? CATEGORIES.other;
                        const ItemIcon = catMeta.icon;
                        const isReturned = !!item.returnedDate;
                        const isExpired = item.expiresAt && new Date(item.expiresAt) < new Date();

                        return (
                          <div
                            key={item.id}
                            className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                              isReturned ? "opacity-60" : ""
                            }`}
                          >
                            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${catMeta.color.split(" ").slice(0, 1).join(" ")}`}>
                              <ItemIcon className={`h-4 w-4 ${catMeta.color.split(" ").slice(1, 2).join(" ")}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold truncate">{item.name}</p>
                                {isReturned && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Returned</Badge>
                                )}
                                {isExpired && !isReturned && (
                                  <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 text-[10px] px-1.5 py-0">Expired</Badge>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                                {item.manufacturer && <span>{item.manufacturer}</span>}
                                {item.model && <span>{item.model}</span>}
                                {item.version && <span>v{item.version}</span>}
                                {item.serialNumber && (
                                  <span className="font-mono text-[10px]">S/N: {item.serialNumber}</span>
                                )}
                                {item.assetTag && (
                                  <span className="font-mono text-[10px]">Asset: {item.assetTag}</span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground mt-0.5">
                                {item.assignedDate && (
                                  <span>Assigned {format(new Date(item.assignedDate), "MMM d, yyyy")}</span>
                                )}
                                {item.returnedDate && (
                                  <span>Returned {format(new Date(item.returnedDate), "MMM d, yyyy")}</span>
                                )}
                                {item.expiresAt && (
                                  <span className={isExpired ? "text-red-500" : ""}>
                                    {isExpired ? "Expired" : "Expires"} {format(new Date(item.expiresAt), "MMM d, yyyy")}
                                  </span>
                                )}
                              </div>
                              {item.licenseKey && (
                                <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                  <Key className="h-2.5 w-2.5" />
                                  <span className="font-mono">{item.licenseKey}</span>
                                </p>
                              )}
                              {item.notes && (
                                <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line">{item.notes}</p>
                              )}
                              {/* Resources section */}
                              <ResourcesPanel
                                equipmentId={item.id}
                                expanded={expandedResources.has(item.id)}
                                onToggle={() => toggleResources(item.id)}
                                onAdd={() => openAddResource(item.id)}
                                onEdit={openEditResource}
                                onRemove={(id) => removeResource.mutate({ id, equipmentId: item.id })}
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <Badge className={`${CONDITION_COLORS[item.condition]} text-[10px] px-1.5 py-0`}>
                                {CONDITIONS[item.condition] ?? item.condition}
                              </Badge>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(item)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600" onClick={() => remove.mutate(item.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Equipment" : "Add Equipment"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">            {/* Equipment Search */}
            {!editing && (
              <div>
                {!searchOpen ? (
                  <button
                    type="button"
                    onClick={() => setSearchOpen(true)}
                    className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <Search className="h-3 w-3" />
                    Not sure what it is? Search to identify
                  </button>
                ) : (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium">Search equipment / tools</p>
                      <button
                        type="button"
                        onClick={() => { setSearchOpen(false); setSearchQuery(""); setSearchResults([]); }}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={searchQuery}
                        onChange={(e) => runSearch(e.target.value)}
                        placeholder="e.g. conveyor, forklift, oscilloscope..."
                        className="pl-8 h-8 text-sm"
                        autoFocus
                      />
                      {searching && (
                        <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      )}
                    </div>
                    {searchResults.length > 0 && (
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {searchResults.map((r) => (
                          <button
                            key={r.title}
                            type="button"
                            onClick={() => pickSearchResult(r)}
                            className="w-full flex items-start gap-2.5 rounded-md p-2 text-left hover:bg-muted transition-colors"
                          >
                            {r.thumbnail ? (
                              <img
                                src={r.thumbnail}
                                alt=""
                                className="h-10 w-10 rounded object-cover shrink-0 mt-0.5"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0 mt-0.5">
                                <Package className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{r.title}</p>
                              {r.description && (
                                <p className="text-[11px] text-muted-foreground">{r.description}</p>
                              )}
                              {r.excerpt && (
                                <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{r.excerpt}</p>
                              )}
                            </div>
                            <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 mt-1" />
                          </button>
                        ))}
                      </div>
                    )}
                    {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-2">No results found</p>
                    )}
                  </div>
                )}
              </div>
            )}
            {/* Row 1: Name + Category */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => upd("name", e.target.value)}
                  placeholder="MacBook Pro 16″"
                />
              </div>
              <div>
                <Label className="text-xs">Category</Label>
                <Select value={form.category} onValueChange={(v) => upd("category", v ?? "hardware")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORIES).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 2: Manufacturer + Model */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{isSoftware ? "Publisher" : "Manufacturer"}</Label>
                <Input
                  value={form.manufacturer}
                  onChange={(e) => upd("manufacturer", e.target.value)}
                  placeholder={isSoftware ? "Microsoft" : "Apple"}
                />
              </div>
              <div>
                <Label className="text-xs">Model</Label>
                <Input
                  value={form.model}
                  onChange={(e) => upd("model", e.target.value)}
                  placeholder={isSoftware ? "Office 365" : "M3 Max"}
                />
              </div>
            </div>

            {/* Row 3: Serial / Asset Tag */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Serial Number</Label>
                <Input
                  value={form.serialNumber}
                  onChange={(e) => upd("serialNumber", e.target.value)}
                  placeholder="C02X..."
                />
              </div>
              <div>
                <Label className="text-xs">Asset Tag</Label>
                <Input
                  value={form.assetTag}
                  onChange={(e) => upd("assetTag", e.target.value)}
                  placeholder="IT-00451"
                />
              </div>
            </div>

            {/* Software-specific: License Key + Version */}
            {isSoftware && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">License Key</Label>
                  <Input
                    value={form.licenseKey}
                    onChange={(e) => upd("licenseKey", e.target.value)}
                    placeholder="XXXXX-XXXXX-XXXXX"
                  />
                </div>
                <div>
                  <Label className="text-xs">Version</Label>
                  <Input
                    value={form.version}
                    onChange={(e) => upd("version", e.target.value)}
                    placeholder="2024.1"
                  />
                </div>
              </div>
            )}

            {/* Row 4: Condition + Expiry */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Condition</Label>
                <Select value={form.condition} onValueChange={(v) => upd("condition", v ?? "good")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CONDITIONS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{isSoftware ? "License Expires" : "Warranty/Expires"}</Label>
                <Input
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => upd("expiresAt", e.target.value)}
                />
              </div>
            </div>

            {/* Row 5: Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Assigned Date</Label>
                <Input
                  type="date"
                  value={form.assignedDate}
                  onChange={(e) => upd("assignedDate", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Returned Date</Label>
                <Input
                  type="date"
                  value={form.returnedDate}
                  onChange={(e) => upd("returnedDate", e.target.value)}
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => upd("notes", e.target.value)}
                rows={2}
                placeholder="Additional details..."
              />
            </div>

            <Button
              className="w-full"
              onClick={() => save.mutate(form)}
              disabled={!form.name || save.isPending}
            >
              {editing ? "Update" : "Add Equipment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Resource Dialog */}
      <Dialog open={resourceDialogOpen} onOpenChange={(o) => !o && closeResourceDialog()}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingResource ? "Edit Resource" : "Add Resource"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={resourceForm.type} onValueChange={(v) => updResource("type", v ?? "manual")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(RESOURCE_TYPES).map(([key, { label, icon: Icon, color }]) => (
                      <SelectItem key={key} value={key}>
                        <span className="flex items-center gap-2">
                          <Icon className={`h-3.5 w-3.5 ${color}`} />
                          {label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Title *</Label>
                <Input
                  value={resourceForm.title}
                  onChange={(e) => updResource("title", e.target.value)}
                  placeholder="Operating Manual Rev 3"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Content</Label>
              <Textarea
                value={resourceForm.content}
                onChange={(e) => updResource("content", e.target.value)}
                rows={4}
                placeholder="Procedures, notes, troubleshooting steps..."
              />
            </div>
            <div>
              <Label className="text-xs">Link (optional)</Label>
              <Input
                value={resourceForm.url}
                onChange={(e) => updResource("url", e.target.value)}
                placeholder="https://docs.example.com/manual.pdf"
              />
            </div>
            {/* File upload */}
            <div>
              <Label className="text-xs">File attachment (max 10 MB)</Label>
              {editingResource?.hasFile && !removeExistingFile && !resourceFile && (
                <div className="flex items-center gap-2 mt-1 mb-1.5 text-xs text-muted-foreground">
                  <Paperclip className="h-3.5 w-3.5" />
                  <span className="truncate">{editingResource.fileName}</span>
                  <button
                    type="button"
                    onClick={() => setRemoveExistingFile(true)}
                    className="text-red-500 hover:text-red-600 ml-auto text-[10px] font-medium"
                  >
                    Remove
                  </button>
                </div>
              )}
              {removeExistingFile && !resourceFile && (
                <p className="text-[10px] text-amber-600 mt-1 mb-1.5">File will be removed on save</p>
              )}
              <label className="flex items-center justify-center gap-2 rounded-md border border-dashed px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors">
                <Upload className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {resourceFile ? resourceFile.name : "Choose file..."}
                </span>
                <input
                  type="file"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setResourceFile(f);
                    if (f) setRemoveExistingFile(false);
                  }}
                />
              </label>
              {resourceFile && (
                <button
                  type="button"
                  onClick={() => setResourceFile(null)}
                  className="text-[10px] text-red-500 hover:text-red-600 mt-1"
                >
                  Clear selected file
                </button>
              )}
            </div>
            <Button
              className="w-full"
              onClick={() => {
                if (!resourceEquipmentId) return;
                saveResource.mutate({
                  equipmentId: resourceEquipmentId,
                  ...(editingResource ? { id: editingResource.id } : {}),
                  ...resourceForm,
                  file: resourceFile,
                  removeFile: removeExistingFile,
                });
              }}
              disabled={!resourceForm.title || saveResource.isPending}
            >
              {editingResource ? "Update Resource" : "Add Resource"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
