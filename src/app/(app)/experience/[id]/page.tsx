"use client";

import { useState, use } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
  Pencil,
  Trash2,
  Clock,
  Briefcase,
  Monitor,
  ChevronRight,
  ChevronLeft,
  Globe,
  Factory,
  ClockArrowUp,
  Target,
  Loader2,
  RefreshCw,
  ImagePlus,
  XCircle,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { format, formatDistanceToNow } from "date-fns";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CompensationTracker } from "@/components/compensation-tracker";
import { BenefitsTracker } from "@/components/benefits-tracker";
import { TimeOffTracker } from "@/components/timeoff-tracker";
import { CompanyIntel } from "@/components/company-intel";
import { PositionWorklogTab } from "@/components/position-worklog-tab";
import { WorkHistoryShiftManager } from "@/components/work-history-shift-manager";
import Link from "next/link";

interface Position {
  id: string;
  company: string;
  role: string;
  department: string | null;
  location: string | null;
  type: string;
  startDate: string;
  endDate: string | null;
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

const emptyForm = {
  company: "",
  role: "",
  department: "",
  location: "",
  type: "remote",
  startDate: "",
  endDate: "",
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

export default function ExperienceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data: position, isLoading } = useQuery<Position>({
    queryKey: ["position", id],
    queryFn: async () => {
      const res = await fetch(`/api/current-position/${id}`);
      if (!res.ok) throw new Error("Position not found");
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch(`/api/current-position/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["position", id] });
      queryClient.invalidateQueries({ queryKey: ["current-position"] });
      queryClient.invalidateQueries({ queryKey: ["cfm"] });
      toast.success("Position updated!");
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/current-position/${id}`, { method: "DELETE" }).then((r) =>
        r.json()
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["current-position"] });
      queryClient.invalidateQueries({ queryKey: ["cfm"] });
      toast.success("Position removed");
      router.push("/experience");
    },
  });

  const resetForm = () => {
    setForm(emptyForm);
    setShowForm(false);
  };

  const openEdit = () => {
    if (!position) return;
    setForm({
      company: position.company,
      role: position.role,
      department: position.department || "",
      location: position.location || "",
      type: position.type,
      startDate: position.startDate ? format(new Date(position.startDate), "yyyy-MM-dd") : "",
      endDate: position.endDate ? format(new Date(position.endDate), "yyyy-MM-dd") : "",
      salary: position.salary?.toString() || "",
      currency: position.currency,
      description: position.description || "",
      responsibilities: position.responsibilities || "",
      techStack: position.techStack || "",
      managerName: position.managerName || "",
      ein: position.ein || "",
      legalName: position.legalName || "",
      companySynopsis: position.companySynopsis || "",
      companyClosed: !!position.companyClosed,
      locationClosed: !!position.locationClosed,
      industry: position.industry || "",
      website: position.website || "",
      address: position.address || "",
      focus: position.focus || "",
      schedule: position.schedule || "",
      payRate: position.payRate || "",
      payType: position.payType || "salary",
      differentials: position.differentials || "",
      payFrequency: position.payFrequency || "biweekly",
      rotatingSchedule: position.rotatingSchedule ?? false,
      hoursPerWeek: position.hoursPerWeek?.toString() || "",
      scheduleBHours: position.scheduleBHours?.toString() || "",
      otHoursA: position.otHoursA?.toString() || "",
      otHoursB: position.otHoursB?.toString() || "",
      otRate: position.otRate?.toString() || "1.5",
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      salary: form.salary ? parseInt(form.salary) : null,
      endDate: form.endDate || null,
      hoursPerWeek: form.hoursPerWeek ? parseFloat(form.hoursPerWeek) : null,
      scheduleBHours: form.scheduleBHours ? parseFloat(form.scheduleBHours) : null,
      otHoursA: form.otHoursA ? parseFloat(form.otHoursA) : null,
      otHoursB: form.otHoursB ? parseFloat(form.otHoursB) : null,
      otRate: form.otRate ? parseFloat(form.otRate) : null,
    };
    updateMutation.mutate(payload);
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
      setForm((prev) => ({
        ...prev,
        company: prev.company || data.company || "",
        companySynopsis: prev.companySynopsis || data.companySynopsis || "",
        ein: prev.ein || data.ein || "",
        legalName: prev.legalName || data.legalName || "",
        industry: prev.industry || data.industry || "",
      }));
      toast.success("Company details auto-filled!"  + (data.ein ? " (EIN found via SEC)" : ""));
    } catch {
      toast.error("Could not reach the website");
    } finally {
      setIsLookingUp(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (!position) {
    return (
      <div className="space-y-4">
        <Link href="/experience" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          Back to Experience
        </Link>
        <Card>
          <CardContent className="py-16 text-center">
            <h2 className="text-lg font-semibold">Position Not Found</h2>
            <p className="text-sm text-muted-foreground mt-1">This position may have been removed.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pos = position;
  const TypeIcon = TYPE_ICON[pos.type] || Monitor;
  const tenure = formatDistanceToNow(new Date(pos.startDate));
  const responsibilities = pos.responsibilities?.split("\n").filter(Boolean) ?? [];
  const techItems = pos.techStack?.split(",").map((t) => t.trim()).filter(Boolean) ?? [];
  const bannerGradient = pos.isActive
    ? "from-emerald-600 via-teal-500 to-cyan-500"
    : "from-slate-600 via-slate-500 to-slate-400";

  return (
    <div className="space-y-4">
      {/* Back Link */}
      <Link href="/experience" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" />
        Back to Experience
      </Link>

      {/* ── Position Header Card ── */}
      <Card className="overflow-hidden pt-0">
        <div className={`h-36 ${pos.coverImage ? '' : `bg-gradient-to-r ${bannerGradient}`} relative`}>
          {pos.coverImage && (
            <img
              src={pos.coverImage}
              alt={`${pos.company} cover`}
              className="w-full h-full object-cover"
            />
          )}
          <div className="absolute top-3 right-3 flex gap-2">
            <label
              className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm cursor-pointer transition-colors"
            >
              <ImagePlus className="h-3.5 w-3.5" />
              {pos.coverImage ? 'Change' : 'Cover'}
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
                    updateMutation.mutate({ coverImage: reader.result as string });
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </label>
            {pos.coverImage && (
              <Button
                size="sm"
                variant="secondary"
                className="bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm"
                onClick={() => updateMutation.mutate({ coverImage: null })}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Remove
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              className="bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm"
              onClick={openEdit}
            >
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
          </div>
        </div>

        <CardContent className="relative px-6 pb-6 pt-0">
          <div className="-mt-14 mb-4 flex items-end gap-4">
            <div className={`flex h-24 w-24 items-center justify-center rounded-2xl border-4 border-background bg-white text-2xl font-bold shadow-md ${
              pos.isActive ? "text-emerald-600" : "text-slate-500"
            }`}>
              {pos.company.slice(0, 2).toUpperCase()}
            </div>
            <div className="mb-1 flex flex-wrap gap-2">
              <Badge className={pos.isActive
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-100 text-slate-600"
              }>
                {pos.isActive ? "Active" : "Previous"}
              </Badge>
              <Badge variant="outline" className="capitalize gap-1">
                <TypeIcon className="h-3 w-3" />
                {pos.type}
              </Badge>
              {pos.companyClosed && (
                <Badge variant="outline" className="gap-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600" title="Company is no longer in operation">
                  <XCircle className="h-3 w-3" />
                  Company Closed
                </Badge>
              )}
              {!pos.companyClosed && pos.locationClosed && (
                <Badge variant="outline" className="gap-1 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700/60" title="This location/branch is closed (company is still operating)">
                  <XCircle className="h-3 w-3" />
                  Location Closed
                </Badge>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <h1 className="text-2xl font-bold">{pos.company}</h1>
            <p className="text-lg text-muted-foreground">{pos.role}</p>
            {pos.industry && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Factory className="h-3.5 w-3.5" />
                {pos.industry}
              </p>
            )}
            {pos.companySynopsis && (
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                {pos.companySynopsis}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
              {pos.department && (
                <span className="flex items-center gap-1">
                  <Briefcase className="h-3.5 w-3.5" />
                  {pos.department}
                </span>
              )}
              {pos.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {pos.location}
                </span>
              )}
              {pos.website && (
                <a
                  href={pos.website.startsWith("http") ? pos.website : `https://${pos.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-orange-600 hover:underline"
                >
                  <Globe className="h-3.5 w-3.5" />
                  {pos.website.replace(/^https?:\/\//, "")}
                </a>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {format(new Date(pos.startDate), "MMM yyyy")}
                {pos.endDate
                  ? ` — ${format(new Date(pos.endDate), "MMM yyyy")}`
                  : ` — Present (${tenure})`}
              </span>
            </div>
          </div>

          {/* Quick Facts */}
          <div className="mt-5 flex flex-wrap gap-3">
            {pos.salary && (
              <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm">
                <DollarSign className="h-4 w-4 text-green-600" />
                <span className="font-semibold">{pos.currency} {pos.salary.toLocaleString()}</span>
                <span className="text-muted-foreground">/ year</span>
              </div>
            )}
            {pos.payRate && (
              <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm">
                <DollarSign className="h-4 w-4 text-green-600" />
                <span className="font-semibold">{pos.payRate}</span>
                <span className="text-muted-foreground capitalize">/ {pos.payType === "hourly" ? "hr base" : pos.payType}</span>
              </div>
            )}
            {pos.payType === "hourly" && pos.differentials && (
              <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm">
                <Layers className="h-4 w-4 text-amber-600" />
                <span className="font-semibold">{pos.differentials.split("\n").filter(Boolean).length}</span>
                <span className="text-muted-foreground">differentials</span>
              </div>
            )}
            {pos.schedule && (
              <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm">
                <ClockArrowUp className="h-4 w-4 text-orange-600" />
                <span className="font-semibold">{pos.schedule}</span>
              </div>
            )}
            {pos.rotatingSchedule && (
              <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm">
                <RefreshCw className="h-4 w-4 text-indigo-600" />
                <span className="font-semibold">Rotating</span>
                <span className="text-muted-foreground">
                  {pos.hoursPerWeek && pos.scheduleBHours
                    ? `${pos.hoursPerWeek}/${pos.scheduleBHours} hrs`
                    : "schedule"}
                </span>
              </div>
            )}
            {pos.managerName && (
              <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm">
                <User className="h-4 w-4 text-orange-600" />
                <span className="text-muted-foreground">Reports to</span>
                <span className="font-semibold">{pos.managerName}</span>
              </div>
            )}
            {techItems.length > 0 && (
              <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm">
                <Code2 className="h-4 w-4 text-purple-600" />
                <span className="font-semibold">{techItems.length}</span>
                <span className="text-muted-foreground">tools</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Tabbed Sections ── */}
      <Tabs defaultValue="profile">
        <TabsList variant="line" className="w-full justify-start">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="compensation">Compensation</TabsTrigger>
          <TabsTrigger value="benefits">Benefits</TabsTrigger>
          <TabsTrigger value="timeoff">Time Off</TabsTrigger>
          <TabsTrigger value="worklog">Worklog</TabsTrigger>
          {pos.ein && <TabsTrigger value="intel">Company Intel</TabsTrigger>}
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Main Column */}
            <div className="lg:col-span-2 space-y-4">
              {pos.focus && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Focus
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                      {pos.focus}
                    </p>
                  </CardContent>
                </Card>
              )}

              {pos.description && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">About the Role</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                      {pos.description}
                    </p>
                  </CardContent>
                </Card>
              )}

              {responsibilities.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Layers className="h-4 w-4" />
                      Key Responsibilities
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2.5">
                      {responsibilities.map((r, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm">
                          <ChevronRight className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                          <span className="text-muted-foreground">{r.trim()}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Minimal content card for W-2-imported positions with little data */}
              {!pos.focus && !pos.description && responsibilities.length === 0 && techItems.length === 0 && (
                <Card>
                  <CardContent className="py-8 text-center">
                    <p className="text-sm text-muted-foreground">
                      No detailed profile information yet.
                    </p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={openEdit}>
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Add Details
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {techItems.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Code2 className="h-4 w-4" />
                      Tools & Technologies
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
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
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Company</span>
                    <span className="font-medium">{pos.company}</span>
                  </div>
                  {pos.ein && (
                    <>
                      <Separator />
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">EIN</span>
                        <span className="font-medium font-mono">{pos.ein}</span>
                      </div>
                    </>
                  )}
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Title</span>
                    <span className="font-medium">{pos.role}</span>
                  </div>
                  {pos.department && (
                    <>
                      <Separator />
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Department</span>
                        <span className="font-medium">{pos.department}</span>
                      </div>
                    </>
                  )}
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Work Type</span>
                    <span className="font-medium capitalize">{pos.type}</span>
                  </div>
                  {pos.location && (
                    <>
                      <Separator />
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Location</span>
                        <span className="font-medium">{pos.location}</span>
                      </div>
                    </>
                  )}
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Started</span>
                    <span className="font-medium">{format(new Date(pos.startDate), "MMM d, yyyy")}</span>
                  </div>
                  {pos.endDate && (
                    <>
                      <Separator />
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Ended</span>
                        <span className="font-medium">{format(new Date(pos.endDate), "MMM d, yyyy")}</span>
                      </div>
                    </>
                  )}
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{pos.isActive ? "Tenure" : "Duration"}</span>
                    <span className="font-medium">{tenure}</span>
                  </div>
                  {pos.salary && (
                    <>
                      <Separator />
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Compensation</span>
                        <span className="font-medium">{pos.currency} {pos.salary.toLocaleString()}/yr</span>
                      </div>
                    </>
                  )}
                  {pos.payRate && (
                    <>
                      <Separator />
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{pos.payType === "hourly" ? "Base Rate" : "Pay Rate"}</span>
                        <span className="font-medium">{pos.payRate}{pos.payType === "hourly" ? "/hr" : ""}</span>
                      </div>
                    </>
                  )}
                  {pos.payType === "hourly" && pos.differentials && (
                    <>
                      <Separator />
                      <div>
                        <span className="text-muted-foreground text-sm">Differentials</span>
                        <div className="mt-1 space-y-1">
                          {pos.differentials.split("\n").filter(Boolean).map((d, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-sm">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                              <span className="font-medium">{d}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                  {pos.schedule && (
                    <>
                      <Separator />
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Schedule</span>
                        <span className="font-medium">{pos.schedule}</span>
                      </div>
                    </>
                  )}
                  {pos.industry && (
                    <>
                      <Separator />
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Industry</span>
                        <span className="font-medium">{pos.industry}</span>
                      </div>
                    </>
                  )}
                  {pos.website && (
                    <>
                      <Separator />
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Website</span>
                        <a
                          href={pos.website.startsWith("http") ? pos.website : `https://${pos.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-orange-600 hover:underline truncate max-w-[180px]"
                        >
                          {pos.website.replace(/^https?:\/\//, "")}
                        </a>
                      </div>
                    </>
                  )}
                  {pos.address && (
                    <>
                      <Separator />
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Address</span>
                        <span className="font-medium text-right max-w-[180px]">{pos.address}</span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Actions */}
              <WorkHistoryShiftManager positionId={pos.id} />

              {/* Actions */}
              <Card>
                <CardContent className="p-4 flex flex-col gap-2">
                  <Button variant="outline" className="w-full justify-start" onClick={openEdit}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit Position
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => deleteMutation.mutate()}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove Position
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="compensation" className="mt-4">
          <CompensationTracker
            positionId={pos.id}
            payType={pos.payType}
            payRate={pos.payRate}
            differentials={pos.differentials}
            salary={pos.salary}
            schedule={pos.schedule}
            payFrequency={pos.payFrequency}
            rotatingSchedule={pos.rotatingSchedule}
            hoursPerWeek={pos.hoursPerWeek}
            scheduleBHours={pos.scheduleBHours}
            otHoursA={pos.otHoursA}
            otHoursB={pos.otHoursB}
            otRate={pos.otRate}
            annualRaiseMin={pos.annualRaiseMin}
            annualRaiseMax={pos.annualRaiseMax}
            estimatorSettings={pos.estimatorSettings}
          />
        </TabsContent>

        <TabsContent value="benefits" className="mt-4">
          <BenefitsTracker positionId={pos.id} />
        </TabsContent>

        <TabsContent value="timeoff" className="mt-4">
          <TimeOffTracker positionId={pos.id} />
        </TabsContent>

        <TabsContent value="worklog" className="mt-4">
          <PositionWorklogTab positionId={pos.id} />
        </TabsContent>

        {pos.ein && (
          <TabsContent value="intel" className="mt-4">
            <CompanyIntel ein={pos.ein} companyName={pos.company} legalName={pos.legalName || undefined} location={pos.location || undefined} />
          </TabsContent>
        )}
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Position</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
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
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                <Label className="mb-1">End Date</Label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
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
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                  {isLookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lookup"}
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

            {/* Job Details */}
            <Separator />
            <p className="text-sm font-semibold text-muted-foreground">Job Details</p>
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
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                    </div>
                  );
                })()}
              </>
            )}

            {/* Salary Estimator */}
            {form.payType === "hourly" && form.payRate && form.hoursPerWeek && (
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3">
                {(() => {
                  const rate = parseFloat(form.payRate.replace(/[^0-9.]/g, "")) || 0;
                  const hrsA = parseFloat(form.hoursPerWeek) || 0;
                  const hrsB = parseFloat(form.scheduleBHours) || 0;
                  const weeksPerYear = 52;
                  const diffLines = form.differentials.split("\n").filter(Boolean);
                  const parseDiff = (d: string) => {
                    const m = d.match(/[+-]?\$?([\d.]+)/);
                    return m ? parseFloat(m[1]) : 0;
                  };
                  const totalDiffPerHr = diffLines.reduce((sum, d) => sum + parseDiff(d), 0);
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
                          <span>Base Pay</span>
                          <span className="font-mono">${basePay.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        </div>
                        {otPay > 0 && (
                          <div className="flex justify-between text-orange-700 dark:text-orange-400">
                            <span>Overtime ({otMult}×)</span>
                            <span className="font-mono">+${otPay.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                          </div>
                        )}
                        {diffPay > 0 && (
                          <div className="flex justify-between text-amber-700 dark:text-amber-400">
                            <span>Differentials</span>
                            <span className="font-mono">+${diffPay.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                          </div>
                        )}
                      </div>
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
            <div className="flex gap-2 pt-2">
              <Button type="submit" className="flex-1">
                Save Changes
              </Button>
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
