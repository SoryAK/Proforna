import { useEffect, useMemo, useState } from "react";
import { CommandPalette } from "@astryxdesign/core/CommandPalette";
import type { SearchableItem, SearchSource } from "@astryxdesign/core/Typeahead";
import { formatHistoryPlace } from "@core/career-history";
import type { WorkMapRole } from "@core/work-map";
import { liveUpdates } from "./HomeCenter";

const PLACES = [
  { id: "profile", label: "Profile", detail: "Name and links" },
  { id: "history", label: "Career history", detail: "Roles on this board" },
  { id: "map", label: "Map", detail: "Places for the roles" },
  { id: "updates", label: "Live updates", detail: "Notes from current roles" },
  { id: "media", label: "Media and events", detail: "Photos and events" },
  { id: "proforna", label: "Proforna", detail: "The right panel" },
] as const;

export type SearchPlace = (typeof PLACES)[number]["id"];

type PaletteHit = SearchableItem<{
  group: string;
  detail: string;
  haystack: string;
}>;

export function HomeSearch({
  open,
  onOpenChange,
  onPlace,
  onRole,
  onUpdate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPlace: (id: SearchPlace) => void;
  onRole: (id: string) => void;
  onUpdate: (id: string) => void;
}) {
  const [roles, setRoles] = useState<WorkMapRole[]>([]);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/work-map")
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { roles?: WorkMapRole[] };
        setRoles(body.roles ?? []);
      })
      .catch(() => setRoles([]));
  }, [open]);

  const palette = useMemo(() => buildPalette(roles), [roles]);

  function pick(value: string) {
    const split = value.indexOf(":");
    const kind = split === -1 ? "" : value.slice(0, split);
    const target = split === -1 ? value : value.slice(split + 1);
    if (kind === "place" && PLACES.some((item) => item.id === target)) {
      onPlace(target as SearchPlace);
      return;
    }
    if (kind === "role") onRole(target);
    if (kind === "update") onUpdate(target);
  }

  return (
    <CommandPalette
      isOpen={open}
      onOpenChange={onOpenChange}
      searchSource={palette}
      label="Search"
      emptySearchText="Nothing matches that."
      onValueChange={pick}
      renderItem={(item) => (
        <span className="home-palette-hit">
          <strong>{item.label}</strong>
          {item.auxiliaryData?.detail ? <span>{item.auxiliaryData.detail}</span> : null}
        </span>
      )}
    />
  );
}

function buildPalette(roles: WorkMapRole[]): SearchSource<PaletteHit> {
  const places: PaletteHit[] = PLACES.map((item) => ({
    id: `place:${item.id}`,
    label: item.label,
    auxiliaryData: {
      group: "Places",
      detail: item.detail,
      haystack: `${item.label} ${item.detail}`,
    },
  }));
  const roleHits: PaletteHit[] = roles.map((role) => {
    const label = role.organization || role.title || "Untitled";
    const detail = [role.title, formatHistoryPlace(role)].filter(Boolean).join(" · ");
    return {
      id: `role:${role.id}`,
      label,
      auxiliaryData: {
        group: "Roles",
        detail,
        haystack: `${label} ${detail} ${role.details.summary}`,
      },
    };
  });
  const updateHits: PaletteHit[] = liveUpdates(roles).map((item) => ({
    id: `update:${item.id}`,
    label: item.organization,
    auxiliaryData: {
      group: "Live updates",
      detail: `${item.kind} · ${item.text}`,
      haystack: `${item.organization} ${item.kind} ${item.text}`,
    },
  }));
  const all = [...places, ...roleHits, ...updateHits];
  return {
    bootstrap: () => places,
    search: (query) => {
      const needle = query.trim().toLowerCase();
      if (!needle) return places;
      return all.filter((item) => (item.auxiliaryData?.haystack ?? item.label).toLowerCase().includes(needle));
    },
  };
}
