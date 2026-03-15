"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";
import {
  AVAILABILITY_LABELS,
  AVAILABILITY_COLORS,
  type AvailabilityStatus,
} from "@/lib/constants";

interface UserProfile {
  id: string;
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

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["profile"],
    queryFn: () => fetch("/api/profile").then((r) => r.json()),
  });

  const [form, setForm] = useState({
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
      <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/50">
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
