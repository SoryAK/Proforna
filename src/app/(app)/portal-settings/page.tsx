"use client";

import { useState, useEffect, useRef } from "react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Globe,
  Save,
  ExternalLink,
  Copy,
  CheckCircle2,
  Camera,
  User,
  Mail,
  Phone,
  MapPin,
  Linkedin,
  Github,
  Link2,
  Loader2,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import {
  AVAILABILITY_LABELS,
  AVAILABILITY_COLORS,
  type AvailabilityStatus,
} from "@/lib/constants";

interface UserProfile {
  id: string;
  fullName: string | null;
  headline: string | null;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  city: string | null;
  state: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  availability: AvailabilityStatus;
  bio: string | null;
  preferredRoles: string | null;
  targetSalaryMin: number | null;
  targetSalaryMax: number | null;
  currency: string;
  locationPreference: string | null;
  showSkills: boolean;
  showResume: boolean;
  showCertifications: boolean;
  showCurrentRole: boolean;
  portalSlug: string;
}

export default function PortalSettingsPage() {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["profile"],
    queryFn: () => fetch("/api/profile").then((r) => r.json()),
  });

  const [form, setForm] = useState({
    fullName: "",
    headline: "",
    email: "",
    phone: "",
    city: "",
    state: "",
    linkedinUrl: "",
    githubUrl: "",
    portfolioUrl: "",
    availability: "open_to_work" as string,
    bio: "",
    preferredRoles: "",
    targetSalaryMin: "",
    targetSalaryMax: "",
    currency: "USD",
    locationPreference: "",
    showSkills: true,
    showResume: true,
    showCertifications: true,
    showCurrentRole: true,
  });

  useEffect(() => {
    if (profile) {
      setForm({
        fullName: profile.fullName || "",
        headline: profile.headline || "",
        email: profile.email || "",
        phone: profile.phone || "",
        city: profile.city || "",
        state: profile.state || "",
        linkedinUrl: profile.linkedinUrl || "",
        githubUrl: profile.githubUrl || "",
        portfolioUrl: profile.portfolioUrl || "",
        availability: profile.availability,
        bio: profile.bio || "",
        preferredRoles: profile.preferredRoles || "",
        targetSalaryMin: profile.targetSalaryMin?.toString() || "",
        targetSalaryMax: profile.targetSalaryMax?.toString() || "",
        currency: profile.currency,
        locationPreference: profile.locationPreference || "",
        showSkills: profile.showSkills,
        showResume: profile.showResume,
        showCertifications: profile.showCertifications,
        showCurrentRole: profile.showCurrentRole,
      });
    }
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["portal"] });
      toast.success("Portal settings saved!");
    },
    onError: () => {
      toast.error("Failed to save settings");
    },
  });

  const handleSave = () => {
    saveMutation.mutate({
      fullName: form.fullName || null,
      headline: form.headline || null,
      email: form.email || null,
      phone: form.phone || null,
      city: form.city || null,
      state: form.state || null,
      linkedinUrl: form.linkedinUrl || null,
      githubUrl: form.githubUrl || null,
      portfolioUrl: form.portfolioUrl || null,
      availability: form.availability,
      bio: form.bio || null,
      preferredRoles: form.preferredRoles || null,
      targetSalaryMin: form.targetSalaryMin ? parseInt(form.targetSalaryMin) : null,
      targetSalaryMax: form.targetSalaryMax ? parseInt(form.targetSalaryMax) : null,
      currency: form.currency,
      locationPreference: form.locationPreference || null,
      showSkills: form.showSkills,
      showResume: form.showResume,
      showCertifications: form.showCertifications,
      showCurrentRole: form.showCurrentRole,
    });
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("avatar", file);
      const res = await fetch("/api/avatar", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Profile picture updated!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const portalUrl = typeof window !== "undefined"
    ? `${window.location.origin}/portal`
    : "/portal";

  const copyLink = () => {
    navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    toast.success("Portal link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return <div className="text-center py-12 text-gray-500">Loading settings...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="h-6 w-6" />
            Portal Settings
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Configure your public recruiter portal and control what recruiters see.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? "Saving..." : "Save Settings"}
        </Button>
      </div>

      {/* Portal Link */}
      <Card className="border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/50">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium mb-1">Your Portal Link</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                {portalUrl}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={copyLink}>
              {copied ? (
                <CheckCircle2 className="h-4 w-4 mr-1 text-green-600" />
              ) : (
                <Copy className="h-4 w-4 mr-1" />
              )}
              {copied ? "Copied!" : "Copy"}
            </Button>
            <a
              href="/portal"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              Preview
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Profile Identity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Your Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar */}
          <div className="flex items-center gap-6">
            <div className="relative group">
              <div className="h-24 w-24 rounded-full border-2 border-muted overflow-hidden bg-muted flex items-center justify-center">
                {profile?.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt="Profile"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <User className="h-10 w-10 text-muted-foreground" />
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                {uploading ? (
                  <Loader2 className="h-5 w-5 text-white animate-spin" />
                ) : (
                  <Camera className="h-5 w-5 text-white" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Profile Picture</p>
              <p className="text-xs text-muted-foreground">JPG, PNG, WebP or GIF. Max 2 MB.</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-1"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? "Uploading..." : "Upload Photo"}
              </Button>
            </div>
          </div>

          <Separator />

          {/* Name & Headline */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" /> Full Name
              </Label>
              <Input
                placeholder="John Doe"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1">Professional Headline</Label>
              <Input
                placeholder="Senior Full-Stack Engineer"
                value={form.headline}
                onChange={(e) => setForm({ ...form, headline: e.target.value })}
              />
            </div>
          </div>

          {/* Contact */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1 flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> Email
              </Label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1 flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> Phone
              </Label>
              <Input
                type="tel"
                placeholder="(555) 123-4567"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>

          {/* Location */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> City
              </Label>
              <Input
                placeholder="San Francisco"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1">State / Region</Label>
              <Input
                placeholder="California"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
              />
            </div>
          </div>

          <Separator />

          {/* Links */}
          <div className="space-y-4">
            <p className="text-sm font-medium">Professional Links</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="mb-1 flex items-center gap-1.5">
                  <Linkedin className="h-3.5 w-3.5" /> LinkedIn
                </Label>
                <Input
                  placeholder="https://linkedin.com/in/yourname"
                  value={form.linkedinUrl}
                  onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1 flex items-center gap-1.5">
                  <Github className="h-3.5 w-3.5" /> GitHub
                </Label>
                <Input
                  placeholder="https://github.com/yourname"
                  value={form.githubUrl}
                  onChange={(e) => setForm({ ...form, githubUrl: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label className="mb-1 flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5" /> Portfolio / Website
              </Label>
              <Input
                placeholder="https://yoursite.com"
                value={form.portfolioUrl}
                onChange={(e) => setForm({ ...form, portfolioUrl: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Availability */}
      <Card>
        <CardHeader>
          <CardTitle>Availability Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {(Object.entries(AVAILABILITY_LABELS) as [AvailabilityStatus, string][]).map(
              ([value, label]) => (
                <button
                  key={value}
                  onClick={() => setForm({ ...form, availability: value })}
                  className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                    form.availability === value
                      ? `${AVAILABILITY_COLORS[value]} border-current`
                      : "border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-400"
                  }`}
                >
                  {label}
                </button>
              )
            )}
          </div>
        </CardContent>
      </Card>

      {/* Profile Info */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="mb-1">Bio / About</Label>
            <Textarea
              placeholder="A brief introduction about yourself, your experience, and what you're looking for..."
              rows={3}
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
            />
          </div>
          <div>
            <Label className="mb-1">Preferred Roles (comma-separated)</Label>
            <Input
              placeholder="Senior Frontend Engineer, Full Stack Developer, Tech Lead"
              value={form.preferredRoles}
              onChange={(e) => setForm({ ...form, preferredRoles: e.target.value })}
            />
          </div>
          <div>
            <Label className="mb-1">Location Preferences</Label>
            <Input
              placeholder="Remote, San Francisco, New York"
              value={form.locationPreference}
              onChange={(e) => setForm({ ...form, locationPreference: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
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
            <div>
              <Label className="mb-1">Salary Min</Label>
              <Input
                type="number"
                placeholder="100000"
                value={form.targetSalaryMin}
                onChange={(e) => setForm({ ...form, targetSalaryMin: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1">Salary Max</Label>
              <Input
                type="number"
                placeholder="200000"
                value={form.targetSalaryMax}
                onChange={(e) => setForm({ ...form, targetSalaryMax: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Visibility Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Portal Visibility</CardTitle>
          <p className="text-sm text-gray-500">
            Control what information recruiters can see on your portal.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Show Current Role</Label>
              <p className="text-xs text-gray-500">Display your current job on the portal</p>
            </div>
            <Switch
              checked={form.showCurrentRole}
              onCheckedChange={(checked) => setForm({ ...form, showCurrentRole: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Show Skills & Expertise</Label>
              <p className="text-xs text-gray-500">Display your skills with proficiency bars</p>
            </div>
            <Switch
              checked={form.showSkills}
              onCheckedChange={(checked) => setForm({ ...form, showSkills: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Show Resume Availability</Label>
              <p className="text-xs text-gray-500">Indicate that you have an active resume</p>
            </div>
            <Switch
              checked={form.showResume}
              onCheckedChange={(checked) => setForm({ ...form, showResume: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Show Certifications</Label>
              <p className="text-xs text-gray-500">Display your certifications and credentials</p>
            </div>
            <Switch
              checked={form.showCertifications}
              onCheckedChange={(checked) => setForm({ ...form, showCertifications: checked })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
