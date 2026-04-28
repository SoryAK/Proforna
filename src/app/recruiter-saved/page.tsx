"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bookmark,
  ExternalLink,
  MapPin,
  StickyNote,
  Trash2,
  ArrowLeft,
  Flame,
  HelpCircle,
  Ban,
} from "lucide-react";

type RecruiterTag = "hot" | "maybe" | "no_go";

interface SavedItem {
  irSlug: string;
  savedAt: string;
  tag: RecruiterTag | null;
  candidateName: string | null;
  candidateHeadline: string | null;
  avatarUrl: string | null;
  location: string | null;
  noteBody: string | null;
  noteUpdatedAt: string | null;
}

const TAG_META: Record<RecruiterTag, { label: string; Icon: React.ComponentType<{ className?: string }>; activeClass: string; chipClass: string }> = {
  hot:   { label: "Hot",   Icon: Flame,      activeClass: "bg-red-500 text-white border-red-500",     chipClass: "bg-red-500/10 text-red-600 border-red-500/30" },
  maybe: { label: "Maybe", Icon: HelpCircle, activeClass: "bg-amber-500 text-white border-amber-500", chipClass: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  no_go: { label: "No-go", Icon: Ban,        activeClass: "bg-gray-500 text-white border-gray-500",   chipClass: "bg-gray-500/10 text-gray-600 border-gray-500/30" },
};
const TAG_ORDER: RecruiterTag[] = ["hot", "maybe", "no_go"];

type FilterValue = "all" | RecruiterTag | "untagged";

/**
 * /recruiter-saved — anonymous "my saved candidates" dashboard.
 *
 * Reads the recruiter_id cookie set when the user first hits Save on an
 * IR page. Lists each saved candidate with their note preview and a quick
 * "Open IR" link. No login required — entirely device-scoped.
 */
export default function RecruiterSavedPage() {
  const [items, setItems] = useState<SavedItem[] | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>("all");

  async function load() {
    const r = await fetch("/api/recruiter/list", { credentials: "same-origin" });
    const d: { items?: SavedItem[] } = await r.json();
    setItems(d.items ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function unsave(slug: string) {
    setBusySlug(slug);
    try {
      await fetch(`/api/recruiter/saves?slug=${encodeURIComponent(slug)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      setItems((cur) => cur?.filter((i) => i.irSlug !== slug) ?? null);
    } finally {
      setBusySlug(null);
    }
  }

  async function setItemTag(slug: string, nextTag: RecruiterTag | null) {
    const prev = items;
    setItems((cur) => cur?.map((i) => (i.irSlug === slug ? { ...i, tag: nextTag } : i)) ?? null);
    try {
      const res = await fetch("/api/recruiter/saves", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ irSlug: slug, tag: nextTag }),
      });
      if (!res.ok) setItems(prev);
    } catch {
      setItems(prev);
    }
  }

  const counts = useMemo(() => {
    const c: Record<FilterValue, number> = { all: 0, hot: 0, maybe: 0, no_go: 0, untagged: 0 };
    if (!items) return c;
    c.all = items.length;
    for (const it of items) {
      if (it.tag) c[it.tag] += 1;
      else c.untagged += 1;
    }
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    if (!items) return null;
    if (filter === "all") return items;
    if (filter === "untagged") return items.filter((i) => !i.tag);
    return items.filter((i) => i.tag === filter);
  }, [items, filter]);

  const filterChips: { value: FilterValue; label: string }[] = [
    { value: "all",      label: "All" },
    { value: "hot",      label: "Hot" },
    { value: "maybe",    label: "Maybe" },
    { value: "no_go",    label: "No-go" },
    { value: "untagged", label: "Untagged" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
      <header className="border-b bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Bookmark className="h-5 w-5 text-amber-500" />
              Saved candidates
            </h1>
            <p className="text-xs text-muted-foreground">
              Stored on this device only. No account required.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
        </div>
        {items && items.length > 0 && (
          <div className="max-w-3xl mx-auto px-6 pb-3 flex flex-wrap gap-1.5">
            {filterChips.map((c) => {
              const active = filter === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setFilter(c.value)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted/40 text-muted-foreground"
                  }`}
                >
                  {c.label}
                  <span className={`text-[10px] ${active ? "opacity-80" : "text-muted-foreground"}`}>
                    {counts[c.value]}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6">
        {items === null && (
          <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
        )}

        {items !== null && items.length === 0 && (
          <div className="text-center py-16 border rounded-xl bg-white dark:bg-gray-900">
            <Bookmark className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">No saved candidates yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Hit the <strong>Save</strong> button on a candidate&apos;s map page and
              they&apos;ll show up here.
            </p>
          </div>
        )}

        {filtered && filtered.length === 0 && items && items.length > 0 && (
          <p className="text-sm text-muted-foreground text-center py-12">
            No candidates match this filter.
          </p>
        )}

        {filtered && filtered.length > 0 && (
          <ul className="space-y-3">
            {filtered.map((it) => {
              const tagMeta = it.tag ? TAG_META[it.tag] : null;
              return (
                <li
                  key={it.irSlug}
                  className="border rounded-xl bg-white dark:bg-gray-900 p-4 flex gap-4"
                >
                  {it.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.avatarUrl}
                      alt=""
                      className="h-12 w-12 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-sm font-semibold shrink-0">
                      {(it.candidateName ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <h2 className="text-sm font-semibold truncate flex items-center gap-2">
                        {it.candidateName ?? it.irSlug}
                        {tagMeta && (
                          <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${tagMeta.chipClass}`}>
                            <tagMeta.Icon className="h-2.5 w-2.5" />
                            {tagMeta.label}
                          </span>
                        )}
                      </h2>
                      <span
                        className="text-[10px] text-muted-foreground"
                        title={new Date(it.savedAt).toLocaleString()}
                      >
                        Saved {new Date(it.savedAt).toLocaleDateString()}
                      </span>
                    </div>
                    {it.candidateHeadline && (
                      <p className="text-xs text-primary truncate">{it.candidateHeadline}</p>
                    )}
                    {it.location && (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3" /> {it.location}
                      </p>
                    )}
                    {it.noteBody && (
                      <p className="mt-2 text-xs text-muted-foreground line-clamp-3 border-l-2 border-amber-400 pl-2">
                        <StickyNote className="inline h-3 w-3 mr-1 text-amber-500" />
                        {it.noteBody}
                      </p>
                    )}

                    <div className="mt-3 flex items-center gap-3 flex-wrap">
                      <Link
                        href={`/r/${it.irSlug}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        Open candidate <ExternalLink className="h-3 w-3" />
                      </Link>

                      <div className="inline-flex items-center gap-1 ml-auto">
                        {TAG_ORDER.map((t) => {
                          const meta = TAG_META[t];
                          const active = it.tag === t;
                          return (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setItemTag(it.irSlug, active ? null : t)}
                              aria-pressed={active}
                              title={meta.label}
                              className={`inline-flex items-center justify-center rounded-md border h-6 w-6 transition-colors ${
                                active ? meta.activeClass : "border-transparent text-muted-foreground hover:bg-muted/40"
                              }`}
                            >
                              <meta.Icon className="h-3 w-3" />
                            </button>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        onClick={() => unsave(it.irSlug)}
                        disabled={busySlug === it.irSlug}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-red-500"
                      >
                        <Trash2 className="h-3 w-3" /> Remove
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
