"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  Briefcase,
  Plus,
  Pencil,
  Trash2,
  Globe,
  Eye,
  EyeOff,
  MapPin,
  DollarSign,
  Clock,
  Building2,
  Star,
  ExternalLink,
  Copy,
  Search,
  Users,
  Calendar,
  Loader2,
  Megaphone,
} from "lucide-react";

/* ── Types ── */
interface JobPosting {
  id: string;
  slug: string;
  company: string;
  companyLogo: string | null;
  role: string;
  department: string | null;
  location: string | null;
  type: string;
  employmentType: string;
  experienceLevel: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  payFrequency: string;
  description: string;
  requirements: string | null;
  niceToHave: string | null;
  benefits: string | null;
  techStack: string | null;
  applicationUrl: string | null;
  contactEmail: string | null;
  ein: string | null;
  isPublished: boolean;
  isFeatured: boolean;
  expiresAt: string | null;
  viewCount: number;
  applicationCount: number;
  createdAt: string;
  updatedAt: string;
}

type PostingForm = {
  company: string;
  role: string;
  department: string;
  location: string;
  type: string;
  employmentType: string;
  experienceLevel: string;
  salaryMin: string;
  salaryMax: string;
  currency: string;
  payFrequency: string;
  description: string;
  requirements: string;
  niceToHave: string;
  benefits: string;
  techStack: string;
  applicationUrl: string;
  contactEmail: string;
  ein: string;
  isPublished: boolean;
  isFeatured: boolean;
  expiresAt: string;
};

const emptyForm: PostingForm = {
  company: "",
  role: "",
  department: "",
  location: "",
  type: "remote",
  employmentType: "full_time",
  experienceLevel: "mid",
  salaryMin: "",
  salaryMax: "",
  currency: "USD",
  payFrequency: "yearly",
  description: "",
  requirements: "",
  niceToHave: "",
  benefits: "",
  techStack: "",
  applicationUrl: "",
  contactEmail: "",
  ein: "",
  isPublished: false,
  isFeatured: false,
  expiresAt: "",
};

const TYPE_LABELS: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: "Full-Time",
  part_time: "Part-Time",
  contract: "Contract",
  internship: "Internship",
  temporary: "Temporary",
};

const LEVEL_LABELS: Record<string, string> = {
  entry: "Entry Level",
  mid: "Mid Level",
  senior: "Senior",
  lead: "Lead",
  executive: "Executive",
};

const FREQ_LABELS: Record<string, string> = {
  hourly: "/hr",
  yearly: "/yr",
};

function fmtSalary(min: number | null, max: number | null, currency: string, freq: string) {
  const f = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  if (min && max) return `${f(min)} – ${f(max)}${FREQ_LABELS[freq] ?? ""}`;
  if (min) return `From ${f(min)}${FREQ_LABELS[freq] ?? ""}`;
  if (max) return `Up to ${f(max)}${FREQ_LABELS[freq] ?? ""}`;
  return null;
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function JobPostingsPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PostingForm>(emptyForm);
  const [filterStatus, setFilterStatus] = useState<"all" | "published" | "draft">("all");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: postings = [], isLoading } = useQuery<JobPosting[]>({
    queryKey: ["job-postings"],
    queryFn: () => fetch("/api/job-postings").then((r) => r.json()),
  });

  const saveMutation = useMutation({
    mutationFn: async (data: PostingForm) => {
      const url = editingId ? `/api/job-postings/${editingId}` : "/api/job-postings";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(editingId ? "Posting updated" : "Posting created");
      qc.invalidateQueries({ queryKey: ["job-postings"] });
      closeDialog();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/job-postings/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      toast.success("Posting deleted");
      qc.invalidateQueries({ queryKey: ["job-postings"] });
    },
    onError: () => toast.error("Failed to delete"),
  });

  const togglePublish = useMutation({
    mutationFn: async ({ id, isPublished }: { id: string; isPublished: boolean }) => {
      const res = await fetch(`/api/job-postings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished }),
      });
      if (!res.ok) throw new Error("Failed to update");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job-postings"] }),
  });

  function openNew() {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(p: JobPosting) {
    setEditingId(p.id);
    setForm({
      company: p.company,
      role: p.role,
      department: p.department ?? "",
      location: p.location ?? "",
      type: p.type,
      employmentType: p.employmentType,
      experienceLevel: p.experienceLevel,
      salaryMin: p.salaryMin?.toString() ?? "",
      salaryMax: p.salaryMax?.toString() ?? "",
      currency: p.currency,
      payFrequency: p.payFrequency,
      description: p.description,
      requirements: p.requirements ?? "",
      niceToHave: p.niceToHave ?? "",
      benefits: p.benefits ?? "",
      techStack: p.techStack ?? "",
      applicationUrl: p.applicationUrl ?? "",
      contactEmail: p.contactEmail ?? "",
      ein: p.ein ?? "",
      isPublished: p.isPublished,
      isFeatured: p.isFeatured,
      expiresAt: p.expiresAt ? p.expiresAt.split("T")[0] : "",
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function handleSave() {
    if (!form.company.trim() || !form.role.trim() || !form.description.trim()) {
      toast.error("Company, role, and description are required");
      return;
    }
    saveMutation.mutate(form);
  }

  function copyPublicLink(slug: string) {
    const url = `${window.location.origin}/jobs/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Public link copied!");
  }

  const filtered = postings.filter((p) => {
    if (filterStatus === "published" && !p.isPublished) return false;
    if (filterStatus === "draft" && p.isPublished) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        p.company.toLowerCase().includes(q) ||
        p.role.toLowerCase().includes(q) ||
        (p.location?.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  const publishedCount = postings.filter((p) => p.isPublished).length;
  const draftCount = postings.filter((p) => !p.isPublished).length;
  const totalViews = postings.reduce((s, p) => s + p.viewCount, 0);
  const totalApps = postings.reduce((s, p) => s + p.applicationCount, 0);

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-indigo-600 via-purple-600 to-violet-600 p-6 text-white shadow-lg">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djZoLTZWMzRoNnptMC0zMHY2aC02VjRoNnptMCAxNXY2aC02VjE5aDZ6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-30" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              <Megaphone className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Job Postings</h1>
              <p className="text-sm text-white/80 mt-0.5">
                Create and manage job postings for your company&apos;s public job board.
              </p>
            </div>
          </div>
          <Button
            onClick={openNew}
            className="bg-white/20 hover:bg-white/30 text-white border-white/30 backdrop-blur-sm"
            variant="outline"
          >
            <Plus className="h-4 w-4 mr-1.5" /> New Posting
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-indigo-500">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/40">
              <Briefcase className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Total</p>
              <p className="text-2xl font-bold font-mono">{postings.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/40">
              <Globe className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Published</p>
              <p className="text-2xl font-bold font-mono">{publishedCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/40">
              <Eye className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Views</p>
              <p className="text-2xl font-bold font-mono">{totalViews}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/40">
              <Users className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Applications</p>
              <p className="text-2xl font-bold font-mono">{totalApps}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search postings..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {(["all", "published", "draft"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={filterStatus === s ? "default" : "outline"}
              onClick={() => setFilterStatus(s)}
            >
              {s === "all" ? "All" : s === "published" ? `Published (${publishedCount})` : `Drafts (${draftCount})`}
            </Button>
          ))}
        </div>
      </div>

      {/* Postings List */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6"><div className="h-24 bg-muted rounded-lg" /></CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Briefcase className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
            <h3 className="text-lg font-semibold mb-1">
              {postings.length === 0 ? "No job postings yet" : "No matching postings"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {postings.length === 0
                ? "Create your first job posting to start building your company's job board."
                : "Try adjusting your search or filters."}
            </p>
            {postings.length === 0 && (
              <Button onClick={openNew}>
                <Plus className="h-4 w-4 mr-1.5" /> Create First Posting
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const salary = fmtSalary(p.salaryMin, p.salaryMax, p.currency, p.payFrequency);
            const expired = p.expiresAt && new Date(p.expiresAt) < new Date();
            const tech = p.techStack?.split(",").map((t) => t.trim()).filter(Boolean) ?? [];

            return (
              <Card
                key={p.id}
                className={`group hover:shadow-md transition-shadow ${
                  !p.isPublished ? "border-dashed opacity-80" : ""
                } ${expired ? "border-red-200 dark:border-red-800" : ""}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Company icon */}
                    <div className="hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/40 dark:to-purple-900/40">
                      <Building2 className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                    </div>

                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Title row */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-base">{p.role}</h3>
                            {p.isFeatured && (
                              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 text-[10px]">
                                <Star className="h-2.5 w-2.5 mr-0.5" /> Featured
                              </Badge>
                            )}
                            {expired && (
                              <Badge variant="destructive" className="text-[10px]">Expired</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{p.company}{p.department ? ` · ${p.department}` : ""}</p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <Switch
                            checked={p.isPublished}
                            onCheckedChange={(v) => togglePublish.mutate({ id: p.id, isPublished: v })}
                          />
                          <span className="text-[10px] text-muted-foreground w-8">{p.isPublished ? "Live" : "Draft"}</span>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(p)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {p.isPublished && (
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => copyPublicLink(p.slug)}>
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                            onClick={() => deleteMutation.mutate(p.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Meta badges */}
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="secondary" className="text-[11px] gap-1">
                          <MapPin className="h-3 w-3" /> {p.location || "Remote"}
                        </Badge>
                        <Badge variant="secondary" className="text-[11px]">
                          {TYPE_LABELS[p.type] ?? p.type}
                        </Badge>
                        <Badge variant="secondary" className="text-[11px]">
                          {EMPLOYMENT_LABELS[p.employmentType] ?? p.employmentType}
                        </Badge>
                        <Badge variant="secondary" className="text-[11px]">
                          {LEVEL_LABELS[p.experienceLevel] ?? p.experienceLevel}
                        </Badge>
                        {salary && (
                          <Badge variant="secondary" className="text-[11px] gap-1">
                            <DollarSign className="h-3 w-3" /> {salary}
                          </Badge>
                        )}
                      </div>

                      {/* Tech stack chips */}
                      {tech.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {tech.slice(0, 8).map((t) => (
                            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                              {t}
                            </span>
                          ))}
                          {tech.length > 8 && (
                            <span className="text-[10px] px-2 py-0.5 text-muted-foreground">+{tech.length - 8}</span>
                          )}
                        </div>
                      )}

                      {/* Footer stats */}
                      <div className="flex items-center gap-4 text-[11px] text-muted-foreground pt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {timeAgo(p.createdAt)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" /> {p.viewCount} views
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" /> {p.applicationCount} apps
                        </span>
                        {p.applicationUrl && (
                          <a
                            href={p.applicationUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 hover:text-foreground transition-colors"
                          >
                            <ExternalLink className="h-3 w-3" /> Apply link
                          </a>
                        )}
                        {p.expiresAt && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> Expires {new Date(p.expiresAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Create / Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Job Posting" : "Create Job Posting"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 pt-2">
            {/* Company & Role */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="mb-1.5">Company *</Label>
                <Input
                  placeholder="Acme Corp"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1.5">Role / Title *</Label>
                <Input
                  placeholder="Senior Software Engineer"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="mb-1.5">Department</Label>
                <Input
                  placeholder="Engineering"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1.5">Location</Label>
                <Input
                  placeholder="New York, NY / Remote"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                />
              </div>
            </div>

            {/* Type selects */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label className="mb-1.5">Work Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v ?? "remote" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5">Employment Type</Label>
                <Select value={form.employmentType} onValueChange={(v) => setForm({ ...form, employmentType: v ?? "full_time" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(EMPLOYMENT_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5">Experience Level</Label>
                <Select value={form.experienceLevel} onValueChange={(v) => setForm({ ...form, experienceLevel: v ?? "mid" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(LEVEL_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Salary */}
            <div className="grid gap-4 sm:grid-cols-4">
              <div>
                <Label className="mb-1.5">Min Salary</Label>
                <Input
                  type="number"
                  placeholder="60000"
                  value={form.salaryMin}
                  onChange={(e) => setForm({ ...form, salaryMin: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1.5">Max Salary</Label>
                <Input
                  type="number"
                  placeholder="100000"
                  value={form.salaryMax}
                  onChange={(e) => setForm({ ...form, salaryMax: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1.5">Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v ?? "USD" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="CAD">CAD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5">Pay Frequency</Label>
                <Select value={form.payFrequency} onValueChange={(v) => setForm({ ...form, payFrequency: v ?? "yearly" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yearly">Yearly</SelectItem>
                    <SelectItem value="hourly">Hourly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Description */}
            <div>
              <Label className="mb-1.5">Job Description *</Label>
              <Textarea
                rows={5}
                placeholder="Describe the role, responsibilities, and what makes it exciting..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div>
              <Label className="mb-1.5">Requirements</Label>
              <Textarea
                rows={3}
                placeholder="List required qualifications, one per line..."
                value={form.requirements}
                onChange={(e) => setForm({ ...form, requirements: e.target.value })}
              />
            </div>

            <div>
              <Label className="mb-1.5">Nice to Have</Label>
              <Textarea
                rows={2}
                placeholder="Preferred but not required skills..."
                value={form.niceToHave}
                onChange={(e) => setForm({ ...form, niceToHave: e.target.value })}
              />
            </div>

            <div>
              <Label className="mb-1.5">Benefits & Perks</Label>
              <Textarea
                rows={2}
                placeholder="Health insurance, 401k, flexible PTO, remote-first..."
                value={form.benefits}
                onChange={(e) => setForm({ ...form, benefits: e.target.value })}
              />
            </div>

            <div>
              <Label className="mb-1.5">Tech Stack</Label>
              <Input
                placeholder="React, TypeScript, Node.js, PostgreSQL"
                value={form.techStack}
                onChange={(e) => setForm({ ...form, techStack: e.target.value })}
              />
              <p className="text-[10px] text-muted-foreground mt-1">Comma-separated</p>
            </div>

            {/* Links & Contact */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="mb-1.5">Application URL</Label>
                <Input
                  placeholder="https://company.com/careers/apply"
                  value={form.applicationUrl}
                  onChange={(e) => setForm({ ...form, applicationUrl: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1.5">Contact Email</Label>
                <Input
                  type="email"
                  placeholder="jobs@company.com"
                  value={form.contactEmail}
                  onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="mb-1.5">EIN (optional)</Label>
                <Input
                  placeholder="12-3456789"
                  value={form.ein}
                  onChange={(e) => setForm({ ...form, ein: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1.5">Expires</Label>
                <Input
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                />
              </div>
            </div>

            {/* Toggles */}
            <div className="flex flex-col gap-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Publish Immediately</p>
                  <p className="text-xs text-muted-foreground">Make visible on the public job board</p>
                </div>
                <Switch
                  checked={form.isPublished}
                  onCheckedChange={(v) => setForm({ ...form, isPublished: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Featured Posting</p>
                  <p className="text-xs text-muted-foreground">Highlighted at the top of search results</p>
                </div>
                <Switch
                  checked={form.isFeatured}
                  onCheckedChange={(v) => setForm({ ...form, isFeatured: v })}
                />
              </div>
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button onClick={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                {editingId ? "Update Posting" : "Create Posting"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
