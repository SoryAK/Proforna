"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, MoreHorizontal, Pencil, Trash2, FileText, Check, Star, ChevronDown, Download, FileDown, UploadCloud, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import AdaptiveIrEditor from "@/components/adaptive-ir-editor";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { unwrapAIEnvelope, type AIMeta } from "@/lib/ai/envelope";
import { AIProvenanceChip } from "@/components/ai-provenance-chip";
interface Resume {
  id: string;
  name: string;
  filePath?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  targetRole?: string | null;
  notes?: string | null;
  versionNumber: number;
  isActive: boolean;
  createdAt: string;
}

const emptyForm = {
  name: "",
  targetRole: "",
  notes: "",
  versionNumber: "1",
  isActive: false,
};

export default function ResumesPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parsedResumeData, setParsedResumeData] = useState<any>(null);
  const [parseAi, setParseAi] = useState<AIMeta | null>(null);
  const [savingImport, setSavingImport] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [interactiveOpen, setInteractiveOpen] = useState(true);

  const { data: resumes = [], isLoading } = useQuery<Resume[]>({
    queryKey: ["resumes"],
    queryFn: () => fetch("/api/resumes").then((r) => r.json()),
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const url = editingId ? `/api/resumes/${editingId}` : "/api/resumes";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
      toast.success(editingId ? "Resume updated" : "Resume created");
      closeDialog();
    },
    onError: () => toast.error("Failed to save resume"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/resumes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
      toast.success("Resume deleted");
    },
  });

  const setActiveMutation = useMutation({
    mutationFn: async (id: string) => {
      // deactivate all then activate one
      for (const r of resumes) {
        if (r.isActive && r.id !== id) {
          await fetch(`/api/resumes/${r.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: false }),
          });
        }
      }
      const res = await fetch(`/api/resumes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
      toast.success("Active resume updated");
    },
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function openEdit(r: Resume) {
    setEditingId(r.id);
    setForm({
      name: r.name,
      targetRole: r.targetRole || "",
      notes: r.notes || "",
      versionNumber: r.versionNumber.toString(),
      isActive: r.isActive,
    });
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: Record<string, unknown> = {
      name: form.name,
      targetRole: form.targetRole || null,
      notes: form.notes || null,
      versionNumber: parseInt(form.versionNumber) || 1,
      isActive: form.isActive,
    };
    saveMutation.mutate(data);
  }

  async function handleImportResume(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File is too large. Max size is 5MB.");
      return;
    }
    
    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are supported currently.");
      return;
    }

    setImporting(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/resume-parse", {
        method: "POST",
        body: formData,
      });
      const envelope = await res.json();
      if (!res.ok) throw new Error(envelope.error || "Failed to parse resume");
      const { data: payload, ai } = unwrapAIEnvelope<{ success: boolean; data: any }>(envelope);
      setParseAi(ai ?? null);
      const result = payload ?? { success: false, data: {} };
      
      // Sanitize AI output: replace literal "null" strings with empty string
      const sanitize = (obj: any): any => {
        if (obj === null || obj === undefined || obj === "null" || obj === "undefined") return "";
        if (typeof obj === "string") return obj;
        if (Array.isArray(obj)) return obj.map(sanitize);
        if (typeof obj === "object") {
          const out: any = {};
          for (const [k, v] of Object.entries(obj)) {
            out[k] = sanitize(v);
          }
          return out;
        }
        return obj;
      };

      setParsedResumeData(sanitize(result.data));
      toast.success("Resume parsed successfully! Please review the data.");
      
    } catch (err: any) {
      toast.error(err.message || "Failed to process resume");
    } finally {
      setImporting(false);
      if (e.target) e.target.value = ""; // reset file input
    }
  }

  async function handleSaveImport() {
    if (!parsedResumeData) return;
    setSavingImport(true);

    try {
      const res = await fetch("/api/resume-import-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedResumeData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save resume data");
      
      toast.success("Profile & Experience updated successfully!");
      setImportDialogOpen(false);
      setParsedResumeData(null);
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
      // We also update user profile data so any other components refetch
      queryClient.invalidateQueries(); 
    } catch (err: any) {
      toast.error(err.message || "Failed to save resume data");
    } finally {
      setSavingImport(false);
    }
  }

  async function handleExport(resumeId: string, format: "pdf" | "docx") {
    try {
      const res = await fetch(`/api/resume-export/${format}?resumeId=${encodeURIComponent(resumeId)}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || `resume.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} downloaded`);
    } catch {
      toast.error(`Failed to export ${format.toUpperCase()}`);
    }
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    );
  }

  const active = resumes.find((r) => r.isActive);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Resumes</h1>
          <p className="text-sm text-muted-foreground">
            {resumes.length} versions{active && ` · Active: ${active.name}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setImportDialogOpen(true)} className="gap-2">
            <Sparkles className="h-4 w-4" /> AI Import
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> New Version
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {resumes.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed rounded-lg bg-slate-50/50 dark:bg-slate-900/50">
            <div className="bg-orange-100 dark:bg-orange-900/30 p-3 rounded-full mb-4">
              <FileText className="h-6 w-6 text-orange-600 dark:text-orange-400" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Create Your First Resume</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Your resume is the foundation of your portfolio. Add different versions for different roles, starting with a base template you can evolve over time.
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Resume Version
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {resumes.map((r) => (
              <Card key={r.id} className={r.isActive ? "ring-2 ring-orange-500" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <CardTitle className="text-sm">{r.name}</CardTitle>
                        <p className="text-xs text-muted-foreground">v{r.versionNumber}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {r.isActive && (
                        <Badge className="bg-orange-100 text-orange-700 text-xs">
                          <Check className="mr-1 h-3 w-3" /> Active
                        </Badge>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent">
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {!r.isActive && (
                            <DropdownMenuItem onClick={() => setActiveMutation.mutate(r.id)}>
                              <Star className="mr-2 h-4 w-4" /> Set Active
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleExport(r.id, "pdf")}>
                            <Download className="mr-2 h-4 w-4" /> Download PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleExport(r.id, "docx")}>
                            <FileDown className="mr-2 h-4 w-4" /> Download DOCX
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(r)}>
                            <Pencil className="mr-2 h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => deleteMutation.mutate(r.id)} className="text-red-600">
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {r.targetRole && (
                    <p className="text-xs text-muted-foreground">
                      Target: {r.targetRole}
                    </p>
                  )}
                  {r.fileName && (
                    <p className="text-xs text-muted-foreground">
                      {r.fileName}{r.fileSize ? ` (${formatSize(r.fileSize)})` : ""}
                    </p>
                  )}
                  {r.notes && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{r.notes}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Created {format(new Date(r.createdAt), "MMM d, yyyy")}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Interactive Resumes Section */}
      <div className="border-t px-4 py-3">
        <button
          onClick={() => setInteractiveOpen(!interactiveOpen)}
          className="flex items-center gap-2 w-full text-left mb-4"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${interactiveOpen ? "rotate-180" : ""}`} />
          <h2 className="text-lg font-semibold">Interactive Resumes</h2>
          <span className="text-xs text-muted-foreground">Shareable living resumes</span>
        </button>
        {interactiveOpen && <AdaptiveIrEditor />}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Resume" : "New Resume Version"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Software Engineer Resume"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Target Role</Label>
                <Input
                  value={form.targetRole}
                  onChange={(e) => setForm({ ...form, targetRole: e.target.value })}
                />
              </div>
              <div>
                <Label>Version Number</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.versionNumber}
                  onChange={(e) => setForm({ ...form, versionNumber: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="rounded border-gray-300"
              />
              <Label htmlFor="isActive">Set as active resume</Label>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : editingId ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={importDialogOpen} onOpenChange={(open) => {
        setImportDialogOpen(open);
        if (!open) {
          setParsedResumeData(null);
        }
      }}>
        <DialogContent className="sm:max-w-3xl max-w-[95vw] max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-orange-500" />
              {parsedResumeData ? "Review AI Extracted Data" : "AI Resume Import"}
            </DialogTitle>
            {parsedResumeData && parseAi && (
              <div className="pt-1">
                <AIProvenanceChip ai={parseAi} />
              </div>
            )}
          </DialogHeader>

          {!parsedResumeData ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload your existing resume (PDF only for now) to let AI automatically extract your profile, experience, and skills to populate your account.
              </p>
              <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-10 bg-slate-50 dark:bg-slate-900 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800">
                <UploadCloud className="h-10 w-10 text-muted-foreground mb-4" />
                <Label
                  htmlFor="resume-upload"
                  className="cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors"
                >
                  {importing ? "Parsing with AI..." : "Select Resume (PDF)"}
                </Label>
                <input
                  id="resume-upload"
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  disabled={importing}
                  onChange={handleImportResume}
                />
                <p className="text-xs text-muted-foreground mt-4">
                  Max file size: 5MB
                </p>
              </div>
            </div>
          ) : (
             <div className="flex flex-col flex-1 overflow-hidden min-h-0">
               <div className="flex-1 overflow-y-auto border rounded-md mb-4 max-h-[65vh]">
                  <div className="space-y-8 p-5">

                    {/* ── Profile ── */}
                    <section>
                      <h3 className="text-base font-semibold border-b pb-2 mb-4">Profile</h3>
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1 block">Headline</Label>
                            <Input
                              placeholder="e.g. Senior Software Engineer"
                              value={parsedResumeData.profile?.headline || ""}
                              onChange={(e) => setParsedResumeData({ ...parsedResumeData, profile: { ...parsedResumeData.profile, headline: e.target.value } })}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1 block">Location</Label>
                            <Input
                              placeholder="City, State"
                              value={parsedResumeData.profile?.location || ""}
                              onChange={(e) => setParsedResumeData({ ...parsedResumeData, profile: { ...parsedResumeData.profile, location: e.target.value } })}
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">Bio / Summary</Label>
                          <Textarea
                            rows={3}
                            placeholder="Short professional summary"
                            value={parsedResumeData.profile?.bio || ""}
                            onChange={(e) => setParsedResumeData({ ...parsedResumeData, profile: { ...parsedResumeData.profile, bio: e.target.value } })}
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1 block">Website</Label>
                            <Input
                              placeholder="https://yoursite.com"
                              value={parsedResumeData.profile?.website || ""}
                              onChange={(e) => setParsedResumeData({ ...parsedResumeData, profile: { ...parsedResumeData.profile, website: e.target.value } })}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1 block">LinkedIn URL</Label>
                            <Input
                              placeholder="https://linkedin.com/in/..."
                              value={parsedResumeData.profile?.linkedinUrl || ""}
                              onChange={(e) => setParsedResumeData({ ...parsedResumeData, profile: { ...parsedResumeData.profile, linkedinUrl: e.target.value } })}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1 block">GitHub URL</Label>
                            <Input
                              placeholder="https://github.com/..."
                              value={parsedResumeData.profile?.githubUrl || ""}
                              onChange={(e) => setParsedResumeData({ ...parsedResumeData, profile: { ...parsedResumeData.profile, githubUrl: e.target.value } })}
                            />
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* ── Experience ── */}
                    <section>
                      <h3 className="text-base font-semibold border-b pb-2 mb-4">Experience ({parsedResumeData.experience?.length || 0})</h3>
                      <div className="space-y-4">
                        {(parsedResumeData.experience || []).map((exp: any, i: number) => {
                          const updateExp = (field: string, value: any) => {
                            const updated = [...parsedResumeData.experience];
                            updated[i] = { ...updated[i], [field]: value };
                            setParsedResumeData({ ...parsedResumeData, experience: updated });
                          };
                          const removeExp = () => {
                            const updated = parsedResumeData.experience.filter((_: any, idx: number) => idx !== i);
                            setParsedResumeData({ ...parsedResumeData, experience: updated });
                          };
                          return (
                            <div key={i} className="border rounded-lg p-4 bg-slate-50 dark:bg-slate-900 space-y-3 relative">
                              <button type="button" onClick={removeExp} className="absolute top-2 right-2 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30" title="Remove entry">
                                <X className="h-4 w-4 text-red-500" />
                              </button>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pr-6">
                                <div>
                                  <Label className="text-xs text-muted-foreground mb-1 block">Job Title</Label>
                                  <Input value={exp.title || ""} onChange={(e) => updateExp("title", e.target.value)} />
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground mb-1 block">Company</Label>
                                  <Input value={exp.company || ""} onChange={(e) => updateExp("company", e.target.value)} />
                                </div>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground mb-1 block">Location</Label>
                                <Input value={exp.location || ""} onChange={(e) => updateExp("location", e.target.value)} />
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                                <div>
                                  <Label className="text-xs text-muted-foreground mb-1 block">Start Date</Label>
                                  <Input type="date" value={exp.startDate || ""} onChange={(e) => updateExp("startDate", e.target.value)} />
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground mb-1 block">End Date</Label>
                                  <Input type="date" value={exp.endDate || ""} disabled={exp.isCurrent === true} onChange={(e) => updateExp("endDate", e.target.value)} />
                                </div>
                                <div className="flex items-center gap-2 pb-2">
                                  <input
                                    type="checkbox"
                                    id={`current-${i}`}
                                    checked={exp.isCurrent === true}
                                    onChange={(e) => updateExp("isCurrent", e.target.checked)}
                                    className="rounded border-gray-300"
                                  />
                                  <Label htmlFor={`current-${i}`} className="text-xs whitespace-nowrap">Current position</Label>
                                </div>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground mb-1 block">Description</Label>
                                <Textarea rows={2} placeholder="Describe the role" value={exp.description || ""} onChange={(e) => updateExp("description", e.target.value)} />
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground mb-1 block">Key Achievements (one per line)</Label>
                                <Textarea
                                  rows={3}
                                  placeholder="- Led migration to microservices&#10;- Reduced latency by 40%"
                                  value={Array.isArray(exp.achievements) ? exp.achievements.filter((a: string) => a).join("\n") : ""}
                                  onChange={(e) => updateExp("achievements", e.target.value.split("\n"))}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>

                    {/* ── Education ── */}
                    <section>
                      <h3 className="text-base font-semibold border-b pb-2 mb-4">Education ({(parsedResumeData.education || []).length})</h3>
                      {(parsedResumeData.education || []).length > 0 ? (
                        <div className="space-y-4">
                          {(parsedResumeData.education || []).map((edu: any, i: number) => {
                            const updateEdu = (field: string, value: any) => {
                              const updated = [...(parsedResumeData.education || [])];
                              updated[i] = { ...updated[i], [field]: value };
                              setParsedResumeData({ ...parsedResumeData, education: updated });
                            };
                            const removeEdu = () => {
                              const updated = (parsedResumeData.education || []).filter((_: any, idx: number) => idx !== i);
                              setParsedResumeData({ ...parsedResumeData, education: updated });
                            };
                            return (
                              <div key={i} className="border rounded-lg p-4 bg-slate-50 dark:bg-slate-900 space-y-3 relative">
                                <button type="button" onClick={removeEdu} className="absolute top-2 right-2 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30" title="Remove">
                                  <X className="h-4 w-4 text-red-500" />
                                </button>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pr-6">
                                  <div>
                                    <Label className="text-xs text-muted-foreground mb-1 block">Institution</Label>
                                    <Input value={edu.institution || ""} onChange={(e) => updateEdu("institution", e.target.value)} />
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground mb-1 block">Degree</Label>
                                    <Input value={edu.degree || ""} onChange={(e) => updateEdu("degree", e.target.value)} />
                                  </div>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground mb-1 block">Field of Study</Label>
                                  <Input value={edu.field || ""} onChange={(e) => updateEdu("field", e.target.value)} />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div>
                                    <Label className="text-xs text-muted-foreground mb-1 block">Start Date</Label>
                                    <Input type="date" value={edu.startDate || ""} onChange={(e) => updateEdu("startDate", e.target.value)} />
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground mb-1 block">End Date</Label>
                                    <Input type="date" value={edu.endDate || ""} onChange={(e) => updateEdu("endDate", e.target.value)} />
                                  </div>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground mb-1 block">Description</Label>
                                  <Textarea rows={2} placeholder="Relevant coursework, honors, etc." value={edu.description || ""} onChange={(e) => updateEdu("description", e.target.value)} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No education entries extracted.</p>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => {
                          setParsedResumeData({
                            ...parsedResumeData,
                            education: [...(parsedResumeData.education || []), { institution: "", degree: "", field: "", startDate: "", endDate: "", description: "" }],
                          });
                        }}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Education
                      </Button>
                    </section>

                    {/* ── Skills ── */}
                    <section>
                      <h3 className="text-base font-semibold border-b pb-2 mb-4">Skills ({(parsedResumeData.skills || []).length})</h3>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {(parsedResumeData.skills || []).map((skill: string, i: number) => (
                           <Badge key={i} variant="secondary" className="gap-1 pr-1 text-sm">
                             {skill}
                             <button
                               type="button"
                               onClick={() => {
                                 const updated = parsedResumeData.skills.filter((_: any, idx: number) => idx !== i);
                                 setParsedResumeData({ ...parsedResumeData, skills: updated });
                               }}
                               className="ml-1 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 p-0.5"
                             >
                               <X className="h-3 w-3 text-muted-foreground hover:text-red-500" />
                             </button>
                           </Badge>
                        ))}
                      </div>
                      <Input
                        placeholder="Type a skill and press Enter to add"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const val = (e.target as HTMLInputElement).value.trim();
                            if (val) {
                              setParsedResumeData({ ...parsedResumeData, skills: [...(parsedResumeData.skills || []), val] });
                              (e.target as HTMLInputElement).value = "";
                            }
                          }
                        }}
                      />
                    </section>

                  </div>
               </div>
               <div className="flex justify-end gap-2 pt-2 border-t mt-auto">
                 <Button variant="outline" onClick={() => setParsedResumeData(null)} disabled={savingImport}>
                   Cancel
                 </Button>
                 <Button onClick={handleSaveImport} disabled={savingImport}>
                   {savingImport ? "Saving..." : "Confirm & Save"}
                 </Button>
               </div>
             </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
