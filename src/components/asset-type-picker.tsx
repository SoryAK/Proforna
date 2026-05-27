"use client";

/**
 * AssetTypePicker — shared searchable picker for AssetType library entries.
 *
 * Used in:
 *  - job-assets-page.tsx  (CreateAssetModal)
 *  - asset-picker.tsx     (AssetEditModal — reassign type after creation)
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ASSET_CATEGORIES, type AssetTypeRecord } from "@/components/asset-types-manager";

export function AssetTypePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [q, setQ] = useState("");
  const { data: types = [] } = useQuery<AssetTypeRecord[]>({
    queryKey: ["asset-types"],
    queryFn: async () => (await fetch("/api/asset-types")).json(),
  });

  const filtered = q.trim()
    ? types.filter(
        (t) =>
          t.name.toLowerCase().includes(q.toLowerCase()) ||
          (t.manufacturer ?? "").toLowerCase().includes(q.toLowerCase()),
      )
    : types;

  const selected = value ? types.find((t) => t.id === value) : null;

  return (
    <div className="space-y-1">
      <div className="relative">
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search asset types…"
          className="h-9 pl-8 text-sm"
        />
      </div>
      {selected && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1 text-xs">
          <span className="font-medium">{selected.name}</span>
          <span className="text-muted-foreground">
            {ASSET_CATEGORIES.find((c) => c.value === selected.category)?.label}
          </span>
          <button
            onClick={() => onChange(null)}
            className="ml-auto text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        </div>
      )}
      {q && filtered.length > 0 && (
        <div className="rounded-md border bg-popover shadow-md max-h-40 overflow-y-auto divide-y text-sm">
          {filtered.map((t) => (
            <button
              key={t.id}
              onClick={() => { onChange(t.id); setQ(""); }}
              className="w-full text-left px-3 py-2 hover:bg-accent flex items-center gap-2"
            >
              <span className="font-medium">{t.name}</span>
              <span className="text-xs text-muted-foreground">
                {ASSET_CATEGORIES.find((c) => c.value === t.category)?.label}
                {t.manufacturer ? ` · ${t.manufacturer}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
      {q && filtered.length === 0 && (
        <p className="text-xs text-muted-foreground px-1">
          No types found.{" "}
          <a href="/asset-types" className="underline">
            Create one
          </a>
          .
        </p>
      )}
    </div>
  );
}
