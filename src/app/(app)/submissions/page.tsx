"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  Inbox,
  Building2,
  Mail,
  Phone,
  MapPin,
  DollarSign,
  Briefcase,
  ExternalLink,
  Search,
  Eye,
  Archive,
  Trash2,
  LinkIcon,
  CheckSquare,
  Download,
  X,
} from "lucide-react";
import { format } from "date-fns";
import {
  SUBMISSION_LABELS,
  SUBMISSION_COLORS,
  type SubmissionStatus,
} from "@/lib/constants";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface Submission {
  id: string;
  recruiterName: string;
  recruiterEmail: string;
  recruiterPhone: string | null;
  company: string | null;
  linkedinUrl: string | null;
  jobTitle: string;
  jobDescription: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  location: string | null;
  jobType: string | null;
  message: string | null;
  status: SubmissionStatus;
  contactId: string | null;
  applicationId: string | null;
  createdAt: string;
}

export default function SubmissionsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: submissions = [], isLoading } = useQuery<Submission[]>({
    queryKey: ["submissions"],
    queryFn: () => fetch("/api/submissions").then((r) => r.json()),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`/api/submissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["submissions"] });
      toast.success("Submission updated");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/submissions/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["submissions"] });
      setSelectedSubmission(null);
      toast.success("Submission deleted");
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => fetch(`/api/submissions/${id}`, { method: "DELETE" })));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["submissions"] });
      toast.success(`Deleted ${selectedIds.size} submission${selectedIds.size !== 1 ? "s" : ""}`);
      setSelectedIds(new Set());
    },
    onError: () => toast.error("Failed to delete some submissions"),
  });

  const bulkStatusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/submissions/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["submissions"] });
      toast.success(`Updated ${selectedIds.size} submission${selectedIds.size !== 1 ? "s" : ""}`);
      setSelectedIds(new Set());
    },
    onError: () => toast.error("Failed to update some submissions"),
  });

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  const filtered = submissions.filter((s) => {
    const matchesSearch =
      !search ||
      s.recruiterName.toLowerCase().includes(search.toLowerCase()) ||
      s.jobTitle.toLowerCase().includes(search.toLowerCase()) ||
      (s.company?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchesStatus = filterStatus === "all" || s.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const newCount = submissions.filter((s) => s.status === "new").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Inbox className="h-5 w-5" />
          Recruiter Submissions
          {newCount > 0 && (
            <Badge className="bg-orange-600 text-white ml-2">{newCount} new</Badge>
          )}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Review job opportunities submitted by recruiters through your portal.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, company, or job title..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={filterStatus}
          onValueChange={(v) => setFilterStatus(v ?? "all")}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-orange-50 dark:bg-orange-950/30 border px-4 py-2">
          <span className="text-sm font-medium">
            <CheckSquare className="mr-1.5 inline h-4 w-4" />
            {selectedIds.size} selected
          </span>
          <Select
            onValueChange={(v) => {
              const status = typeof v === "string" ? v : null;
              if (status) bulkStatusMutation.mutate({ ids: [...selectedIds], status });
            }}
          >
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue placeholder="Change status…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="destructive"
            className="h-8 text-xs"
            onClick={() => bulkDeleteMutation.mutate([...selectedIds])}
            disabled={bulkDeleteMutation.isPending}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete ({selectedIds.size})
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => setSelectedIds(new Set())}
          >
            <X className="mr-1.5 h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
      )}

      {/* Submissions Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading submissions...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Inbox className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground">No submissions yet</h3>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Share your portal link with recruiters to start receiving opportunities.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((sub) => (
            <Card
              key={sub.id}
              className={cn(
                "cursor-pointer hover:shadow-md transition-shadow",
                selectedIds.has(sub.id) && "ring-2 ring-orange-500"
              )}
              onClick={() => setSelectedSubmission(sub)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(sub.id)}
                        onCheckedChange={() => toggleSelect(sub.id)}
                      />
                    </div>
                    <CardTitle className="text-base">{sub.jobTitle}</CardTitle>
                  </div>
                  <Badge className={SUBMISSION_COLORS[sub.status]}>
                    {SUBMISSION_LABELS[sub.status]}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  <span>{sub.recruiterName}</span>
                  {sub.company && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <Building2 className="h-3.5 w-3.5" />
                      <span>{sub.company}</span>
                    </>
                  )}
                </div>
                {sub.location && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>{sub.location}</span>
                  </div>
                )}
                {(sub.salaryMin || sub.salaryMax) && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <DollarSign className="h-3.5 w-3.5" />
                    <span>
                      {sub.salaryMin?.toLocaleString()}
                      {sub.salaryMin && sub.salaryMax && " - "}
                      {sub.salaryMax?.toLocaleString()}
                    </span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground/70 pt-1">
                  {format(new Date(sub.createdAt), "MMM d, yyyy 'at' h:mm a")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog
        open={!!selectedSubmission}
        onOpenChange={(open) => !open && setSelectedSubmission(null)}
      >
        {selectedSubmission && (
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                {selectedSubmission.jobTitle}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Status */}
              <div className="flex items-center justify-between">
                <Badge className={SUBMISSION_COLORS[selectedSubmission.status]}>
                  {SUBMISSION_LABELS[selectedSubmission.status]}
                </Badge>
                <span className="text-xs text-muted-foreground/70">
                  {format(new Date(selectedSubmission.createdAt), "PPP 'at' p")}
                </span>
              </div>

              {/* Recruiter Info */}
              <div className="rounded-lg border p-4 space-y-2">
                <h4 className="text-sm font-semibold">Recruiter</h4>
                <p className="text-sm">{selectedSubmission.recruiterName}</p>
                <a
                  href={`mailto:${selectedSubmission.recruiterEmail}`}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {selectedSubmission.recruiterEmail}
                </a>
                {selectedSubmission.recruiterPhone && (
                  <a
                    href={`tel:${selectedSubmission.recruiterPhone}`}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {selectedSubmission.recruiterPhone}
                  </a>
                )}
                {selectedSubmission.company && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" />
                    {selectedSubmission.company}
                  </div>
                )}
                {selectedSubmission.linkedinUrl && (
                  <a
                    href={selectedSubmission.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-orange-600 hover:underline"
                  >
                    <LinkIcon className="h-3.5 w-3.5" />
                    LinkedIn Profile
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <a
                  href={`/api/submissions/${selectedSubmission.id}/vcard`}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
                  download
                >
                  <Download className="h-3.5 w-3.5" />
                  Save to contacts (.vcf)
                </a>
                <p className="text-[10px] text-muted-foreground">
                  Add this recruiter to your phone so their calls and texts are recognized.
                </p>
              </div>

              {/* Job Details */}
              <div className="rounded-lg border p-4 space-y-2">
                <h4 className="text-sm font-semibold">Job Details</h4>
                {selectedSubmission.location && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {selectedSubmission.location}
                    {selectedSubmission.jobType && (
                      <Badge variant="outline" className="ml-1 text-xs">
                        {selectedSubmission.jobType}
                      </Badge>
                    )}
                  </div>
                )}
                {(selectedSubmission.salaryMin || selectedSubmission.salaryMax) && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <DollarSign className="h-3.5 w-3.5" />
                    ${selectedSubmission.salaryMin?.toLocaleString()}
                    {selectedSubmission.salaryMin && selectedSubmission.salaryMax && " - "}
                    ${selectedSubmission.salaryMax?.toLocaleString()}
                  </div>
                )}
                {selectedSubmission.jobDescription && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                    <p className="text-sm text-foreground/80 whitespace-pre-wrap">
                      {selectedSubmission.jobDescription}
                    </p>
                  </div>
                )}
              </div>

              {/* Message */}
              {selectedSubmission.message && (
                <div className="rounded-lg border p-4">
                  <h4 className="text-sm font-semibold mb-1">Message</h4>
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap">
                    {selectedSubmission.message}
                  </p>
                </div>
              )}

              {/* Auto-created links */}
              {(selectedSubmission.contactId || selectedSubmission.applicationId) && (
                <div className="rounded-lg bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 p-4 space-y-1">
                  <h4 className="text-sm font-semibold text-orange-800 dark:text-orange-200">
                    Auto-imported
                  </h4>
                  {selectedSubmission.contactId && (
                    <p className="text-xs text-orange-600 dark:text-orange-400">
                      Contact added to your contacts list
                    </p>
                  )}
                  {selectedSubmission.applicationId && (
                    <p className="text-xs text-orange-600 dark:text-orange-400">
                      Application added to your applications (Wishlist)
                    </p>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                {selectedSubmission.status === "new" && (
                  <Button
                    size="sm"
                    onClick={() => {
                      updateMutation.mutate({
                        id: selectedSubmission.id,
                        status: "reviewed",
                      });
                      setSelectedSubmission({
                        ...selectedSubmission,
                        status: "reviewed",
                      });
                    }}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Mark Reviewed
                  </Button>
                )}
                {selectedSubmission.status !== "archived" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      updateMutation.mutate({
                        id: selectedSubmission.id,
                        status: "archived",
                      });
                      setSelectedSubmission({
                        ...selectedSubmission,
                        status: "archived",
                      });
                    }}
                  >
                    <Archive className="h-4 w-4 mr-1" />
                    Archive
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 hover:text-red-700 ml-auto"
                  onClick={() => deleteMutation.mutate(selectedSubmission.id)}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
