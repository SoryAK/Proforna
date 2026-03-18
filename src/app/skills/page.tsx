"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, MoreHorizontal, Pencil, Trash2, Award } from "lucide-react";
import { toast } from "sonner";
import {
  SKILL_CATEGORIES,
  PROFICIENCY_LEVELS,
  type SkillCategory,
  type ProficiencyLevel,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";

interface Skill {
  id: string;
  name: string;
  category: string;
  proficiency: string;
  createdAt: string;
}

interface Certification {
  id: string;
  name: string;
  issuer: string;
  issueDate: string;
  expiryDate?: string | null;
  credentialUrl?: string | null;
  createdAt: string;
}

const proficiencyValue: Record<string, number> = {
  beginner: 25,
  intermediate: 50,
  advanced: 75,
  expert: 100,
};

const proficiencyColor: Record<string, string> = {
  beginner: "bg-gray-100 text-gray-700",
  intermediate: "bg-orange-100 text-orange-700",
  advanced: "bg-purple-100 text-purple-700",
  expert: "bg-green-100 text-green-700",
};

const categoryColor: Record<string, string> = {
  technical: "bg-orange-100 text-orange-700",
  soft: "bg-pink-100 text-pink-700",
  language: "bg-amber-100 text-amber-700",
  tool: "bg-cyan-100 text-cyan-700",
};

const emptySkillForm = { name: "", category: "technical", proficiency: "intermediate" };
const emptyCertForm = { name: "", issuer: "", issueDate: "", expiryDate: "", credentialUrl: "" };

export default function SkillsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("skills");
  const [skillDialog, setSkillDialog] = useState(false);
  const [certDialog, setCertDialog] = useState(false);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [editingCertId, setEditingCertId] = useState<string | null>(null);
  const [skillForm, setSkillForm] = useState(emptySkillForm);
  const [certForm, setCertForm] = useState(emptyCertForm);

  const { data: skills = [], isLoading: loadingSkills } = useQuery<Skill[]>({
    queryKey: ["skills"],
    queryFn: () => fetch("/api/skills").then((r) => r.json()),
  });

  const { data: certifications = [], isLoading: loadingCerts } = useQuery<Certification[]>({
    queryKey: ["certifications"],
    queryFn: () => fetch("/api/certifications").then((r) => r.json()),
  });

  // Skill mutations
  const saveSkill = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const url = editingSkillId ? `/api/skills/${editingSkillId}` : "/api/skills";
      const res = await fetch(url, {
        method: editingSkillId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      toast.success(editingSkillId ? "Skill updated" : "Skill added");
      closeSkillDialog();
    },
    onError: () => toast.error("Failed to save skill"),
  });

  const deleteSkill = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/skills/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      toast.success("Skill deleted");
    },
  });

  // Cert mutations
  const saveCert = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const url = editingCertId ? `/api/certifications/${editingCertId}` : "/api/certifications";
      const res = await fetch(url, {
        method: editingCertId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["certifications"] });
      toast.success(editingCertId ? "Certification updated" : "Certification added");
      closeCertDialog();
    },
    onError: () => toast.error("Failed to save certification"),
  });

  const deleteCert = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/certifications/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["certifications"] });
      toast.success("Certification deleted");
    },
  });

  function closeSkillDialog() {
    setSkillDialog(false);
    setEditingSkillId(null);
    setSkillForm(emptySkillForm);
  }
  function closeCertDialog() {
    setCertDialog(false);
    setEditingCertId(null);
    setCertForm(emptyCertForm);
  }

  function openEditSkill(s: Skill) {
    setEditingSkillId(s.id);
    setSkillForm({ name: s.name, category: s.category, proficiency: s.proficiency });
    setSkillDialog(true);
  }

  function openEditCert(c: Certification) {
    setEditingCertId(c.id);
    setCertForm({
      name: c.name,
      issuer: c.issuer,
      issueDate: c.issueDate.slice(0, 10),
      expiryDate: c.expiryDate ? c.expiryDate.slice(0, 10) : "",
      credentialUrl: c.credentialUrl || "",
    });
    setCertDialog(true);
  }

  function handleSkillSubmit(e: React.FormEvent) {
    e.preventDefault();
    saveSkill.mutate(skillForm);
  }

  function handleCertSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: Record<string, unknown> = {
      name: certForm.name,
      issuer: certForm.issuer,
      issueDate: new Date(certForm.issueDate).toISOString(),
      expiryDate: certForm.expiryDate ? new Date(certForm.expiryDate).toISOString() : null,
      credentialUrl: certForm.credentialUrl || null,
    };
    saveCert.mutate(data);
  }

  // Group skills by category
  const grouped = SKILL_CATEGORIES.reduce(
    (acc, cat) => {
      acc[cat] = skills.filter((s) => s.category === cat);
      return acc;
    },
    {} as Record<SkillCategory, Skill[]>
  );

  const isLoading = loadingSkills || loadingCerts;
  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Skills & Certifications</h1>
          <p className="text-sm text-muted-foreground">
            {skills.length} skills &middot; {certifications.length} certifications
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setTab("certifications"); setCertDialog(true); }}>
            <Award className="mr-2 h-4 w-4" /> Add Certification
          </Button>
          <Button onClick={() => { setTab("skills"); setSkillDialog(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Add Skill
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="skills">Skills ({skills.length})</TabsTrigger>
            <TabsTrigger value="certifications">Certifications ({certifications.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="skills" className="space-y-6">
            {SKILL_CATEGORIES.map((cat) =>
              grouped[cat].length > 0 ? (
                <div key={cat}>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 capitalize">
                    {cat} Skills
                  </h3>
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {grouped[cat].map((skill) => (
                      <Card key={skill.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="font-medium text-sm">{skill.name}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge className={cn("text-xs capitalize", categoryColor[skill.category])}>
                                  {skill.category}
                                </Badge>
                                <Badge className={cn("text-xs capitalize", proficiencyColor[skill.proficiency])}>
                                  {skill.proficiency}
                                </Badge>
                              </div>
                              <Progress
                                value={proficiencyValue[skill.proficiency] || 50}
                                className="mt-2 h-1.5"
                              />
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent">
                                <MoreHorizontal className="h-4 w-4" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEditSkill(skill)}>
                                  <Pencil className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => deleteSkill.mutate(skill.id)} className="text-red-600">
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : null
            )}
            {skills.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">No skills added yet</div>
            )}
          </TabsContent>

          <TabsContent value="certifications">
            {certifications.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No certifications added yet</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {certifications.map((cert) => (
                  <Card key={cert.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-sm">{cert.name}</CardTitle>
                          <p className="text-xs text-muted-foreground">{cert.issuer}</p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent">
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditCert(cert)}>
                              <Pencil className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => deleteCert.mutate(cert.id)} className="text-red-600">
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        Issued {format(new Date(cert.issueDate), "MMM yyyy")}
                        {cert.expiryDate && ` · Expires ${format(new Date(cert.expiryDate), "MMM yyyy")}`}
                      </p>
                      {cert.credentialUrl && (
                        <a
                          href={cert.credentialUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-orange-600 hover:underline"
                        >
                          View Credential
                        </a>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Skill Dialog */}
      <Dialog open={skillDialog} onOpenChange={(open) => !open && closeSkillDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSkillId ? "Edit Skill" : "Add Skill"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSkillSubmit} className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input required value={skillForm.name} onChange={(e) => setSkillForm({ ...skillForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Select value={skillForm.category} onValueChange={(v) => setSkillForm({ ...skillForm, category: v ?? skillForm.category })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SKILL_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Proficiency</Label>
                <Select value={skillForm.proficiency} onValueChange={(v) => setSkillForm({ ...skillForm, proficiency: v ?? skillForm.proficiency })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROFICIENCY_LEVELS.map((p) => (
                      <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeSkillDialog}>Cancel</Button>
              <Button type="submit" disabled={saveSkill.isPending}>
                {saveSkill.isPending ? "Saving..." : editingSkillId ? "Update" : "Add"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Certification Dialog */}
      <Dialog open={certDialog} onOpenChange={(open) => !open && closeCertDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCertId ? "Edit Certification" : "Add Certification"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCertSubmit} className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input required value={certForm.name} onChange={(e) => setCertForm({ ...certForm, name: e.target.value })} />
            </div>
            <div>
              <Label>Issuer *</Label>
              <Input required value={certForm.issuer} onChange={(e) => setCertForm({ ...certForm, issuer: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Issue Date *</Label>
                <Input type="date" required value={certForm.issueDate} onChange={(e) => setCertForm({ ...certForm, issueDate: e.target.value })} />
              </div>
              <div>
                <Label>Expiry Date</Label>
                <Input type="date" value={certForm.expiryDate} onChange={(e) => setCertForm({ ...certForm, expiryDate: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Credential URL</Label>
              <Input type="url" value={certForm.credentialUrl} onChange={(e) => setCertForm({ ...certForm, credentialUrl: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeCertDialog}>Cancel</Button>
              <Button type="submit" disabled={saveCert.isPending}>
                {saveCert.isPending ? "Saving..." : editingCertId ? "Update" : "Add"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
