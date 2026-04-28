"use client";

import { useState, useEffect, useRef, useCallback } from "react";

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
  ShieldCheck,
  Eye,
  EyeOff,
  Lock,
  Plus,
  Trash2,
  Clock,
  UserX,
  Car,
  Home,
  Fuel,
  CalendarDays,
} from "lucide-react";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
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
  // Stealth mode
  visibility: string;
  hideCurrentEmployer: boolean;
  anonymousTitle: string | null;
  blockedEins: string | null;
  blockedDomains: string | null;
  // Home address
  homeAddress: string | null;
  homeLat: number | null;
  homeLng: number | null;
  // Vehicle / commute
  vehicleYear: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleId: string | null;
  vehicleMpg: number | null;
  gasPricePerGallon: number | null;
  daysInOffice: number | null;
}

export default function PortalSettingsPage() {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Vehicle picker cascading state ── */
  const [carYears, setCarYears] = useState<{ text: string; value: string }[]>([]);
  const [carMakes, setCarMakes] = useState<{ text: string; value: string }[]>([]);
  const [carModels, setCarModels] = useState<{ text: string; value: string }[]>([]);
  const [carOptions, setCarOptions] = useState<{ text: string; value: string }[]>([]);
  const [carLoading, setCarLoading] = useState(false);
  const [showCarPicker, setShowCarPicker] = useState(false);
  const [geocodingAddress, setGeocodingAddress] = useState(false);

  const fetchVehicleMenu = useCallback(async (action: string, params?: Record<string, string>) => {
    const sp = new URLSearchParams({ action, ...params });
    const res = await fetch(`/api/vehicle-lookup?${sp}`);
    if (!res.ok) return [];
    const data = await res.json();
    const items = data.menuItem;
    if (!items) return [];
    return Array.isArray(items) ? items : [items];
  }, []);

  // Load years when car picker opens
  useEffect(() => {
    if (!showCarPicker || carYears.length > 0) return;
    fetchVehicleMenu("years").then(setCarYears);
  }, [showCarPicker, carYears.length, fetchVehicleMenu]);

  // Geocode home address
  const geocodeHome = useCallback(async (address: string) => {
    if (!address) return;
    setGeocodingAddress(true);
    try {
      const res = await fetch(`/api/resolve-address?address=${encodeURIComponent(address)}&mode=geocode`);
      if (res.ok) {
        const data = await res.json();
        if (data.lat && data.lng) {
          setForm((f) => ({ ...f, homeAddress: address, homeLat: data.lat, homeLng: data.lng }));
          return;
        }
      }
    } finally {
      setGeocodingAddress(false);
    }
  }, []);

  // Auto-fill MPG when vehicle option is selected
  const handleCarOptionSelect = useCallback(async (optionId: string) => {
    if (!optionId) return;
    setCarLoading(true);
    try {
      const [vehRes, priceRes] = await Promise.all([
        fetch(`/api/vehicle-lookup?action=vehicle&id=${optionId}`),
        fetch(`/api/vehicle-lookup?action=fuelprices`),
      ]);
      const veh = vehRes.ok ? await vehRes.json() : null;
      const prices = priceRes.ok ? await priceRes.json() : null;
      if (veh) {
        const mpg = veh.comb08 || veh.highway08 || veh.city08 || 27.5;
        setForm((f) => ({
          ...f,
          vehicleId: optionId,
          vehicleMpg: String(mpg),
        }));
        if (prices?.regular) {
          const fuelType = (veh.fuelType || "").toLowerCase();
          let price = parseFloat(prices.regular);
          if (fuelType.includes("premium")) price = parseFloat(prices.premium) || price;
          else if (fuelType.includes("diesel")) price = parseFloat(prices.diesel) || price;
          if (price > 0) setForm((f) => ({ ...f, gasPricePerGallon: String(Math.round(price * 100) / 100) }));
        }
      }
    } finally {
      setCarLoading(false);
    }
  }, []);

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
    // Stealth mode
    visibility: "public",
    hideCurrentEmployer: false,
    anonymousTitle: "",
    blockedDomains: "",
    // Home address
    homeAddress: "",
    homeLat: null as number | null,
    homeLng: null as number | null,
    // Vehicle / commute
    vehicleYear: "",
    vehicleMake: "",
    vehicleModel: "",
    vehicleId: "",
    vehicleMpg: "",
    gasPricePerGallon: "3.50",
    daysInOffice: "5",
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
        // Stealth mode
        visibility: profile.visibility || "public",
        hideCurrentEmployer: profile.hideCurrentEmployer,
        anonymousTitle: profile.anonymousTitle || "",
        blockedDomains: profile.blockedDomains
          ? JSON.parse(profile.blockedDomains).join(", ")
          : "",
        // Home address
        homeAddress: profile.homeAddress || "",
        homeLat: profile.homeLat,
        homeLng: profile.homeLng,
        // Vehicle / commute
        vehicleYear: profile.vehicleYear || "",
        vehicleMake: profile.vehicleMake || "",
        vehicleModel: profile.vehicleModel || "",
        vehicleId: profile.vehicleId || "",
        vehicleMpg: profile.vehicleMpg?.toString() || "",
        gasPricePerGallon: profile.gasPricePerGallon?.toString() || "3.50",
        daysInOffice: profile.daysInOffice?.toString() || "5",
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
    const blockedDomainsArray = form.blockedDomains
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);

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
      // Stealth mode
      visibility: form.visibility,
      hideCurrentEmployer: form.hideCurrentEmployer,
      anonymousTitle: form.anonymousTitle || null,
      blockedDomains: blockedDomainsArray.length > 0 ? JSON.stringify(blockedDomainsArray) : null,
      // Home address
      homeAddress: form.homeAddress || null,
      homeLat: form.homeLat,
      homeLng: form.homeLng,
      // Vehicle / commute
      vehicleYear: form.vehicleYear || null,
      vehicleMake: form.vehicleMake || null,
      vehicleModel: form.vehicleModel || null,
      vehicleId: form.vehicleId || null,
      vehicleMpg: form.vehicleMpg ? parseFloat(form.vehicleMpg) : null,
      gasPricePerGallon: form.gasPricePerGallon ? parseFloat(form.gasPricePerGallon) : null,
      daysInOffice: form.daysInOffice ? parseInt(form.daysInOffice) : null,
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

      {/* ── Stealth Mode ── */}
      <Card className="border-indigo-200 dark:border-indigo-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-indigo-500" />
            Stealth Mode
          </CardTitle>
          <p className="text-sm text-gray-500">
            Control your identity on public resume links. Stay anonymous until you find a recruiter you trust.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Visibility Level */}
          <div>
            <Label className="mb-2 block text-sm font-medium">Profile Visibility</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { value: "public", label: "Public", icon: Globe, desc: "Everything visible" },
                { value: "stealth", label: "Stealth", icon: EyeOff, desc: "Name hidden, skills shown" },
                { value: "anonymous", label: "Anonymous", icon: UserX, desc: "Fully redacted" },
                { value: "private", label: "Private", icon: Lock, desc: "Link disabled" },
              ].map(({ value, label, icon: Icon, desc }) => (
                <button
                  key={value}
                  onClick={() => setForm({ ...form, visibility: value })}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    form.visibility === value
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-400"
                  }`}
                >
                  <Icon className={`h-5 w-5 mb-1 ${form.visibility === value ? "text-indigo-500" : "text-gray-400"}`} />
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Anonymous Display Name */}
          {(form.visibility === "stealth" || form.visibility === "anonymous") && (
            <div>
              <Label className="mb-1">Anonymous Display Name</Label>
              <Input
                placeholder='e.g. "Verified Electro-Mechanical Specialist #842"'
                value={form.anonymousTitle}
                onChange={(e) => setForm({ ...form, anonymousTitle: e.target.value })}
              />
              <p className="text-xs text-gray-500 mt-1">
                This replaces your real name on stealth/anonymous profiles. Leave blank for auto-generated.
              </p>
            </div>
          )}

          {/* Hide Current Employer */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Hide Current Employer</Label>
              <p className="text-xs text-gray-500">
                Replace your current company name with &quot;Current Employer&quot; on public profiles
              </p>
            </div>
            <Switch
              checked={form.hideCurrentEmployer}
              onCheckedChange={(checked) => setForm({ ...form, hideCurrentEmployer: checked })}
            />
          </div>

          <Separator />

          {/* Blocked Domains (Boss Blocking) */}
          <div>
            <Label className="mb-1 flex items-center gap-1.5">
              <EyeOff className="h-3.5 w-3.5" /> Blocked Email Domains
            </Label>
            <Input
              placeholder="siemens.com, abb.com, employer.com"
              value={form.blockedDomains}
              onChange={(e) => setForm({ ...form, blockedDomains: e.target.value })}
            />
            <p className="text-xs text-gray-500 mt-1">
              Access requests from these email domains will be silently blocked. Comma-separated.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── My Commute & Vehicle ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" /> My Commute
          </CardTitle>
          <p className="text-sm text-gray-500">
            Set your home address, vehicle, and commute defaults. These are used automatically in the job map.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Home Address */}
          <div>
            <Label className="mb-1 flex items-center gap-1.5">
              <Home className="h-3.5 w-3.5" /> Home Address
            </Label>
            <PlacesAutocomplete
              value={form.homeAddress}
              onChange={(v) => {
                setForm({ ...form, homeAddress: v, homeLat: null, homeLng: null });
              }}
              onSelect={(address) => geocodeHome(address)}
              placeholder="Enter your home address"
              types={["address"]}
            />
            {geocodingAddress && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Resolving address...</p>
            )}
            {form.homeLat && form.homeLng && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Location resolved ({form.homeLat.toFixed(4)}, {form.homeLng.toFixed(4)})
              </p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Used as default search center in the job map. Your address is never shared with employers.
            </p>
          </div>

          <Separator />

          {/* Vehicle */}
          <div>
            <Label className="mb-1 flex items-center gap-1.5">
              <Car className="h-3.5 w-3.5" /> My Vehicle
            </Label>
            {form.vehicleYear && form.vehicleMake && form.vehicleModel && !showCarPicker ? (
              <div className="flex items-center justify-between rounded-md border p-3 bg-muted/30">
                <div>
                  <p className="text-sm font-medium">{form.vehicleYear} {form.vehicleMake} {form.vehicleModel}</p>
                  {form.vehicleMpg && <p className="text-xs text-muted-foreground">EPA Combined: {form.vehicleMpg} MPG</p>}
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowCarPicker(true)}>Change</Button>
              </div>
            ) : (
              <div className="space-y-2 rounded-md border p-3 bg-muted/30">
                <Select
                  value={form.vehicleYear}
                  onValueChange={(v) => {
                    setForm((f) => ({ ...f, vehicleYear: v ?? "", vehicleMake: "", vehicleModel: "", vehicleId: "" }));
                    setCarMakes([]); setCarModels([]); setCarOptions([]);
                    if (v) fetchVehicleMenu("makes", { year: v }).then(setCarMakes);
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
                  <SelectContent className="max-h-48">
                    {carYears.map((y) => <SelectItem key={y.value} value={y.value}>{y.text}</SelectItem>)}
                  </SelectContent>
                </Select>
                {form.vehicleYear && (
                  <Select
                    value={form.vehicleMake}
                    onValueChange={(v) => {
                      setForm((f) => ({ ...f, vehicleMake: v ?? "", vehicleModel: "", vehicleId: "" }));
                      setCarModels([]); setCarOptions([]);
                      if (v) fetchVehicleMenu("models", { year: form.vehicleYear, make: v }).then(setCarModels);
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Make" /></SelectTrigger>
                    <SelectContent className="max-h-48">
                      {carMakes.map((m) => <SelectItem key={m.value} value={m.value}>{m.text}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {form.vehicleYear && form.vehicleMake && (
                  <Select
                    value={form.vehicleModel}
                    onValueChange={(v) => {
                      setForm((f) => ({ ...f, vehicleModel: v ?? "", vehicleId: "" }));
                      setCarOptions([]);
                      if (v) fetchVehicleMenu("options", { year: form.vehicleYear, make: form.vehicleMake, model: v }).then((opts) => {
                        setCarOptions(opts);
                        if (opts.length === 1) {
                          setForm((f) => ({ ...f, vehicleId: opts[0].value }));
                          handleCarOptionSelect(opts[0].value);
                        }
                      });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Model" /></SelectTrigger>
                    <SelectContent className="max-h-48">
                      {carModels.map((m) => <SelectItem key={m.value} value={m.value}>{m.text}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {form.vehicleYear && form.vehicleMake && form.vehicleModel && carOptions.length > 1 && (
                  <Select
                    value={form.vehicleId}
                    onValueChange={(v) => {
                      setForm((f) => ({ ...f, vehicleId: v ?? "" }));
                      if (v) handleCarOptionSelect(v);
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Trim / Engine" /></SelectTrigger>
                    <SelectContent className="max-h-48">
                      {carOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.text}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {carLoading && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Loading EPA data...</p>}
                {showCarPicker && (
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowCarPicker(false)}>Cancel</Button>
                )}
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Vehicle data powered by EPA/FuelEconomy.gov. MPG and gas prices auto-fill from EPA records.
            </p>
          </div>

          <Separator />

          {/* Commute Defaults */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="mb-1 flex items-center gap-1.5">
                <Fuel className="h-3.5 w-3.5" /> Gas $/gal
              </Label>
              <Input
                type="number" step="0.10" min="1" max="10"
                value={form.gasPricePerGallon}
                onChange={(e) => setForm({ ...form, gasPricePerGallon: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1">Vehicle MPG</Label>
              <Input
                type="number" step="0.5" min="5" max="150"
                value={form.vehicleMpg}
                onChange={(e) => setForm({ ...form, vehicleMpg: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1 flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" /> Days/week
              </Label>
              <Input
                type="number" step="1" min="1" max="7"
                value={form.daysInOffice}
                onChange={(e) => setForm({ ...form, daysInOffice: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Single-Use Links ── */}
      <SingleUseLinksManager />

      {/* ── Access Requests ── */}
      <AccessRequestsManager />
    </div>
  );
}

/* ── Single-Use Links Manager ── */
function SingleUseLinksManager() {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("7");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  interface SingleUseLink {
    id: string;
    token: string;
    label: string | null;
    viewedAt: string | null;
    viewedBy: string | null;
    expiresAt: string;
    createdAt: string;
  }

  const { data: links = [] } = useQuery<SingleUseLink[]>({
    queryKey: ["single-use-links"],
    queryFn: () => fetch("/api/single-use-links").then((r) => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (data: { label: string; expiresInDays: number }) =>
      fetch("/api/single-use-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["single-use-links"] });
      setLabel("");
      toast.success("Single-use link created!");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/single-use-links/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["single-use-links"] });
      toast.success("Link revoked");
    },
  });

  const copyLink = (token: string, id: string) => {
    const url = `${window.location.origin}/r/portal?token=${token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    toast.success("Link copied!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Single-Use Links
        </CardTitle>
        <p className="text-sm text-gray-500">
          Generate &quot;burn after reading&quot; links that expire after one view. Perfect for sharing with specific recruiters.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Create new link */}
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label className="mb-1 text-xs">Label (optional)</Label>
            <Input
              placeholder='e.g. "For Recruiter at ABB"'
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="w-24">
            <Label className="mb-1 text-xs">Expires</Label>
            <Select value={expiresInDays} onValueChange={(v) => setExpiresInDays(v ?? "7")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 day</SelectItem>
                <SelectItem value="3">3 days</SelectItem>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => createMutation.mutate({ label, expiresInDays: parseInt(expiresInDays) })}
            disabled={createMutation.isPending}
            size="sm"
          >
            <Plus className="h-4 w-4 mr-1" />
            Generate
          </Button>
        </div>

        {/* Links list */}
        {links.length > 0 && (
          <div className="space-y-2 mt-4">
            {links.map((link) => {
              const expired = new Date(link.expiresAt) < new Date();
              const used = !!link.viewedAt;
              return (
                <div
                  key={link.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    used || expired
                      ? "border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 opacity-60"
                      : "border-gray-200 dark:border-gray-800"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {link.label || "Untitled link"}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {used ? (
                        <Badge variant="secondary" className="text-xs">
                          <Eye className="h-3 w-3 mr-1" /> Viewed
                        </Badge>
                      ) : expired ? (
                        <Badge variant="destructive" className="text-xs">
                          <Clock className="h-3 w-3 mr-1" /> Expired
                        </Badge>
                      ) : (
                        <Badge className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Active
                        </Badge>
                      )}
                      <span className="text-xs text-gray-400">
                        Expires {new Date(link.expiresAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  {!used && !expired && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyLink(link.token, link.id)}
                    >
                      {copiedId === link.id ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteMutation.mutate(link.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {links.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">
            No single-use links created yet. Generate one to share with a specific recruiter.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Access Requests Manager ── */
const SECTION_KEYS = [
  { value: "summary", label: "Summary" },
  { value: "experience", label: "Experience" },
  { value: "skills", label: "Skills" },
  { value: "certifications", label: "Certifications" },
  { value: "contact", label: "Contact" },
];

function PendingAccessRow({
  req,
  onApprove,
  onDeny,
  disabled,
}: {
  req: {
    id: string;
    requesterName: string;
    requesterEmail: string;
    requesterCompany: string | null;
    requesterLinkedin: string | null;
    message: string | null;
    createdAt: string;
  };
  onApprove: (targetRole: string, focusSections: string[]) => void;
  onDeny: () => void;
  disabled: boolean;
}) {
  const [showCustomize, setShowCustomize] = useState(false);
  const [targetRole, setTargetRole] = useState("");
  const [focus, setFocus] = useState<string[]>([]);

  const toggleFocus = (key: string) => {
    setFocus((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  return (
    <div className="p-4 rounded-lg border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/30">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium">{req.requesterName}</p>
          <p className="text-sm text-gray-500">{req.requesterEmail}</p>
          {req.requesterCompany && (
            <p className="text-sm text-gray-500">@ {req.requesterCompany}</p>
          )}
          {req.requesterLinkedin && (
            <a
              href={req.requesterLinkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-indigo-500 hover:underline"
            >
              LinkedIn Profile
            </a>
          )}
          {req.message && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 italic">
              &quot;{req.message}&quot;
            </p>
          )}
          <p className="text-xs text-gray-400 mt-1">
            {new Date(req.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            size="sm"
            onClick={() => onApprove(targetRole.trim(), focus)}
            disabled={disabled}
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            Approve
          </Button>
          <Button size="sm" variant="outline" onClick={onDeny} disabled={disabled}>
            Deny
          </Button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowCustomize((s) => !s)}
        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline mt-3"
      >
        {showCustomize ? "Hide" : "Customize for this recruiter"} ▾
      </button>

      {showCustomize && (
        <div className="mt-3 space-y-3 border-t border-indigo-200 dark:border-indigo-800 pt-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
              Tailored target role (optional)
            </label>
            <input
              type="text"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              placeholder="e.g. Senior React Engineer"
              className="w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
              Highlight sections
            </label>
            <div className="flex flex-wrap gap-1.5">
              {SECTION_KEYS.map((s) => {
                const active = focus.includes(s.value);
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => toggleFocus(s.value)}
                    className={`text-xs px-2 py-1 rounded-full border transition ${
                      active
                        ? "bg-amber-500 text-white border-amber-500"
                        : "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-amber-400"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AccessRequestsManager() {
  const queryClient = useQueryClient();

  interface AccessReq {
    id: string;
    requesterName: string;
    requesterEmail: string;
    requesterCompany: string | null;
    requesterLinkedin: string | null;
    message: string | null;
    status: string;
    approvedAt: string | null;
    accessToken: string | null;
    createdAt: string;
  }

  const { data: requests = [] } = useQuery<AccessReq[]>({
    queryKey: ["access-requests"],
    queryFn: () => fetch("/api/access-requests").then((r) => r.json()),
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, status, targetRole, focusSections }: { id: string; status: string; targetRole?: string; focusSections?: string[] }) =>
      fetch(`/api/access-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, targetRole, focusSections }),
      }).then((r) => r.json()),
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["access-requests"] });
      toast.success(status === "approved" ? "Access approved — magic link generated!" : "Request denied");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/access-requests/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-requests"] });
    },
  });

  const pending = requests.filter((r) => r.status === "pending");
  const resolved = requests.filter((r) => r.status !== "pending");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Access Requests
          {pending.length > 0 && (
            <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
              {pending.length} pending
            </Badge>
          )}
        </CardTitle>
        <p className="text-sm text-gray-500">
          Recruiters who want to see your full profile. Approve to generate a magic link.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {requests.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">
            No access requests yet. Requests will appear here when recruiters ask to view your protected profile.
          </p>
        )}

        {/* Pending first */}
        {pending.map((req) => (
          <PendingAccessRow
            key={req.id}
            req={req}
            onApprove={(targetRole, focusSections) =>
              actionMutation.mutate({ id: req.id, status: "approved", targetRole, focusSections })
            }
            onDeny={() => actionMutation.mutate({ id: req.id, status: "denied" })}
            disabled={actionMutation.isPending}
          />
        ))}

        {/* Resolved */}
        {resolved.map((req) => (
          <div
            key={req.id}
            className="p-3 rounded-lg border border-gray-200 dark:border-gray-800 flex items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{req.requesterName}</p>
              <p className="text-xs text-gray-500">{req.requesterEmail}</p>
            </div>
            <Badge variant={req.status === "approved" ? "default" : "secondary"}>
              {req.status === "approved" ? "Approved" : "Denied"}
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => deleteMutation.mutate(req.id)}
            >
              <Trash2 className="h-3.5 w-3.5 text-red-500" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
