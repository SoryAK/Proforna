"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import {
  Home, Briefcase, School, Baby, Dumbbell, Heart, MapPin,
  Plus, Trash2, GripVertical, ChevronDown, ChevronUp, Anchor,
  Church, ShoppingCart, Hospital, Coffee, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

/* ── Icon registry ── */
const ICON_MAP: Record<string, typeof Home> = {
  home: Home,
  briefcase: Briefcase,
  school: School,
  baby: Baby,
  dumbbell: Dumbbell,
  heart: Heart,
  "map-pin": MapPin,
  church: Church,
  "shopping-cart": ShoppingCart,
  hospital: Hospital,
  coffee: Coffee,
  anchor: Anchor,
};

const ICON_OPTIONS = Object.keys(ICON_MAP).map((k) => ({
  value: k,
  label: k
    .split("-")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" "),
}));

const PRESET_LABELS = [
  { label: "Home", icon: "home" },
  { label: "Spouse's Work", icon: "briefcase" },
  { label: "Kids' School", icon: "school" },
  { label: "Daycare", icon: "baby" },
  { label: "Gym", icon: "dumbbell" },
  { label: "Parent's Home", icon: "heart" },
  { label: "Place of Worship", icon: "church" },
];

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

interface LifeAnchor {
  id: string;
  label: string;
  icon: string;
  address: string;
  lat: number;
  lng: number;
  weight: number;
  sortOrder: number;
}

/* Geocode an address using Google Geocoding API */
async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  if (!GOOGLE_KEY) return null;
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_KEY}`,
  );
  const data = await res.json();
  if (data.results?.[0]?.geometry?.location) {
    return {
      lat: data.results[0].geometry.location.lat,
      lng: data.results[0].geometry.location.lng,
    };
  }
  return null;
}

interface Props {
  /** Compact mode (shown inline in map sidebar) vs full panel */
  compact?: boolean;
  /** Pre-fill address for "Home" preset (e.g. the user's search location) */
  defaultAddress?: string;
  onAnchorsChange?: (anchors: LifeAnchor[]) => void;
}

export function LifeAnchorsPanel({ compact = false, defaultAddress, onAnchorsChange }: Props) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Form state
  const [formLabel, setFormLabel] = useState("");
  const [formIcon, setFormIcon] = useState("home");
  const [formAddress, setFormAddress] = useState("");
  const [formWeight, setFormWeight] = useState(3);
  const [geocoding, setGeocoding] = useState(false);

  const { data: anchors = [], isLoading } = useQuery<LifeAnchor[]>({
    queryKey: ["life-anchors"],
    queryFn: () => fetch("/api/life-anchors").then((r) => r.json()),
    staleTime: 60_000,
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<LifeAnchor>) => {
      const res = await fetch("/api/life-anchors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_, __, ___) => {
      queryClient.invalidateQueries({ queryKey: ["life-anchors"] });
      toast.success("Life anchor added");
      resetForm();
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: Partial<LifeAnchor> & { id: string }) => {
      const res = await fetch(`/api/life-anchors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["life-anchors"] });
      toast.success("Anchor updated");
      resetForm();
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/life-anchors/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["life-anchors"] });
      toast.success("Anchor removed");
    },
  });

  const resetForm = useCallback(() => {
    setShowForm(false);
    setEditId(null);
    setFormLabel("");
    setFormIcon("home");
    setFormAddress("");
    setFormWeight(3);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!formLabel.trim() || !formAddress.trim()) {
      toast.error("Label and address are required");
      return;
    }

    setGeocoding(true);
    const coords = await geocodeAddress(formAddress);
    setGeocoding(false);

    if (!coords) {
      toast.error("Could not geocode address. Try a more specific address.");
      return;
    }

    const payload = {
      label: formLabel.trim(),
      icon: formIcon,
      address: formAddress.trim(),
      lat: coords.lat,
      lng: coords.lng,
      weight: formWeight,
      sortOrder: anchors.length,
    };

    if (editId) {
      updateMutation.mutate({ id: editId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }, [formLabel, formIcon, formAddress, formWeight, editId, anchors.length, createMutation, updateMutation]);

  const startEdit = useCallback((a: LifeAnchor) => {
    setEditId(a.id);
    setFormLabel(a.label);
    setFormIcon(a.icon);
    setFormAddress(a.address);
    setFormWeight(a.weight);
    setShowForm(true);
  }, []);

  const selectPreset = useCallback((preset: { label: string; icon: string }) => {
    setFormLabel(preset.label);
    setFormIcon(preset.icon);
    if (preset.label === "Home" && defaultAddress) {
      setFormAddress(defaultAddress);
    }
    setShowForm(true);
  }, [defaultAddress]);

  // Notify parent when anchors change
  const prevLen = anchors.length;
  if (onAnchorsChange && anchors.length > 0) {
    // Defer to avoid calling during render
    setTimeout(() => onAnchorsChange(anchors), 0);
  }

  const IconForAnchor = useCallback(
    (iconName: string) => ICON_MAP[iconName] ?? MapPin,
    [],
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading life anchors…
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-4"}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          onClick={() => setCollapsed(!collapsed)}
        >
          <Anchor className="h-4 w-4 text-indigo-500" />
          <span className={compact ? "text-sm font-semibold" : "text-base font-semibold"}>
            Life Anchors
          </span>
          {anchors.length > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
              {anchors.length}
            </Badge>
          )}
          {collapsed ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronUp className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
        {!collapsed && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs"
            onClick={() => (showForm ? resetForm() : setShowForm(true))}
          >
            {showForm ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <>
                <Plus className="h-3 w-3" /> Add
              </>
            )}
          </Button>
        )}
      </div>

      {/* Collapsible body */}
      {!collapsed && (
        <>
      {/* Anchor list */}
      {anchors.length > 0 && (
        <div className="space-y-1.5">
          {anchors.map((a) => {
            const Icon = IconForAnchor(a.icon);
            return (
              <div
                key={a.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 group cursor-pointer"
                onClick={() => startEdit(a)}
              >
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{a.label}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {a.address}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {/* Weight dots */}
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-1.5 w-1.5 rounded-full ${
                          i < a.weight
                            ? "bg-indigo-500"
                            : "bg-muted-foreground/20"
                        }`}
                      />
                    ))}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMutation.mutate(a.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state with presets */}
      {anchors.length === 0 && !showForm && (
        <div className="text-center py-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Add locations that matter — home, school, daycare, gym — and see how each job fits your whole life.
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {PRESET_LABELS.map((p) => {
              const Icon = ICON_MAP[p.icon] ?? MapPin;
              return (
                <Button
                  key={p.label}
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs"
                  onClick={() => selectPreset(p)}
                >
                  <Icon className="h-3 w-3" />
                  {p.label}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* Preset quick-add row when form is not open and some anchors exist */}
      {anchors.length > 0 && !showForm && (
        <div className="flex flex-wrap gap-1">
          {PRESET_LABELS.filter(
            (p) => !anchors.some((a) => a.label === p.label),
          ).map((p) => {
            const Icon = ICON_MAP[p.icon] ?? MapPin;
            return (
              <Button
                key={p.label}
                size="sm"
                variant="ghost"
                className="h-6 gap-1 text-[10px] px-1.5"
                onClick={() => selectPreset(p)}
              >
                <Icon className="h-3 w-3" />
                {p.label}
              </Button>
            );
          })}
        </div>
      )}

      {/* Add/Edit form */}
      {showForm && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Label</Label>
                <Input
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  placeholder="e.g. Kid's School"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Icon</Label>
                <Select
                  value={formIcon}
                  onValueChange={(v) => setFormIcon(v ?? "home")}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ICON_OPTIONS.map((opt) => {
                      const Icon = ICON_MAP[opt.value] ?? MapPin;
                      return (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5" />
                            {opt.label}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Address</Label>
              <PlacesAutocomplete
                value={formAddress}
                onChange={setFormAddress}
                placeholder="Search for an address…"
                className="h-8 text-sm"
                types={[]}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">
                Priority ({formWeight}/5)
              </Label>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((w) => (
                  <button
                    key={w}
                    type="button"
                    className={`h-6 w-6 rounded-full border-2 text-xs font-semibold transition-colors ${
                      w <= formWeight
                        ? "bg-indigo-500 border-indigo-500 text-white"
                        : "border-muted-foreground/30 text-muted-foreground"
                    }`}
                    onClick={() => setFormWeight(w)}
                  >
                    {w}
                  </button>
                ))}
                <span className="text-[10px] text-muted-foreground ml-2">
                  {formWeight <= 1
                    ? "Low"
                    : formWeight <= 2
                      ? "Medium-Low"
                      : formWeight <= 3
                        ? "Medium"
                        : formWeight <= 4
                          ? "High"
                          : "Critical"}
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                className="flex-1 gap-1"
                onClick={handleSubmit}
                disabled={
                  geocoding ||
                  createMutation.isPending ||
                  updateMutation.isPending
                }
              >
                {geocoding ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : editId ? (
                  "Update"
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" /> Add Anchor
                  </>
                )}
              </Button>
              <Button size="sm" variant="ghost" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
        </>
      )}
    </div>
  );
}
