"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
  Building2,
  MapPin,
  Calendar,
  DollarSign,
  Code2,
  User,
  Layers,
  Plus,
  Pencil,
  Trash2,
  Clock,
  Briefcase,
  Monitor,
  ChevronRight,
  ChevronDown,
  Receipt,
  Globe,
  Factory,
  ClockArrowUp,
  Target,
  Loader2,
  RefreshCw,
  Sparkles,
  ImagePlus,
  XCircle,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { format, formatDistanceToNow } from "date-fns";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CompensationTracker } from "@/components/compensation-tracker";
import { PaycheckEstimator } from "@/components/paycheck-estimator";
import { BenefitsTracker } from "@/components/benefits-tracker";
import { TimeOffTracker } from "@/components/timeoff-tracker";
import { PayPeriodCalendar } from "@/components/pay-period-calendar";
import { EquipmentTracker } from "@/components/equipment-tracker";
import { PositionWorklogTab } from "@/components/position-worklog-tab";
import { HoursWorkedTracker } from "@/components/hours-worked-tracker";
import { CompanyIntel } from "@/components/company-intel";
import { WorkHistoryShiftManager } from "@/components/work-history-shift-manager";


interface Position {
  id: string;
  company: string;
  role: string;
  department: string | null;
  location: string | null;
  type: string;
  startDate: string;
  salary: number | null;
  currency: string;
  description: string | null;
  responsibilities: string | null;
  techStack: string | null;
  managerName: string | null;
  isActive: boolean;
  ein: string | null;
  legalName: string | null;
  companySynopsis: string | null;
  companyClosed: boolean;
  locationClosed: boolean;
  industry: string | null;
  website: string | null;
  address: string | null;
  focus: string | null;
  schedule: string | null;
  payRate: string | null;
  payType: string;
  differentials: string | null;
  payFrequency: string;
  rotatingSchedule: boolean;
  hoursPerWeek: number | null;
  scheduleBHours: number | null;
  otHoursA: number | null;
  otHoursB: number | null;
  otRate: number | null;
  annualRaiseMin: number | null;
  annualRaiseMax: number | null;
  estimatorSettings: string | null;
  coverImage: string | null;
  createdAt: string;
}

function PaycheckToolsSection({ active }: { active: Position }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-left hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg p-1.5 bg-violet-50"><Receipt className="h-3.5 w-3.5 text-violet-600" /></div>
          <div>
            <p className="text-sm font-semibold">Paycheck Tools</p>
            <p className="text-xs text-muted-foreground">Paycheck estimator &amp; pay period calendar</p>
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-0" : "-rotate-90"}`} />
      </button>
      {open && (
        <div className="space-y-4 pl-1">
          <PaycheckEstimator
            payType={active.payType}
            payRate={active.payRate}
            differentials={active.differentials}
            salary={active.salary}
            payFrequency={active.payFrequency}
            rotatingSchedule={active.rotatingSchedule}
            hoursPerWeek={active.hoursPerWeek}
            scheduleBHours={active.scheduleBHours}
            otHoursA={active.otHoursA}
            otHoursB={active.otHoursB}
            otRate={active.otRate}
            estimatorSettings={active.estimatorSettings}
          />
          <PayPeriodCalendar positionId={active.id} />
        </div>
      )}
    </>
  );
}

const emptyForm = {
  company: "",
  role: "",
  department: "",
  location: "",
  type: "remote",
  startDate: "",
  salary: "",
  currency: "USD",
  description: "",
  responsibilities: "",
  techStack: "",
  managerName: "",
  ein: "",
  legalName: "",
  companySynopsis: "",
  companyClosed: false,
  locationClosed: false,
  industry: "",
  website: "",
  address: "",
  focus: "",
  schedule: "",
  payRate: "",
  payType: "salary",
  differentials: "",
  payFrequency: "biweekly",
  rotatingSchedule: false,
  hoursPerWeek: "",
  scheduleBHours: "",
  otHoursA: "",
  otHoursB: "",
  otRate: "1.5",
};

const TYPE_ICON: Record<string, React.ElementType> = {
  remote: Monitor,
  hybrid: Building2,
  onsite: MapPin,
};

export default function CurrentPositionPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [jdText, setJdText] = useState("");
  const [showJDInput, setShowJDInput] = useState(false);
  const [isParsing, setIsParsing] = useState(false);

  const { data: positions = [], isLoading } = useQuery<Position[]>({
    queryKey: ["current-position"],
    queryFn: async () => {
      const res = await fetch("/api/current-position");
      if (!res.ok) throw new Error("Failed to fetch positions");
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch("/api/current-position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["current-position"] });
      queryClient.invalidateQueries({ queryKey: ["cfm"] });
      toast.success("Position added!");
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      fetch(`/api/current-position/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["current-position"] });
      queryClient.invalidateQueries({ queryKey: ["cfm"] });
      toast.success("Position updated!");
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/current-position/${id}`, { method: "DELETE" }).then((r) =>
        r.json()
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["current-position"] });
      queryClient.invalidateQueries({ queryKey: ["cfm"] });
      toast.success("Position removed");
    },
  });

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    setJdText("");
    setShowJDInput(false);
  };

  const openEdit = (pos: Position) => {
    setForm({
      company: pos.company,
      role: pos.role,
      department: pos.department || "",
      location: pos.location || "",
      type: pos.type,
      startDate: pos.startDate ? format(new Date(pos.startDate), "yyyy-MM-dd") : "",
      salary: pos.salary?.toString() || "",
      currency: pos.currency,
      description: pos.description || "",
      responsibilities: pos.responsibilities || "",
      techStack: pos.techStack || "",
      managerName: pos.managerName || "",
      ein: pos.ein || "",
      legalName: pos.legalName || "",
      companySynopsis: pos.companySynopsis || "",
      companyClosed: !!pos.companyClosed,
      locationClosed: !!pos.locationClosed,
      industry: pos.industry || "",
      website: pos.website || "",
      address: pos.address || "",
      focus: pos.focus || "",
      schedule: pos.schedule || "",
      payRate: pos.payRate || "",
      payType: pos.payType || "salary",
      differentials: pos.differentials || "",
      payFrequency: pos.payFrequency || "biweekly",
      rotatingSchedule: pos.rotatingSchedule ?? false,
      hoursPerWeek: pos.hoursPerWeek?.toString() || "",
      scheduleBHours: pos.scheduleBHours?.toString() || "",
      otHoursA: pos.otHoursA?.toString() || "",
      otHoursB: pos.otHoursB?.toString() || "",
      otRate: pos.otRate?.toString() || "1.5",
    });
    setEditingId(pos.id);
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      salary: form.salary ? parseInt(form.salary) : null,
      hoursPerWeek: form.hoursPerWeek ? parseFloat(form.hoursPerWeek) : null,
      scheduleBHours: form.scheduleBHours ? parseFloat(form.scheduleBHours) : null,
      otHoursA: form.otHoursA ? parseFloat(form.otHoursA) : null,
      otHoursB: form.otHoursB ? parseFloat(form.otHoursB) : null,
      otRate: form.otRate ? parseFloat(form.otRate) : null,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleLookup = async () => {
    if (!form.website) {
      toast.error("Enter a website URL first");
      return;
    }
    setIsLookingUp(true);
    try {
      const res = await fetch("/api/company-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: form.website }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Lookup failed");
        return;
      }
      // Only fill fields that are currently empty
      setForm((prev) => ({
        ...prev,
        company: prev.company || data.company || "",
        companySynopsis: prev.companySynopsis || data.companySynopsis || "",
        ein: prev.ein || data.ein || "",
        legalName: prev.legalName || data.legalName || "",
        industry: prev.industry || data.industry || "",
      }));
      toast.success("Company details auto-filled!" + (data.ein ? " (EIN found via SEC)" : ""));
    } catch {
      toast.error("Could not reach the website");
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleParseJD = async () => {
    if (!jdText.trim()) {
      toast.error("Please paste a job description or offer letter text.");
      return;
    }
    setIsParsing(true);
    try {
      const res = await fetch("/api/job-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: jdText }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to parse job description");
        return;
      }
      
      setForm((prev) => ({
        ...prev,
        role: data.role || prev.role,
        department: data.department || prev.department,
        location: data.location || prev.location,
        type: data.type || prev.type,
        salary: data.salary ? String(data.salary) : prev.salary,
        payType: data.payType || prev.payType,
        payRate: data.payRate || prev.payRate,
        hoursPerWeek: data.hoursPerWeek ? String(data.hoursPerWeek) : prev.hoursPerWeek,
        schedule: data.schedule || prev.schedule,
        focus: data.focus || prev.focus,
        responsibilities: data.responsibilities || prev.responsibilities,
        techStack: data.techStack || prev.techStack,
      }));
      toast.success("Job details extracted and filled!");
      setShowJDInput(false);
    } catch {
      toast.error("Failed to connect to parser service");
    } finally {
      setIsParsing(false);
    }
  };

  const active = positions.find((p) => p.isActive);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card className="animate-pulse"><CardContent className="p-8"><div className="h-40 bg-gray-200 rounded" /></CardContent></Card>
        <Card className="animate-pulse"><CardContent className="p-6"><div className="h-24 bg-gray-200 rounded" /></CardContent></Card>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="space-y-6">
        <Card className="overflow-hidden">
          <div className="h-20 bg-gradient-to-r from-slate-600 via-slate-500 to-slate-400" />
          <CardContent className="py-10 text-center relative">
            <div className="-mt-16 mb-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border-4 border-background bg-white shadow-md">
                <Building2 className="h-7 w-7 text-slate-400" />
              </div>
            </div>
            <h2 className="text-xl font-semibold">Set Up Your Company Profile</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
              Add your current position to create a daily workspace with your company, role,
              tech stack, and responsibilities all in one place.
            </p>
            <Button className="mt-6" onClick={() => { resetForm(); setShowForm(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your Current Role
            </Button>
          </CardContent>
        </Card>
        {renderDialog()}
      </div>
    );
  }

  const TypeIcon = active ? (TYPE_ICON[active.type] || Monitor) : Monitor;
  const tenure = active ? formatDistanceToNow(new Date(active.startDate)) : "";
  const responsibilities = active?.responsibilities?.split("\n").filter(Boolean) ?? [];
  const techItems = active?.techStack?.split(",").map((t) => t.trim()).filter(Boolean) ?? [];

  return (
    <div className="space-y-4">
      {/* ── Company Profile Header ── */}
      {active && (
        <Card className="overflow-hidden pt-0">
          {/* Banner */}
          <div className={`h-36 ${active.coverImage ? '' : 'bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500'} relative`}>
            {active.coverImage && (
              <img
                src={active.coverImage}
                alt={`${active.company} cover`}
                className="w-full h-full object-cover"
              />
            )}
            <div className="absolute top-3 right-3 flex gap-2">
              <label className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm cursor-pointer transition-colors">
                <ImagePlus className="h-3.5 w-3.5" />
                {active.coverImage ? 'Change' : 'Cover'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 2 * 1024 * 1024) {
                      toast.error('Image must be under 2 MB');
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      updateMutation.mutate({ id: active.id, data: { coverImage: reader.result as string } });
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
              {active.coverImage && (
                <Button size="sm" variant="secondary" className="bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm" onClick={() => updateMutation.mutate({ id: active.id, data: { coverImage: null } })}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Remove
                </Button>
              )}
              <Button size="sm" variant="secondary" className="bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm" onClick={() => openEdit(active)}>
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Edit
              </Button>
            </div>
          </div>

          <CardContent className="relative px-4 pb-4 pt-0">
            {/* Company Logo / Initials */}
            <div className="-mt-12 mb-3 flex items-end gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-background bg-white text-2xl font-bold text-emerald-600 shadow-md">
                {active.company.slice(0, 2).toUpperCase()}
              </div>
              <div className="mb-1 flex flex-wrap gap-2">
                <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>
                <Badge variant="outline" className="capitalize gap-1">
                  <TypeIcon className="h-3 w-3" />
                  {active.type}
                </Badge>
              </div>
            </div>

            {/* Company + Role */}
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold">{active.company}</h1>
                {active.companyClosed && (
                  <span
                    className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 inline-flex items-center gap-1"
                    title="Company is no longer in operation"
                  >
                    <XCircle className="h-3 w-3" /> Company Closed
                  </span>
                )}
                {!active.companyClosed && active.locationClosed && (
                  <span
                    className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 inline-flex items-center gap-1"
                    title="This location/branch is closed (company is still operating)"
                  >
                    <XCircle className="h-3 w-3" /> Location Closed
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{active.role}</p>
              {active.industry && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Factory className="h-3.5 w-3.5" />
                  {active.industry}
                </p>
              )}
              {active.companySynopsis && (
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  {active.companySynopsis}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
                {active.department && (
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5" />
                    {active.department}
                  </span>
                )}
                {active.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {active.location}
                  </span>
                )}
                {active.website && (
                  <a
                    href={active.website.startsWith("http") ? active.website : `https://${active.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-orange-600 hover:underline"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    {active.website.replace(/^https?:\/\//, "")}
                  </a>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Since {format(new Date(active.startDate), "MMM yyyy")} ({tenure})
                </span>
              </div>
            </div>

            {/* Quick Facts */}
            <div className="mt-3 flex flex-wrap gap-2">
              {active.salary && (
                <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-sm">
                  <DollarSign className="h-3.5 w-3.5 text-green-600" />
                  <span className="font-semibold">{active.currency} {active.salary.toLocaleString()}</span>
                  <span className="text-muted-foreground">/ year</span>
                </div>
              )}
              {active.payRate && (
                <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-sm">
                  <DollarSign className="h-3.5 w-3.5 text-green-600" />
                  <span className="font-semibold">{active.payRate}</span>
                  <span className="text-muted-foreground capitalize">/ {active.payType === "hourly" ? "hr base" : active.payType}</span>
                </div>
              )}
              {active.payType === "hourly" && active.differentials && (
                <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-sm">
                  <Layers className="h-3.5 w-3.5 text-amber-600" />
                  <span className="font-semibold">{active.differentials.split("\n").filter(Boolean).length}</span>
                  <span className="text-muted-foreground">differentials</span>
                </div>
              )}
              {active.schedule && (
                <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-sm">
                  <ClockArrowUp className="h-3.5 w-3.5 text-orange-600" />
                  <span className="font-semibold">{active.schedule}</span>
                </div>
              )}
              {active.rotatingSchedule && (
                <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-sm">
                  <RefreshCw className="h-3.5 w-3.5 text-indigo-600" />
                  <span className="font-semibold">Rotating</span>
                  <span className="text-muted-foreground">
                    {active.hoursPerWeek && active.scheduleBHours
                      ? `${active.hoursPerWeek}/${active.scheduleBHours} hrs`
                      : "schedule"}
                  </span>
                </div>
              )}
              {active.managerName && (
                <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-sm">
                  <User className="h-3.5 w-3.5 text-orange-600" />
                  <span className="text-muted-foreground">Reports to</span>
                  <span className="font-semibold">{active.managerName}</span>
                </div>
              )}
              {techItems.length > 0 && (
                <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-sm">
                  <Code2 className="h-3.5 w-3.5 text-purple-600" />
                  <span className="font-semibold">{techItems.length}</span>
                  <span className="text-muted-foreground">tools</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Tabbed Sections ── */}
      {active && (
        <Tabs defaultValue="profile">
          <TabsList variant="line" className="w-full justify-start">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="compensation">Compensation</TabsTrigger>
            <TabsTrigger value="benefits">Benefits</TabsTrigger>
            <TabsTrigger value="timeoff">Time Off</TabsTrigger>
            <TabsTrigger value="equipment">Equipment</TabsTrigger>
            <TabsTrigger value="worklog">Work Log</TabsTrigger>
            <TabsTrigger value="hours">Hours Worked</TabsTrigger>
            {active.ein && <TabsTrigger value="intel">Company Intel</TabsTrigger>}
          </TabsList>

          <TabsContent value="profile" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-3">
              {/* Main Column */}
              <div className="lg:col-span-2 space-y-4">
                {/* Focus / Primary Role Summary */}
                {active.focus && (
                  <Card>
                    <CardHeader className="pb-1 pt-3 px-4">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Target className="h-3.5 w-3.5" />
                        Focus
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                      <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">
                        {active.focus}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* About the Role */}
                {active.description && (
                  <Card>
                    <CardHeader className="pb-1 pt-3 px-4">
                      <CardTitle className="text-sm">About the Role</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                      <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">
                        {active.description}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Key Responsibilities */}
                {responsibilities.length > 0 && (
                  <Card>
                    <CardHeader className="pb-1 pt-3 px-4">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Layers className="h-3.5 w-3.5" />
                        Key Responsibilities
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                      <ul className="space-y-1.5">
                        {responsibilities.map((r, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs">
                            <ChevronRight className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                            <span className="text-muted-foreground">{r.trim()}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Sidebar */}
              <div className="space-y-3">
                {/* Tools & Technologies */}
                {techItems.length > 0 && (
                  <Card>
                    <CardHeader className="pb-1 pt-3 px-4">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Code2 className="h-3.5 w-3.5" />
                        Tools & Technologies
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                      <div className="flex flex-wrap gap-2">
                        {techItems.map((tech) => (
                          <Badge key={tech} variant="secondary">{tech}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Role Details */}
                <Card>
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-sm">Details</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 space-y-2 text-xs">
                    <div className="divide-y">
                      {[
                        ["Company", active.company],
                        active.ein ? ["EIN", <span key="ein" className="font-mono">{active.ein}</span>] : null,
                        ["Position", active.role],
                        active.department ? ["Department", active.department] : null,
                        ["Work Type", <span key="type" className="capitalize">{active.type}</span>],
                        active.location ? ["Location", active.location] : null,
                        ["Started", format(new Date(active.startDate), "MMM d, yyyy")],
                        ["Tenure", tenure],
                        active.salary ? ["Compensation", `${active.currency} ${active.salary.toLocaleString()}/yr`] : null,
                        active.payRate ? [active.payType === "hourly" ? "Base Rate" : "Pay Rate", `${active.payRate}${active.payType === "hourly" ? "/hr" : ""}`] : null,
                        active.schedule ? ["Schedule", active.schedule] : null,
                        active.industry ? ["Industry", active.industry] : null,
                      ].filter(Boolean).map((item, i) => {
                        const [label, value] = item as [string, React.ReactNode];
                        return (
                          <div key={i} className="flex justify-between py-1.5">
                            <span className="text-muted-foreground">{label}</span>
                            <span className="font-medium text-right">{value}</span>
                          </div>
                        );
                      })}
                      {active.payType === "hourly" && active.differentials && (
                        <div className="py-1.5">
                          <span className="text-muted-foreground">Differentials</span>
                          <div className="mt-1 space-y-0.5">
                            {active.differentials.split("\n").filter(Boolean).map((d, i) => (
                              <div key={i} className="flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                                <span className="font-medium">{d}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {active.website && (
                        <div className="flex justify-between py-1.5">
                          <span className="text-muted-foreground">Website</span>
                          <a
                            href={active.website.startsWith("http") ? active.website : `https://${active.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-orange-600 hover:underline truncate max-w-[160px]"
                          >
                            {active.website.replace(/^https?:\/\//, "")}
                          </a>
                        </div>
                      )}
                      {active.address && (
                        <div className="flex justify-between py-1.5">
                          <span className="text-muted-foreground">Address</span>
                          <span className="font-medium text-right max-w-[160px]">{active.address}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Actions */}
                <WorkHistoryShiftManager positionId={active.id} />

                {/* Actions */}
                <Card>
                  <CardContent className="p-3 flex flex-col gap-2">
                    <Button variant="outline" className="w-full justify-start" onClick={() => openEdit(active)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit Position
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => deleteMutation.mutate(active.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remove Position
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="compensation" className="mt-4 space-y-4">
            <CompensationTracker
              positionId={active.id}
              payType={active.payType}
              payRate={active.payRate}
              differentials={active.differentials}
              salary={active.salary}
              schedule={active.schedule}
              payFrequency={active.payFrequency}
              rotatingSchedule={active.rotatingSchedule}
              hoursPerWeek={active.hoursPerWeek}
              scheduleBHours={active.scheduleBHours}
              otHoursA={active.otHoursA}
              otHoursB={active.otHoursB}
              otRate={active.otRate}
              annualRaiseMin={active.annualRaiseMin}
              annualRaiseMax={active.annualRaiseMax}
              estimatorSettings={active.estimatorSettings}
            />
            <PaycheckToolsSection active={active} />
          </TabsContent>

          <TabsContent value="benefits" className="mt-4">
            <BenefitsTracker positionId={active.id} />
          </TabsContent>

          <TabsContent value="timeoff" className="mt-4">
            <TimeOffTracker positionId={active.id} />
          </TabsContent>

          <TabsContent value="equipment" className="mt-4">
            <EquipmentTracker positionId={active.id} />
          </TabsContent>

          <TabsContent value="worklog" className="mt-4">
            <PositionWorklogTab positionId={active.id} />
          </TabsContent>

          <TabsContent value="hours" className="mt-4">
            <HoursWorkedTracker positionId={active.id} />
          </TabsContent>

          {active.ein && (
            <TabsContent value="intel" className="mt-4">
              <CompanyIntel ein={active.ein} companyName={active.company} legalName={active.legalName || undefined} location={active.location || undefined} />
            </TabsContent>
          )}

        </Tabs>
      )}

      {renderDialog()}
    </div>
  );

    function renderDialog() {
    return (
      <Dialog open={showForm} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="sm:max-w-3xl md:max-w-4xl max-h-[90vh] overflow-y-auto w-[95vw]">
          <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pr-8">
            <DialogTitle>
              {editingId ? "Edit Position" : "Add Position"}
            </DialogTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowJDInput(!showJDInput)}
              className="gap-2 text-primary bg-primary/5 hover:bg-primary/10 border-primary/20"
            >
              <Sparkles className="h-4 w-4" />
              Auto-fill with AI
            </Button>
          </DialogHeader>

          {showJDInput && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3 mb-2 animate-in fade-in slide-in-from-top-2">
              <p className="text-sm font-medium text-primary flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Smart Extraction
              </p>
              <p className="text-xs text-muted-foreground">
                Paste the job description or offer letter text below. AI will analyze the text and auto-populate the form fields.
              </p>
              <Textarea
                rows={4}
                placeholder="Paste JD or Offer text here..."
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                className="bg-background"
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowJDInput(false)}>Cancel</Button>
                <Button type="button" size="sm" disabled={isParsing || !jdText.trim()} onClick={handleParseJD}>
                  {isParsing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</> : "Extract Details"}
                </Button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-8 items-start">
              {/* Left Column */}
              <div className="space-y-4 border-r-0 md:border-r md:pr-4 dark:border-border/50 border-border/50">
                <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="mb-1">Company *</Label>
                <Input
                  required
                  placeholder="Acme Corp"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1">Role / Title *</Label>
                <Input
                  required
                  placeholder="Senior Software Engineer"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1">Department</Label>
                <Input
                  placeholder="Engineering"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1">Location</Label>
                <Input
                  placeholder="San Francisco, CA"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1">Work Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm({ ...form, type: v ?? "remote" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="remote">Remote</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                    <SelectItem value="onsite">On-site</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1">Start Date *</Label>
                <Input
                  required
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1">Annual Salary</Label>
                <Input
                  type="number"
                  placeholder="150000"
                  value={form.salary}
                  onChange={(e) => setForm({ ...form, salary: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1">Currency</Label>
                <Select
                  value={form.currency}
                  onValueChange={(v) => setForm({ ...form, currency: v ?? "USD" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="CAD">CAD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="mb-1">Manager Name</Label>
              <Input
                placeholder="Jane Smith"
                value={form.managerName}
                onChange={(e) => setForm({ ...form, managerName: e.target.value })}
              />
            </div>

            {/* Company Details */}
            <Separator />
            <p className="text-sm font-semibold text-muted-foreground">Company Details</p>
            <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3">
              <p className="text-xs text-muted-foreground mb-2">
                <Globe className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
                Enter the company website and click <strong>Lookup</strong> to auto-fill details.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="https://www.company.com"
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isLookingUp || !form.website}
                  onClick={handleLookup}
                  className="shrink-0"
                >
                  {isLookingUp ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Lookup"
                  )}
                </Button>
              </div>
            </div>
            <div>
              <Label className="mb-1">Company Synopsis</Label>
              <Textarea
                placeholder="Brief description of the company..."
                rows={2}
                value={form.companySynopsis}
                onChange={(e) => setForm({ ...form, companySynopsis: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="mb-1">Industry</Label>
                <Input
                  placeholder="e.g. Food Manufacturing"
                  value={form.industry}
                  onChange={(e) => setForm({ ...form, industry: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1">EIN (Employer ID)</Label>
                <Input
                  placeholder="XX-XXXXXXX"
                  value={form.ein}
                  onChange={(e) => setForm({ ...form, ein: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label className="mb-1">Legal Filing Name</Label>
              <Input
                placeholder="e.g. BARRY CALLEBAUT USA LLC"
                value={form.legalName}
                onChange={(e) => setForm({ ...form, legalName: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.companyClosed}
                onChange={(e) => setForm({ ...form, companyClosed: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span>Company has closed (no longer in operation)</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.locationClosed}
                onChange={(e) => setForm({ ...form, locationClosed: e.target.checked })}
                disabled={form.companyClosed}
                className="h-4 w-4 rounded border-gray-300 disabled:opacity-50"
              />
              <span className={form.companyClosed ? "text-muted-foreground line-through" : ""}>
                This location is closed (company still operating)
              </span>
            </label>
            {(form.type === "onsite" || form.type === "hybrid") && (
              <div>
                <Label className="mb-1">Office Address</Label>
                <Input
                  placeholder="123 Main St, City, State ZIP"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
            )}
              </div>

              {/* Right Column */}
              <div className="space-y-4 md:pl-2">
                {/* Job Details */}
                <h4 className="text-sm font-semibold text-muted-foreground pb-2 border-b md:border-none md:pb-0 mb-4 md:mb-0">
                  Job Details
                </h4>
            <div>
              <Label className="mb-1">Focus (Primary Role Summary)</Label>
              <Textarea
                placeholder="Describe the primary focus of this role..."
                rows={3}
                value={form.focus}
                onChange={(e) => setForm({ ...form, focus: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="mb-1">Schedule</Label>
                <Input
                  placeholder="e.g. Overnight 6pm-6am | 3:4 rotating"
                  value={form.schedule}
                  onChange={(e) => setForm({ ...form, schedule: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1">Pay Type</Label>
                <Select
                  value={form.payType}
                  onValueChange={(v) => setForm({ ...form, payType: v ?? "salary" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="salary">Salary</SelectItem>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="mb-1">
                {form.payType === "hourly" ? "Base Rate" : "Pay Rate"}
              </Label>
              <Input
                placeholder={form.payType === "hourly" ? "e.g. $35.50/hr" : "e.g. $85,000"}
                value={form.payRate}
                onChange={(e) => setForm({ ...form, payRate: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="mb-1">Pay Frequency</Label>
                <Select
                  value={form.payFrequency}
                  onValueChange={(v) => setForm({ ...form, payFrequency: v ?? "biweekly" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Bi-Weekly</SelectItem>
                    <SelectItem value="semimonthly">Semi-Monthly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.payType === "hourly" && (
              <>
                <div className="flex items-center justify-between rounded-lg border border-dashed p-3">
                  <div>
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <RefreshCw className="h-3.5 w-3.5" />
                      Rotating Schedule
                    </p>
                    <p className="text-xs text-muted-foreground">Alternate between two weekly schedules</p>
                  </div>
                  <Switch
                    checked={form.rotatingSchedule}
                    onCheckedChange={(v) => setForm({ ...form, rotatingSchedule: v })}
                  />
                </div>
                <div className={`grid gap-4 ${form.rotatingSchedule ? "sm:grid-cols-2" : ""}`}>
                  <div>
                    <Label className="mb-1">{form.rotatingSchedule ? "Schedule A — Hrs / Week" : "Regular Hrs / Week"}</Label>
                    <Input
                      type="number"
                      placeholder="40"
                      value={form.hoursPerWeek}
                      onChange={(e) => {
                        const hrs = parseFloat(e.target.value) || 0;
                        const updates: Record<string, string> = { hoursPerWeek: e.target.value };
                        // Auto-detect overtime: hours over 40 are OT
                        if (hrs > 40 && !form.otHoursA) {
                          updates.otHoursA = (hrs - 40).toString();
                        }
                        setForm({ ...form, ...updates });
                      }}
                    />
                  </div>
                  {form.rotatingSchedule && (
                    <div>
                      <Label className="mb-1">Schedule B — Hrs / Week</Label>
                      <Input
                        type="number"
                        placeholder="36"
                        value={form.scheduleBHours}
                        onChange={(e) => {
                          const hrs = parseFloat(e.target.value) || 0;
                          const updates: Record<string, string> = { scheduleBHours: e.target.value };
                          if (hrs > 40 && !form.otHoursB) {
                            updates.otHoursB = (hrs - 40).toString();
                          }
                          setForm({ ...form, ...updates });
                        }}
                      />
                    </div>
                  )}
                </div>
                {/* OT Detection — auto-show when any schedule exceeds 40 hrs */}
                {(() => {
                  const hrsA = parseFloat(form.hoursPerWeek) || 0;
                  const hrsB = parseFloat(form.scheduleBHours) || 0;
                  const hasOT = hrsA > 40 || (form.rotatingSchedule && hrsB > 40) || parseFloat(form.otHoursA) > 0 || parseFloat(form.otHoursB) > 0;
                  if (!hasOT) return null;
                  return (
                    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-3">
                      <p className="text-sm font-medium flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                        <ClockArrowUp className="h-3.5 w-3.5" />
                        Overtime Detected
                      </p>
                      <div className={`grid gap-4 ${form.rotatingSchedule ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                        <div>
                          <Label className="text-xs mb-1">{form.rotatingSchedule ? "Sched A OT Hrs" : "OT Hrs / Week"}</Label>
                          <Input
                            type="number"
                            placeholder={hrsA > 40 ? (hrsA - 40).toString() : "0"}
                            value={form.otHoursA}
                            onChange={(e) => setForm({ ...form, otHoursA: e.target.value })}
                          />
                        </div>
                        {form.rotatingSchedule && (
                          <div>
                            <Label className="text-xs mb-1">Sched B OT Hrs</Label>
                            <Input
                              type="number"
                              placeholder={hrsB > 40 ? (hrsB - 40).toString() : "0"}
                              value={form.otHoursB}
                              onChange={(e) => setForm({ ...form, otHoursB: e.target.value })}
                            />
                          </div>
                        )}
                        <div>
                          <Label className="text-xs mb-1">OT Multiplier</Label>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="1.5"
                            value={form.otRate}
                            onChange={(e) => setForm({ ...form, otRate: e.target.value })}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Hours over 40/week are typically overtime at {form.otRate || "1.5"}× rate
                      </p>
                    </div>
                  );
                })()}
              </>
            )}
            {/* Auto-calculated annual salary estimate */}
            {form.payType === "hourly" && form.payRate && form.hoursPerWeek && (
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3">
                {(() => {
                  const rate = parseFloat(form.payRate.replace(/[^0-9.]/g, "")) || 0;
                  const hrsA = parseFloat(form.hoursPerWeek) || 0;
                  const hrsB = parseFloat(form.scheduleBHours) || 0;
                  const weeksPerYear = 52;

                  // Parse differentials from the form
                  const diffLines = form.differentials.split("\n").filter(Boolean);
                  const parseDiff = (d: string) => {
                    const m = d.match(/[+-]?\$?([\d.]+)/);
                    return m ? parseFloat(m[1]) : 0;
                  };
                  const totalDiffPerHr = diffLines.reduce((sum, d) => sum + parseDiff(d), 0);

                  // OT from form inputs
                  const otHrsA = parseFloat(form.otHoursA) || 0;
                  const otHrsB = parseFloat(form.otHoursB) || 0;
                  const otMult = parseFloat(form.otRate) || 1.5;
                  const regHrsA = Math.min(hrsA, 40);
                  const regHrsB = Math.min(hrsB, 40);

                  let basePay: number, diffPay: number, otPay: number;
                  if (form.rotatingSchedule && hrsB > 0) {
                    const half = weeksPerYear / 2;
                    basePay = rate * (regHrsA * half + regHrsB * half);
                    diffPay = totalDiffPerHr * (regHrsA * half + regHrsB * half);
                    otPay = rate * otMult * (otHrsA * half + otHrsB * half);
                  } else {
                    basePay = rate * regHrsA * weeksPerYear;
                    diffPay = totalDiffPerHr * regHrsA * weeksPerYear;
                    otPay = rate * otMult * otHrsA * weeksPerYear;
                  }
                  const total = basePay + diffPay + otPay;

                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm">
                          <DollarSign className="h-4 w-4 text-emerald-600" />
                          <span className="text-muted-foreground">Estimated Annual Salary</span>
                        </div>
                        <span className="text-lg font-bold font-mono text-emerald-700 dark:text-emerald-400">
                          ${total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          <span className="text-xs text-muted-foreground font-normal ml-1">/yr</span>
                        </span>
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <div className="flex justify-between">
                          <span>Base Pay (${rate}/hr × {form.rotatingSchedule ? `avg ${((regHrsA + regHrsB) / 2).toFixed(0)}` : regHrsA} reg hrs × 52 wks)</span>
                          <span className="font-mono">${basePay.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        </div>
                        {otPay > 0 && (
                          <div className="flex justify-between text-orange-700 dark:text-orange-400">
                            <span>Overtime ({otMult}× × {form.rotatingSchedule ? `avg ${((otHrsA + otHrsB) / 2).toFixed(1)}` : otHrsA} OT hrs/wk)</span>
                            <span className="font-mono">+${otPay.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                          </div>
                        )}
                        {diffPay > 0 && (
                          <div className="flex justify-between text-amber-700 dark:text-amber-400">
                            <span>Differentials (+${totalDiffPerHr.toFixed(2)}/hr on reg hrs)</span>
                            <span className="font-mono">+${diffPay.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                          </div>
                        )}
                      </div>
                      {otPay === 0 && (
                        <p className="text-xs text-muted-foreground mt-1.5">
                          Bonuses &amp; additional OT calculated in the Compensation tab.
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {form.payType === "hourly" && (
              <div>
                <Label className="mb-1">Differentials (one per line)</Label>
                <Textarea
                  placeholder={"Night Shift +$2.00\nWeekend +$3.00\nHoliday +$5.00"}
                  rows={3}
                  value={form.differentials}
                  onChange={(e) => setForm({ ...form, differentials: e.target.value })}
                />
              </div>
            )}

            <Separator />
            <div>
              <Label className="mb-1">Tools & Technologies (comma-separated)</Label>
              <Input
                placeholder="e.g. SAP, Excel, Salesforce, AutoCAD"
                value={form.techStack}
                onChange={(e) => setForm({ ...form, techStack: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1">Role Description</Label>
              <Textarea
                placeholder="Brief description of the role..."
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1">Key Responsibilities (one per line)</Label>
              <Textarea
                placeholder="Lead frontend architecture&#10;Mentor junior engineers&#10;Code reviews and technical design"
                rows={4}
                value={form.responsibilities}
                onChange={(e) => setForm({ ...form, responsibilities: e.target.value })}
              />
            </div>
            <div className="flex gap-2 pt-2 md:col-span-2 mt-4">
              <Button type="submit" className="flex-1">
                {editingId ? "Save Changes" : "Add Position"}
              </Button>
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancel
              </Button>
            </div>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    );
  }
}
