"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  GripVertical,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

type SectionConfig = {
  type: string;
  visible: boolean;
  order: number;
  settings?: Record<string, unknown>;
};

const DEFAULT_SECTIONS: SectionConfig[] = [
  { type: "summary", visible: true, order: 0 },
  { type: "experience", visible: true, order: 1 },
  { type: "skills", visible: true, order: 2 },
  { type: "certifications", visible: true, order: 3 },
  { type: "contact", visible: true, order: 4 },
];

const SECTION_LABELS: Record<string, string> = {
  summary: "Summary",
  experience: "Experience",
  skills: "Skills",
  certifications: "Certifications",
  contact: "Contact",
};

const THEMES = [
  { value: "modern", label: "Modern" },
  { value: "classic", label: "Classic" },
  { value: "minimal", label: "Minimal" },
];

interface ProfileData {
  fullName: string | null;
  irSlug: string | null;
  irTheme: string | null;
  irSections: string | null;
  irTargetRole: string | null;
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export default function AdaptiveIrEditor() {
  const qc = useQueryClient();
  const { data: profile, isLoading } = useQuery<ProfileData>({
    queryKey: ["profile"],
    queryFn: async () => {
      const res = await fetch("/api/profile");
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
  });

  // Local edit state
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [theme, setTheme] = useState("modern");
  const [targetRole, setTargetRole] = useState("");
  const [sections, setSections] = useState<SectionConfig[]>(DEFAULT_SECTIONS);

  // Hydrate when profile loads
  useEffect(() => {
    if (!profile) return;
    setSlug(profile.irSlug || (profile.fullName ? slugify(profile.fullName) : ""));
    setSlugTouched(!!profile.irSlug);
    setTheme(profile.irTheme || "modern");
    setTargetRole(profile.irTargetRole || "");
    if (profile.irSections) {
      try {
        const parsed = JSON.parse(profile.irSections);
        if (Array.isArray(parsed) && parsed.length) {
          setSections(parsed);
        }
      } catch {
        // ignore
      }
    }
  }, [profile]);

  // Auto-derive slug from fullName until user manually edits it
  const suggestedSlug = useMemo(
    () => (profile?.fullName ? slugify(profile.fullName) : ""),
    [profile?.fullName]
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        irSlug: slug || null,
        irTheme: theme,
        irTargetRole: targetRole || null,
        irSections: JSON.stringify(
          sections.map((s, i) => ({ ...s, order: i }))
        ),
      };
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Interactive Resume updated");
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const moveSection = (idx: number, dir: -1 | 1) => {
    setSections((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const toggleSection = (type: string, visible: boolean) => {
    setSections((prev) => prev.map((s) => (s.type === type ? { ...s, visible } : s)));
  };

  const publicUrl = slug
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/r/${slug}`
    : "";

  const copyLink = async () => {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    toast.success("Link copied");
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            Adaptive Interactive Resume
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Your single live resume. Update once — every shared link reflects the latest version.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Slug */}
          <div className="space-y-1">
            <Label htmlFor="ir-slug">Public URL</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground shrink-0">/r/</span>
              <Input
                id="ir-slug"
                value={slug}
                placeholder="your-name"
                onChange={(e) => {
                  setSlug(slugify(e.target.value));
                  setSlugTouched(true);
                }}
              />
              {!slugTouched && suggestedSlug && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSlug(suggestedSlug)}
                  title="Use suggested slug"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            {publicUrl && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                <span className="truncate">{publicUrl}</span>
                <Button type="button" size="sm" variant="ghost" onClick={copyLink} className="h-6 px-2">
                  <Copy className="h-3 w-3" />
                </Button>
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>

          {/* Target role */}
          <div className="space-y-1">
            <Label htmlFor="ir-target">Target Role (default headline)</Label>
            <Input
              id="ir-target"
              value={targetRole}
              placeholder="e.g. Senior Product Designer"
              onChange={(e) => setTargetRole(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Per-share links can override this with a tailored target role.
            </p>
          </div>

          {/* Theme */}
          <div className="space-y-1">
            <Label htmlFor="ir-theme">Theme</Label>
            <Select value={theme} onValueChange={(v) => setTheme(v ?? "modern")}>
              <SelectTrigger id="ir-theme">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THEMES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sections */}
          <div className="space-y-2">
            <Label>Sections</Label>
            <div className="border rounded-md divide-y">
              {sections.map((s, i) => (
                <div key={s.type} className="flex items-center gap-3 p-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 text-sm font-medium">
                    {SECTION_LABELS[s.type] || s.type}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => moveSection(i, -1)}
                    disabled={i === 0}
                    className="h-7 px-2"
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => moveSection(i, 1)}
                    disabled={i === sections.length - 1}
                    className="h-7 px-2"
                  >
                    ↓
                  </Button>
                  <div className="flex items-center gap-2 ml-2">
                    {s.visible ? (
                      <Eye className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <Switch
                      checked={s.visible}
                      onCheckedChange={(v) => toggleSection(s.type, v)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !slug}
            >
              {saveMutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
