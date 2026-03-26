"use client";

import { useState } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FolderPlus,
  Trash2,
  ExternalLink,
  MapPin,
  DollarSign,
  Building2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Star,
  Columns2,
  X,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

/* ── Types ── */
interface GroupItem {
  id: string;
  jobKey: string;
  title: string;
  company: string;
  location: string | null;
  url: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  source: string;
  description: string | null;
  thumbnail: string | null;
  scheduleType: string | null;
  createdAt: string;
}

interface Group {
  id: string;
  name: string;
  color: string;
  _count: { items: number };
}

interface GroupDetail extends Group {
  items: GroupItem[];
}

function formatSalary(n: number) {
  return n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/* ── Color presets ── */
const COLOR_PRESETS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6",
  "#8b5cf6", "#ef4444", "#14b8a6", "#f97316", "#64748b",
];

export function JobInterestGroups() {
  const queryClient = useQueryClient();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState("#6366f1");
  const [compareGroupId, setCompareGroupId] = useState<string | null>(null);
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);
  const [editingGroup, setEditingGroup] = useState<{ id: string; name: string; color: string } | null>(null);

  /* Fetch all groups */
  const { data: groups = [], isLoading } = useQuery<Group[]>({
    queryKey: ["interest-groups"],
    queryFn: () => fetch("/api/interest-groups").then((r) => r.json()),
  });

  /* Fetch expanded group details */
  const expandedIds = Array.from(expandedGroups);
  const groupDetailResults = useQueries({
    queries: expandedIds.map((gid) => ({
      queryKey: ["interest-group", gid],
      queryFn: () => fetch(`/api/interest-groups/${gid}`).then((r) => r.json()) as Promise<GroupDetail>,
      staleTime: 30_000,
    })),
  });

  const groupDetails: Record<string, GroupDetail> = {};
  expandedIds.forEach((gid, i) => {
    const data = groupDetailResults[i]?.data;
    if (data) groupDetails[gid] = data;
  });

  /* Create group */
  const createGroupMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const res = await fetch("/api/interest-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color }),
      });
      if (!res.ok) throw new Error("Failed to create group");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interest-groups"] });
      setNewGroupName("");
      setNewGroupColor("#6366f1");
      setShowNewGroup(false);
      toast.success("Interest group created");
    },
    onError: () => toast.error("Failed to create group"),
  });

  /* Delete group */
  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const res = await fetch(`/api/interest-groups/${groupId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interest-groups"] });
      toast.success("Group deleted");
    },
  });

  /* Update group */
  const updateGroupMutation = useMutation({
    mutationFn: async ({ id, name, color }: { id: string; name: string; color: string }) => {
      const res = await fetch(`/api/interest-groups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color }),
      });
      if (!res.ok) throw new Error("Failed to update");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interest-groups"] });
      setEditingGroup(null);
      toast.success("Group updated");
    },
  });

  /* Remove item from group */
  const removeItemMutation = useMutation({
    mutationFn: async ({ groupId, itemId }: { groupId: string; itemId: string }) => {
      const res = await fetch(`/api/interest-groups/${groupId}/items`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      if (!res.ok) throw new Error("Failed to remove");
    },
    onSuccess: (_d, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: ["interest-group", groupId] });
      queryClient.invalidateQueries({ queryKey: ["interest-groups"] });
    },
  });

  const toggleExpand = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleCompareItem = (itemId: string) => {
    setSelectedForCompare((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  };

  /* Get items for comparison */
  const compareItems: GroupItem[] = compareGroupId && groupDetails[compareGroupId]
    ? groupDetails[compareGroupId].items.filter((i) => selectedForCompare.has(i.id))
    : [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Interest Groups</h2>
          <p className="text-sm text-muted-foreground">Organize, research, and compare job postings</p>
        </div>
        <Button size="sm" onClick={() => setShowNewGroup(true)} className="gap-1">
          <FolderPlus className="h-4 w-4" /> New Group
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading groups...
        </div>
      )}

      {/* Empty state */}
      {!isLoading && groups.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Star className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground mb-3">No interest groups yet</p>
            <p className="text-xs text-muted-foreground mb-4">
              Create a group to start saving and comparing job postings from your search results.
            </p>
            <Button size="sm" onClick={() => setShowNewGroup(true)} className="gap-1">
              <FolderPlus className="h-4 w-4" /> Create Your First Group
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Groups list */}
      {groups.map((group) => {
        const isExpanded = expandedGroups.has(group.id);
        const detail = groupDetails[group.id];
        const isComparing = compareGroupId === group.id;

        return (
          <Card key={group.id}>
            <CardContent className="pt-4">
              {/* Group header */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleExpand(group.id)}
                  className="shrink-0"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                <span className="h-3 w-3 rounded-full shrink-0" style={{ background: group.color }} />
                <span className="font-medium text-sm flex-1">{group.name}</span>
                <Badge variant="outline" className="text-xs">
                  {group._count.items} {group._count.items === 1 ? "job" : "jobs"}
                </Badge>
                {isExpanded && detail && detail.items.length >= 2 && (
                  <Button
                    size="sm"
                    variant={isComparing ? "default" : "outline"}
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      if (isComparing) {
                        setCompareGroupId(null);
                        setSelectedForCompare(new Set());
                      } else {
                        setCompareGroupId(group.id);
                        setSelectedForCompare(new Set());
                      }
                    }}
                  >
                    <Columns2 className="h-3 w-3" /> {isComparing ? "Cancel" : "Compare"}
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setEditingGroup({ id: group.id, name: group.name, color: group.color })}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => {
                    if (confirm(`Delete "${group.name}" and all its saved jobs?`)) {
                      deleteGroupMutation.mutate(group.id);
                    }
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>

              {/* Expanded items */}
              {isExpanded && (
                <div className="mt-3 space-y-2">
                  {!detail && (
                    <div className="flex items-center py-4 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Loading...
                    </div>
                  )}
                  {detail && detail.items.length === 0 && (
                    <p className="text-xs text-muted-foreground py-2">
                      No jobs saved yet. Use the ★ button on search results to add jobs here.
                    </p>
                  )}
                  {detail?.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex gap-3 p-2 rounded-lg border bg-muted/30 hover:bg-muted/60 transition-colors"
                    >
                      {/* Compare checkbox */}
                      {isComparing && (
                        <div className="flex items-center">
                          <Checkbox
                            checked={selectedForCompare.has(item.id)}
                            onCheckedChange={() => toggleCompareItem(item.id)}
                          />
                        </div>
                      )}

                      {/* Thumbnail */}
                      {item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt=""
                          className="h-10 w-10 rounded object-contain shrink-0 bg-background"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded bg-background flex items-center justify-center shrink-0">
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1">
                          <h4 className="font-medium text-sm leading-tight line-clamp-1">{item.title}</h4>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => removeItemMutation.mutate({ groupId: group.id, itemId: item.id })}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">{item.company}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.location && (
                            <Badge variant="outline" className="text-[10px] gap-0.5 px-1 py-0">
                              <MapPin className="h-2.5 w-2.5" /> {item.location}
                            </Badge>
                          )}
                          {(item.salaryMin || item.salaryMax) && (
                            <Badge variant="outline" className="text-[10px] gap-0.5 px-1 py-0 text-emerald-600 border-emerald-300">
                              <DollarSign className="h-2.5 w-2.5" />
                              {item.salaryMin ? formatSalary(item.salaryMin) : ""}
                              {item.salaryMin && item.salaryMax ? "–" : ""}
                              {item.salaryMax ? formatSalary(item.salaryMax) : ""}
                            </Badge>
                          )}
                          {item.scheduleType && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0">{item.scheduleType}</Badge>
                          )}
                          <Badge
                            variant="secondary"
                            className={`text-[10px] px-1 py-0 ${item.source === "google" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"}`}
                          >
                            {item.source === "google" ? "Google" : "Adzuna"}
                          </Badge>
                        </div>
                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5 mt-1"
                          >
                            <ExternalLink className="h-3 w-3" /> View posting
                          </a>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Compare button when items selected */}
                  {isComparing && selectedForCompare.size >= 2 && (
                    <Button
                      size="sm"
                      className="w-full gap-1 mt-2"
                      onClick={() => setShowCompare(true)}
                    >
                      <Columns2 className="h-3.5 w-3.5" /> Compare {selectedForCompare.size} Jobs
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* New Group Dialog */}
      <Dialog open={showNewGroup} onOpenChange={setShowNewGroup}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Interest Group</DialogTitle>
            <DialogDescription>Create a group to save and compare job postings.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newGroupName.trim()) createGroupMutation.mutate({ name: newGroupName.trim(), color: newGroupColor });
            }}
            className="space-y-3"
          >
            <Input
              placeholder="e.g. Top Picks, Compare PM Roles..."
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              autoFocus
            />
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Color</label>
              <div className="flex gap-1.5 flex-wrap">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`h-6 w-6 rounded-full border-2 transition-all ${newGroupColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ background: c }}
                    onClick={() => setNewGroupColor(c)}
                  />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowNewGroup(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={!newGroupName.trim() || createGroupMutation.isPending}>
                {createGroupMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <FolderPlus className="h-3.5 w-3.5 mr-1" />}
                Create
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Group Dialog */}
      <Dialog open={!!editingGroup} onOpenChange={(open) => !open && setEditingGroup(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Group</DialogTitle>
          </DialogHeader>
          {editingGroup && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editingGroup.name.trim()) updateGroupMutation.mutate(editingGroup);
              }}
              className="space-y-3"
            >
              <Input
                value={editingGroup.name}
                onChange={(e) => setEditingGroup({ ...editingGroup, name: e.target.value })}
                autoFocus
              />
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Color</label>
                <div className="flex gap-1.5 flex-wrap">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`h-6 w-6 rounded-full border-2 transition-all ${editingGroup.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                      style={{ background: c }}
                      onClick={() => setEditingGroup({ ...editingGroup, color: c })}
                    />
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditingGroup(null)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={!editingGroup.name.trim() || updateGroupMutation.isPending}>
                  Save
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Compare Dialog */}
      <Dialog open={showCompare} onOpenChange={setShowCompare}>
        <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Compare Jobs</DialogTitle>
            <DialogDescription>Side-by-side comparison of {compareItems.length} job postings</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto -mx-4 px-4 min-h-0">
            {compareItems.length > 0 && (
              <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(compareItems.length, 3)}, 1fr)` }}>
                {compareItems.map((item) => (
                  <Card key={item.id} className="flex flex-col">
                    <CardContent className="pt-4 space-y-3 flex-1">
                      {/* Header */}
                      <div className="flex gap-2">
                        {item.thumbnail ? (
                          <img src={item.thumbnail} alt="" className="h-10 w-10 rounded object-contain bg-muted" />
                        ) : (
                          <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                            <Building2 className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <h4 className="font-semibold text-sm leading-tight line-clamp-2">{item.title}</h4>
                          <p className="text-xs text-muted-foreground">{item.company}</p>
                        </div>
                      </div>

                      <Separator />

                      {/* Comparison fields */}
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-xs font-medium text-muted-foreground">Location</span>
                          <p className="text-sm">{item.location || "Not specified"}</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-muted-foreground">Salary</span>
                          <p className="text-sm font-medium text-emerald-600">
                            {item.salaryMin || item.salaryMax
                              ? `${item.salaryMin ? formatSalary(item.salaryMin) : ""}${item.salaryMin && item.salaryMax ? " – " : ""}${item.salaryMax ? formatSalary(item.salaryMax) : ""}`
                              : "Not listed"}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-muted-foreground">Schedule</span>
                          <p className="text-sm">{item.scheduleType || "Not specified"}</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-muted-foreground">Source</span>
                          <Badge variant="secondary" className={`text-xs ${item.source === "google" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"}`}>
                            {item.source === "google" ? "Google Jobs" : "Adzuna"}
                          </Badge>
                        </div>
                      </div>

                      <Separator />

                      {/* Description */}
                      <div>
                        <span className="text-xs font-medium text-muted-foreground">Description</span>
                        <p className="text-xs text-muted-foreground leading-relaxed mt-1 line-clamp-6">
                          {item.description ? stripHtml(item.description) : "No description available"}
                        </p>
                      </div>

                      {/* Apply link */}
                      {item.url && (
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="block mt-auto pt-2">
                          <Button size="sm" variant="outline" className="w-full gap-1 text-xs">
                            <ExternalLink className="h-3 w-3" /> View Full Posting
                          </Button>
                        </a>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
