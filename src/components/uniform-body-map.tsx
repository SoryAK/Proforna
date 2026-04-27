"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { X, ChevronLeft } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

export type ZoneId = "head" | "face" | "ears" | "torso" | "arms" | "legs" | "feet";

export interface ZoneData {
  item?: string;
  color?: string;
  providedBy?: "employer" | "self" | "";
  notes?: string;
  photo?: string;
}

export interface UniformData {
  enabled: boolean;
  category?: string;
  zones: Partial<Record<ZoneId, ZoneData>>;
}

export const CATEGORIES: { id: string; label: string }[] = [
  { id: "construction", label: "Construction" },
  { id: "food-service", label: "Food Service" },
  { id: "healthcare", label: "Healthcare" },
  { id: "office", label: "Office" },
  { id: "custom", label: "Custom" },
];

const PRESETS: Record<string, Partial<Record<ZoneId, ZoneData>>> = {
  construction: {
    head: { item: "Hard hat", color: "#FFD700", providedBy: "employer" },
    face: { item: "Safety glasses", providedBy: "employer" },
    ears: { item: "Ear protection", providedBy: "employer" },
    torso: { item: "Hi-vis vest", color: "#FF6600", providedBy: "employer" },
    arms: { item: "Work gloves", providedBy: "self" },
    legs: { item: "Work pants", providedBy: "self" },
    feet: { item: "Steel-toe boots", providedBy: "self" },
  },
  "food-service": {
    head: { item: "Hair net", providedBy: "employer" },
    face: { item: "Face mask", providedBy: "employer" },
    torso: { item: "Apron", providedBy: "employer" },
    arms: { item: "Disposable gloves", providedBy: "employer" },
    feet: { item: "Non-slip shoes", providedBy: "self" },
  },
  healthcare: {
    head: { item: "Scrub cap", providedBy: "self" },
    face: { item: "N95 / surgical mask", providedBy: "employer" },
    torso: { item: "Scrub top", color: "#5B9BD5", providedBy: "self" },
    arms: { item: "Exam gloves", providedBy: "employer" },
    legs: { item: "Scrub pants", color: "#5B9BD5", providedBy: "self" },
    feet: { item: "Clogs", providedBy: "self" },
  },
  office: {
    torso: { item: "Dress shirt / blouse", providedBy: "self" },
    legs: { item: "Slacks / skirt", providedBy: "self" },
    feet: { item: "Dress shoes", providedBy: "self" },
  },
};

export const ZONE_LABELS: Record<ZoneId, string> = {
  head: "Head",
  face: "Face / Eyes",
  ears: "Ears",
  torso: "Torso",
  arms: "Arms / Hands",
  legs: "Legs",
  feet: "Feet",
};

const ALL_ZONES: ZoneId[] = ["head", "face", "ears", "torso", "arms", "legs", "feet"];

const ZONE_DOT: Record<ZoneId, [number, number]> = {
  head:  [80, 12],
  face:  [80, 29],
  ears:  [42, 36],
  torso: [80, 102],
  arms:  [27, 115],
  legs:  [65, 205],
  feet:  [59, 273],
};

function getZoneStyle(
  zoneId: ZoneId,
  active: ZoneId | null,
  hovered: ZoneId | null,
  zones: Partial<Record<ZoneId, ZoneData>>,
  readOnly: boolean,
): { fill: string; stroke: string; strokeWidth: number } {
  const z = zones[zoneId];
  const hasData = !!(z?.item || z?.notes || z?.photo);
  const zoneColor = z?.color && /^#[0-9A-Fa-f]{3,6}$/.test(z.color) ? z.color : null;
  const isActive = active === zoneId;
  const isHovered = !readOnly && hovered === zoneId;

  if (isActive) return { fill: "hsl(var(--primary) / 0.45)", stroke: "hsl(var(--primary))", strokeWidth: 2 };
  if (isHovered) return {
    fill: hasData ? "hsl(var(--primary) / 0.32)" : "hsl(var(--primary) / 0.18)",
    stroke: "hsl(var(--primary) / 0.75)",
    strokeWidth: 1.5,
  };
  if (hasData && zoneColor) return { fill: zoneColor + "38", stroke: zoneColor + "AA", strokeWidth: 1.2 };
  if (hasData) return { fill: "hsl(var(--primary) / 0.15)", stroke: "hsl(var(--primary) / 0.55)", strokeWidth: 1.2 };
  return { fill: "hsl(var(--muted-foreground) / 0.07)", stroke: "hsl(var(--border))", strokeWidth: 0.9 };
}

interface BodySVGProps {
  value: UniformData;
  activeZone: ZoneId | null;
  onZoneClick: (z: ZoneId) => void;
  readOnly?: boolean;
  compact?: boolean;
}

function BodySVG({ value, activeZone, onZoneClick, readOnly = false, compact = false }: BodySVGProps) {
  const [hovered, setHovered] = useState<ZoneId | null>(null);
  const zones = value.zones;
  const svgW = compact ? 100 : 148;
  const svgH = compact ? 188 : 280;

  function zp(zoneId: ZoneId) {
    const s = getZoneStyle(zoneId, activeZone, hovered, zones, readOnly);
    return {
      fill: s.fill,
      stroke: s.stroke,
      strokeWidth: s.strokeWidth,
      style: { cursor: readOnly ? "default" : "pointer" } as React.CSSProperties,
      className: "transition-colors duration-100",
      onClick: readOnly ? undefined : () => onZoneClick(zoneId),
      onMouseEnter: readOnly ? undefined : () => setHovered(zoneId),
      onMouseLeave: readOnly ? undefined : () => setHovered(null),
    };
  }

  function zoneHasData(z: ZoneId) {
    return !!(zones[z]?.item || zones[z]?.notes || zones[z]?.photo);
  }

  const earsStyle = getZoneStyle("ears", activeZone, hovered, zones, readOnly);
  const labelZone = activeZone ?? hovered;

  return (
    <div className="flex flex-col items-center shrink-0">
      <svg viewBox="0 0 160 292" width={svgW} height={svgH} style={{ userSelect: "none", overflow: "visible" }}>
        <g style={{ pointerEvents: "none" }}>
          <rect x="72" y="61" width="16" height="13" rx="3"
            fill="hsl(var(--muted-foreground)/0.11)" stroke="hsl(var(--border))" strokeWidth="0.8" />
          <line x1="51" y1="159" x2="109" y2="159"
            stroke="hsl(var(--border))" strokeWidth="0.6" strokeDasharray="3,2" />
        </g>

        <path d="M48,75 L112,75 L109,157 L51,157 Z" {...zp("torso")} />
        <path d="M48,79 C31,89 23,144 23,163 L36,165 C36,147 44,96 52,87 Z M112,79 C129,89 137,144 137,163 L124,165 C124,147 116,96 108,87 Z" {...zp("arms")} />
        <path d="M51,159 L78,159 L78,266 L51,266 Z M82,159 L109,159 L109,266 L82,266 Z" {...zp("legs")} />
        <path d="M49,267 L78,267 L78,281 L40,281 C38,276 42,270 49,267 Z M82,267 L111,267 L118,270 C122,276 120,281 L82,281 Z" {...zp("feet")} />

        <circle cx="80" cy="35" r="26" {...zp("head")} />
        <ellipse cx="80" cy="36" rx="15" ry="20" {...zp("face")} />

        <g style={{ cursor: readOnly ? "default" : "pointer" }} className="transition-colors duration-100"
          onClick={readOnly ? undefined : () => onZoneClick("ears")}
          onMouseEnter={readOnly ? undefined : () => setHovered("ears")}
          onMouseLeave={readOnly ? undefined : () => setHovered(null)}>
          <path d="M54,25 C45,30 45,43 54,48 L57,45 C49,41 49,32 57,28 Z"
            fill={earsStyle.fill} stroke={earsStyle.stroke} strokeWidth={earsStyle.strokeWidth} />
          <path d="M106,25 C115,30 115,43 106,48 L103,45 C111,41 111,32 103,28 Z"
            fill={earsStyle.fill} stroke={earsStyle.stroke} strokeWidth={earsStyle.strokeWidth} />
        </g>

        {ALL_ZONES.filter(z => zoneHasData(z)).map(z => {
          const [cx, cy] = ZONE_DOT[z];
          return <circle key={z} cx={cx} cy={cy} r={3.5}
            fill="hsl(var(--primary))" stroke="hsl(var(--background))" strokeWidth="1.2"
            style={{ pointerEvents: "none" }} />;
        })}

        {labelZone && !compact && (
          <text x="80" y="291" textAnchor="middle" fontSize="8"
            fill="hsl(var(--muted-foreground))" style={{ pointerEvents: "none" }}>
            {ZONE_LABELS[labelZone]}
          </text>
        )}
      </svg>
      {!compact && !readOnly && (
        <p className="text-[10px] text-muted-foreground mt-1 text-center">Click a zone to edit</p>
      )}
    </div>
  );
}

interface ZoneFormProps {
  zoneId: ZoneId;
  data: ZoneData;
  onChange: (d: ZoneData) => void;
  onBack: () => void;
}

function ZoneForm({ zoneId, data, onChange, onBack }: ZoneFormProps) {
  function update(patch: Partial<ZoneData>) { onChange({ ...data, ...patch }); }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 mb-0.5">
        <button type="button" onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <p className="text-[11px] font-semibold uppercase tracking-wide">{ZONE_LABELS[zoneId]}</p>
      </div>
      <input className="w-full border rounded px-2 py-1 text-xs bg-background"
        value={data.item ?? ""} onChange={e => update({ item: e.target.value })}
        placeholder="Equipment / item name" maxLength={100} />
      <div className="flex gap-1.5 items-center">
        <input className="flex-1 border rounded px-2 py-1 text-xs bg-background"
          value={data.color && !/^#/.test(data.color) ? data.color : ""}
          onChange={e => update({ color: e.target.value })} placeholder="Color name" maxLength={50} />
        <input type="color" className="h-7 w-9 rounded border cursor-pointer p-0.5 bg-background"
          value={data.color && /^#[0-9a-fA-F]{6}$/.test(data.color) ? data.color : "#888888"}
          onChange={e => update({ color: e.target.value })} title="Pick color" />
      </div>
      <div className="flex gap-1">
        {(["employer", "self", ""] as const).map(opt => (
          <button key={opt} type="button" onClick={() => update({ providedBy: opt })}
            className={cn("flex-1 py-1 rounded border text-[11px] transition-colors",
              (data.providedBy ?? "") === opt ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/50 text-foreground")}>
            {opt === "" ? "N/A" : opt.charAt(0).toUpperCase() + opt.slice(1)}
          </button>
        ))}
      </div>
      <textarea className="w-full border rounded px-2 py-1 text-xs bg-background resize-none" rows={2}
        value={data.notes ?? ""} onChange={e => update({ notes: e.target.value })} placeholder="Notes…" maxLength={300} />
      {data.photo ? (
        <div className="relative">
          <img src={data.photo} alt={ZONE_LABELS[zoneId]} className="w-full h-20 object-cover rounded border" />
          <button type="button" onClick={() => update({ photo: undefined })}
            className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] hover:bg-black/80">✕</button>
        </div>
      ) : (
        <label className="flex items-center justify-center border border-dashed rounded h-12 cursor-pointer hover:bg-muted/30 transition-colors text-[11px] text-muted-foreground">
          + Photo (optional)
          <input type="file" accept="image/*" className="hidden" onChange={e => {
            const file = e.target.files?.[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = () => update({ photo: reader.result as string });
            reader.readAsDataURL(file);
          }} />
        </label>
      )}
    </div>
  );
}

interface UniformBodyMapProps {
  value: UniformData;
  onChange: (v: UniformData) => void;
}

export function UniformBodyMap({ value, onChange }: UniformBodyMapProps) {
  const [activeZone, setActiveZone] = useState<ZoneId | null>(null);

  function updateZone(zoneId: ZoneId, data: ZoneData) {
    onChange({ ...value, zones: { ...value.zones, [zoneId]: data } });
  }

  function applyPreset(categoryId: string) {
    const preset = PRESETS[categoryId] ?? {};
    onChange({ ...value, category: categoryId, zones: { ...preset } });
    setActiveZone(null);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {CATEGORIES.map(cat => (
          <button key={cat.id} type="button" onClick={() => applyPreset(cat.id)}
            className={cn("text-[11px] px-2 py-0.5 rounded-full border transition-colors",
              value.category === cat.id ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/60 text-foreground")}>
            {cat.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2 items-start">
        <BodySVG value={value} activeZone={activeZone}
          onZoneClick={zoneId => setActiveZone(activeZone === zoneId ? null : zoneId)} />
        <div className="flex-1 min-w-0 overflow-y-auto" style={{ maxHeight: 290 }}>
          {activeZone ? (
            <ZoneForm zoneId={activeZone} data={value.zones[activeZone] ?? {}}
              onChange={data => updateZone(activeZone, data)} onBack={() => setActiveZone(null)} />
          ) : (
            <div className="space-y-1">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Zone Summary</p>
              {ALL_ZONES.map(zoneId => {
                const z = value.zones[zoneId];
                const hasData = !!(z?.item || z?.notes || z?.photo);
                return (
                  <button key={zoneId} type="button" onClick={() => setActiveZone(zoneId)}
                    className={cn("w-full flex items-center justify-between px-2 py-1.5 rounded border text-left transition-colors",
                      hasData ? "border-primary/30 bg-primary/5 hover:bg-primary/10" : "border-transparent bg-muted/20 hover:bg-muted/40")}>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {z?.color && /^#[0-9A-Fa-f]{3,6}$/.test(z.color) && (
                        <span className="w-2.5 h-2.5 rounded-full border shrink-0" style={{ background: z.color }} />
                      )}
                      <span className="text-[11px] font-medium">{ZONE_LABELS[zoneId]}</span>
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate max-w-[95px] ml-1">
                      {z?.item ?? "—"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface UniformMapPopupProps {
  data: UniformData;
  companyName: string;
  onClose: () => void;
}

export function UniformMapPopup({ data, companyName, onClose }: UniformMapPopupProps) {
  const filledZones = ALL_ZONES.filter(z => !!(data.zones[z]?.item || data.zones[z]?.notes || data.zones[z]?.photo));
  const catLabel = CATEGORIES.find(c => c.id === data.category)?.label;

  return (
    <div className="bg-background/97 backdrop-blur-md border rounded-xl shadow-2xl p-3 w-72">
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold truncate">{companyName}</p>
          {catLabel && (
            <span className="inline-block text-[10px] bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded-full mt-0.5">
              {catLabel} · {filledZones.length} zone{filledZones.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <button type="button" onClick={onClose}
          className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted/50 shrink-0 ml-1">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex gap-3 items-start">
        <BodySVG value={data} activeZone={null} onZoneClick={() => {}} readOnly compact />
        <div className="flex-1 space-y-1 overflow-y-auto" style={{ maxHeight: 188 }}>
          {filledZones.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">No zones configured</p>
          ) : (
            filledZones.map(zoneId => {
              const z = data.zones[zoneId]!;
              return (
                <div key={zoneId} className="p-1.5 rounded bg-muted/20 space-y-0.5">
                  <div className="flex items-center gap-1">
                    {z.color && /^#[0-9A-Fa-f]{3,6}$/.test(z.color) && (
                      <span className="w-2 h-2 rounded-full shrink-0 border" style={{ background: z.color }} />
                    )}
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide leading-none">{ZONE_LABELS[zoneId]}</p>
                  </div>
                  <p className="text-[12px] font-medium leading-snug">{z.item}</p>
                  {z.providedBy && (
                    <p className="text-[10px] text-muted-foreground">{z.providedBy === "employer" ? "Employer-provided" : "Personal"}</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}