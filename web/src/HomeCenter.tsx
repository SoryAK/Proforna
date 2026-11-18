import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Icon } from "@astryxdesign/core/Icon";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { ScrollableArea } from "@astryxdesign/core/ScrollableArea";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { formatHistoryPeriod, presentCareerHistoryStats } from "@core/career-history";
import type { MapSettings } from "@core/map-settings";
import { roleCoverPhoto, type WorkMapRole } from "@core/work-map";
import { ArrowLeft, LayoutGrid, Map as MapIcon } from "lucide-react";
import { CareerMap } from "./CareerMap";
import type { MapFitMode } from "./map-camera";
import "./home-center.css";

export function HomeCenter({
  revision = 0,
  focusRoleId,
  onSelectRole,
  viewRequest = null,
  pageContent = null,
}: {
  revision?: number;
  focusRoleId: string | null;
  onSelectRole: (id: string) => void;
  viewRequest?: { id: number; updates: boolean; updateId: string | null } | null;
  pageContent?: ReactNode;
}) {
  const [roles, setRoles] = useState<WorkMapRole[]>([]);
  const [settings, setSettings] = useState<MapSettings | null>(null);
  const [view, setView] = useState<CenterView>("story");
  const [updateId, setUpdateId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [recentLens, setRecentLens] = useState<RecentLens>("recent");
  const [recentQuery, setRecentQuery] = useState("");
  const [recentFilter, setRecentFilter] = useState<RecentFilter>("all");
  const [recentSort, setRecentSort] = useState<RecentSort>("date");
  const tabRefs = useRef<Partial<Record<CenterView, HTMLButtonElement>>>({});

  useEffect(() => {
    if (!viewRequest) return;
    setView(viewRequest.updates ? "story" : "map");
    setUpdateId(viewRequest.updateId);
  }, [viewRequest]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    void fetch("/api/work-map", { signal: controller.signal })
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          setError("The map could not be loaded.");
          return;
        }
        const body = (await response.json()) as { roles?: WorkMapRole[] };
        if (cancelled) return;
        setRoles(body.roles ?? []);
        setError("");
      })
      .catch((error: unknown) => {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        setError("The map could not be loaded.");
      });
    void fetch("/api/maps", { signal: controller.signal })
      .then(async (response) => {
        if (cancelled || !response.ok) return;
        const body = (await response.json()) as { settings?: MapSettings };
        if (cancelled || !body.settings) return;
        setSettings(body.settings);
      })
      .catch((error: unknown) => {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        setSettings(null);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [revision]);

  const focus = roles.find((role) => role.id === focusRoleId) ?? null;
  const updates = useMemo(
    () => liveUpdates(focus ? [focus] : roles.filter((role) => role.isCurrent), now),
    [focus, roles, now],
  );
  const openUpdate = updates.find((item) => item.id === updateId) ?? null;
  const recentItems = updates.filter((item) =>
    recentLens === "notes" ? item.kind === "Note" : recentLens === "milestones" ? item.kind === "Milestone" : true,
  );
  const recentFiltered = recentItems.filter((item) => matchesRecentFilter(item, recentFilter));
  const recentNeedle = recentQuery.trim().toLowerCase();
  const recentShown = (recentNeedle
    ? recentFiltered.filter((item) =>
        [item.kind, item.organization, item.text, item.stamp].join(" ").toLowerCase().includes(recentNeedle),
      )
    : recentFiltered
  )
    .slice()
    .sort((left, right) => compareRecent(left, right, recentSort));
  const placed = roles.filter(roleHasPlace);
  const mapFit: MapFitMode = focus && roleHasPlace(focus) ? "pin" : focus ? "hold" : "visible";
  const story = useMemo(() => storyFeed(roles), [roles]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  function chooseStage(next: CenterView) {
    setView(next);
    setUpdateId(null);
  }

  function moveTab(event: KeyboardEvent<HTMLButtonElement>) {
    const order: CenterView[] = ["story", "map"];
    const index = Math.max(0, order.indexOf(view));
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % order.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + order.length) % order.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = order.length - 1;
    else return;
    event.preventDefault();
    const chosen = order[next];
    chooseStage(chosen);
    tabRefs.current[chosen]?.focus();
  }

  function openRecent(id: string) {
    setUpdateId(id);
  }

  return (
    <div className="home-center">
      <main
        className="home-stage home-center-live"
        aria-label={pageContent ? "Page" : view === "map" ? "Map" : "Career story"}
      >
        <div className="home-center-bar">
          {pageContent ? (
            <div className="home-center-tabs" />
          ) : (
          <div className="home-center-tabs" role="tablist" aria-label="Card views">
            <button
              ref={(node) => {
                tabRefs.current.story = node ?? undefined;
              }}
              id="home-center-tab-story"
              type="button"
              role="tab"
              aria-selected={view === "story"}
              aria-controls="home-center-panel"
              tabIndex={view === "story" ? 0 : -1}
              onKeyDown={moveTab}
              onClick={() => chooseStage("story")}
            >
              <Icon icon={LayoutGrid} size="sm" />
              Story
            </button>
            <button
              ref={(node) => {
                tabRefs.current.map = node ?? undefined;
              }}
              id="home-center-tab-map"
              type="button"
              role="tab"
              aria-selected={view === "map"}
              aria-controls="home-center-panel"
              tabIndex={view === "map" ? 0 : -1}
              onKeyDown={moveTab}
              onClick={() => chooseStage("map")}
            >
              <Icon icon={MapIcon} size="sm" />
              Map
            </button>
          </div>
          )}
          <div className="home-center-pub" />
        </div>
        <div
          className="home-center-stage"
          id="home-center-panel"
          role={pageContent ? undefined : "tabpanel"}
          aria-labelledby={
            pageContent ? undefined : view === "map" ? "home-center-tab-map" : "home-center-tab-story"
          }
        >
          <div className="home-story-layout">
            {pageContent ? (
              <div className="home-story-page">{pageContent}</div>
            ) : view === "map" ? (
              <div className="home-center-map">
                {error ? <p className="home-center-empty">{error}</p> : null}
                <CareerMap
                  emptyNote={
                    placed.length === 0
                      ? { title: "No places yet.", detail: "Roles with a workplace show up here." }
                      : null
                  }
                  fitKey={`${focusRoleId ?? "all"}:${mapFit}:${placed.map((role) => role.id).join(",")}`}
                  fitMode={mapFit}
                  onSelect={onSelectRole}
                  roles={roles}
                  selectedId={focusRoleId}
                  settings={settings}
                  viewKey="home-center"
                />
              </div>
            ) : story.roles > 0 ? (
              <div className="home-story">
                  <article className="home-story-stat">
                    <span>Jobs</span>
                    <strong>{story.jobs}</strong>
                  </article>
                  <article className="home-story-stat">
                    <span>Roles</span>
                    <strong>{story.roles}</strong>
                  </article>
                  <article className="home-story-stat">
                    <span>Tenure</span>
                    <strong>{story.tenure}</strong>
                  </article>
                  <section className="home-story-panel" aria-label="Highlights">
                    <h2>Highlights</h2>
                    <ul>
                      {story.highlights.map((item) => (
                        <li key={item.id}>
                          <button type="button" onClick={() => onSelectRole(item.id)}>
                            <strong>{item.title}</strong>
                            {item.line ? <span>{item.line}</span> : null}
                            <span>{item.text}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section className="home-story-panel home-story-gaps" aria-label="Missing">
                    <h2>Missing</h2>
                    <p>
                      {story.missing.length > 0
                        ? `Still missing ${story.missing.join(", ")}.`
                        : "The main pieces are here."}
                    </p>
                  </section>
                </div>
              ) : (
                <p className="home-center-empty">{error || "Nothing in the story yet."}</p>
              )}
                <section className="home-story-recent" aria-label="Recent events">
                  <div className="home-story-recent-switch">
                    <SegmentedControl
                      label="Recent views"
                      size="sm"
                      layout="fill"
                      value={recentLens}
                      onChange={(value) => {
                        setRecentLens(value === "notes" || value === "milestones" ? value : "recent");
                        setUpdateId(null);
                      }}
                    >
                      <SegmentedControlItem value="recent" label="Recent" />
                      <SegmentedControlItem value="notes" label="Notes" />
                      <SegmentedControlItem value="milestones" label="Milestones" />
                    </SegmentedControl>
                  </div>
                  <div className="home-story-recent-find">
                    <TextInput
                      label={`Search ${recentLensLabel(recentLens).toLowerCase()}`}
                      isLabelHidden
                      placeholder="Search..."
                      size="sm"
                      hasClear
                      startIcon={MagnifyingGlassIcon}
                      value={recentQuery}
                      onChange={(value) => {
                        setRecentQuery(value);
                        setUpdateId(null);
                      }}
                    />
                    <Selector
                      label="Filter recent"
                      isLabelHidden
                      size="sm"
                      variant="ghost"
                      value={recentFilter}
                      onChange={(value) => {
                        setRecentFilter(
                          value === "notes" || value === "milestones" || value === "updates" ? value : "all",
                        );
                        setUpdateId(null);
                      }}
                      options={[
                        { value: "all", label: "All" },
                        { value: "notes", label: "Notes" },
                        { value: "milestones", label: "Milestones" },
                        { value: "updates", label: "Updates" },
                      ]}
                    />
                    <Selector
                      label="Sort recent"
                      isLabelHidden
                      size="sm"
                      variant="ghost"
                      value={recentSort}
                      onChange={(value) => {
                        setRecentSort(
                          value === "type" || value === "company" || value === "achievement" ? value : "date",
                        );
                      }}
                      options={[
                        { value: "date", label: "Date" },
                        { value: "type", label: "Type" },
                        { value: "company", label: "Company" },
                        { value: "achievement", label: "Achievement" },
                      ]}
                    />
                  </div>
                  <ScrollableArea className="home-story-recent-scroll" label={recentLensLabel(recentLens)}>
                    <div className="home-story-panel home-story-recent-card">
                      {recentShown.length > 0 ? (
                        <ul>
                          {recentShown.map((item) => (
                            <li key={item.id}>
                              <button type="button" onClick={() => openRecent(item.id)}>
                                <strong>{`${item.kind || "Update"} · ${item.organization}`}</strong>
                                <span>{item.text}</span>
                                {item.stamp ? <time dateTime={item.when}>{item.stamp}</time> : null}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>
                          {recentNeedle || recentFilter !== "all"
                            ? "No matches."
                            : recentEmpty(recentLens, focus)}
                        </p>
                      )}
                    </div>
                  </ScrollableArea>
                </section>
          </div>
        </div>
      </main>
      <Dialog
        isOpen={openUpdate != null}
        onOpenChange={(open) => {
          if (!open) setUpdateId(null);
        }}
        purpose="info"
        width={560}
      >
        {openUpdate ? (
          <Layout
            padding={4}
            header={
              <DialogHeader
                title={openUpdate.organization || "Update"}
                subtitle={[openUpdate.kind, openUpdate.frame].filter(Boolean).join(" · ") || undefined}
                hasDivider={false}
                startContent={
                  <Button
                    label="Back"
                    variant="ghost"
                    isIconOnly
                    icon={<Icon icon={ArrowLeft} />}
                    onClick={() => setUpdateId(null)}
                  />
                }
                onOpenChange={() => setUpdateId(null)}
              />
            }
            content={
              <LayoutContent label="Recent detail">
                <p className="home-recent-detail">{openUpdate.text}</p>
              </LayoutContent>
            }
          />
        ) : null}
      </Dialog>
    </div>
  );
}

type CenterView = "story" | "map";
type RecentLens = "recent" | "notes" | "milestones";
type RecentFilter = "all" | "notes" | "milestones" | "updates";
type RecentSort = "date" | "type" | "company" | "achievement";

function matchesRecentFilter(item: LiveUpdate, filter: RecentFilter) {
  if (filter === "notes") return item.kind === "Note";
  if (filter === "milestones") return item.kind === "Milestone";
  if (filter === "updates") return item.kind !== "Note" && item.kind !== "Milestone";
  return true;
}

function compareRecent(left: LiveUpdate, right: LiveUpdate, sort: RecentSort) {
  if (sort === "date") {
    const ranked = (right.when || "").localeCompare(left.when || "");
    if (ranked !== 0) return ranked;
  } else {
    const value =
      sort === "type"
        ? [left.kind, right.kind]
        : sort === "company"
          ? [left.organization, right.organization]
          : [left.text, right.text];
    const ranked = value[0].localeCompare(value[1], undefined, { sensitivity: "base" });
    if (ranked !== 0) return ranked;
  }
  return left.id.localeCompare(right.id);
}

function recentLensLabel(lens: RecentLens) {
  if (lens === "notes") return "Notes";
  if (lens === "milestones") return "Milestones";
  return "Recent";
}

function recentEmpty(lens: RecentLens, focus: WorkMapRole | null) {
  if (lens === "notes") return "No notes yet.";
  if (lens === "milestones") return "No milestones yet.";
  return focus ? "Nothing recorded for this role yet." : "Nothing new from the jobs you're in.";
}

type StoryFeed = {
  jobs: number;
  roles: number;
  tenure: string;
  highlights: StoryHighlight[];
  missing: string[];
};

type StoryHighlight = {
  id: string;
  title: string;
  line: string;
  text: string;
};

function storyFeed(roles: WorkMapRole[]): StoryFeed {
  const stats = presentCareerHistoryStats(roles);
  return {
    jobs: roles.filter((role) => role.kind === "job").length,
    roles: roles.length,
    tenure: stats.tenure || "—",
    highlights: storyHighlights(roles),
    missing: storyMissing(roles),
  };
}

function storyHighlights(roles: WorkMapRole[]): StoryHighlight[] {
  const current = roles.filter((role) => role.isCurrent);
  const pool = (current.length > 0 ? current : roles)
    .slice()
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  return pool.slice(0, 2).map((role) => {
    const told =
      role.details.summary.trim() ||
      role.achievements.find((line) => line.trim())?.trim() ||
      role.description.trim();
    return {
      id: role.id,
      title: role.organization || role.title || "Role",
      line: [role.title, formatHistoryPeriod(role.startDate, role.endDate, role.isCurrent)].filter(Boolean).join(" · "),
      text: told || "Nothing written for this role yet.",
    };
  });
}

function storyMissing(roles: WorkMapRole[]): string[] {
  const gaps = [
    { label: "skills", count: roles.filter((role) => role.details.skills.length === 0).length },
    { label: "milestones", count: roles.filter((role) => role.details.milestones.length === 0).length },
    { label: "a workplace", count: roles.filter((role) => !roleHasPlace(role)).length },
    { label: "a photo", count: roles.filter((role) => !roleCoverPhoto(role.media)).length },
    {
      label: "what you did",
      count: roles.filter((role) => {
        const told =
          role.details.summary.trim() ||
          role.achievements.find((line) => line.trim())?.trim() ||
          role.description.trim();
        return !told;
      }).length,
    },
  ];
  return gaps
    .filter((gap) => gap.count > 0)
    .map((gap) => `${gap.label} on ${gap.count} ${gap.count === 1 ? "role" : "roles"}`);
}

type LiveUpdate = {
  id: string;
  organization: string;
  kind: string;
  text: string;
  stamp: string;
  frame: string;
  when: string;
  ownDate: boolean;
};

export function liveUpdates(roles: WorkMapRole[], now = new Date()): LiveUpdate[] {
  return roles.flatMap((role) => {
    const organization = role.organization || role.title || "Role";
    const frame = formatHistoryPeriod(role.startDate, role.endDate, role.isCurrent);
    const stamp = inboxStamp(role.startDate, now);
    const items: LiveUpdate[] = [];
    const summary = role.details.summary.trim();
    if (summary) {
      items.push({
        id: `${role.id}-now`,
        organization,
        kind: "Now",
        text: summary,
        stamp,
        frame,
        when: role.startDate,
        ownDate: false,
      });
    }
    const moments = [
      ...role.details.events.map((item) => ({ ...item, kind: "Event" })),
      ...role.details.milestones.map((item) => ({ ...item, kind: "Milestone" })),
      ...role.details.notes.map((item) => ({ ...item, kind: "Note" })),
    ].sort((a, b) => b.date.localeCompare(a.date));
    for (const moment of moments) {
      const text = [moment.title, moment.detail].filter(Boolean).join(" — ");
      if (!text) continue;
      const when = inboxStamp(moment.date, now);
      items.push({
        id: moment.id,
        organization,
        kind: moment.kind,
        text,
        stamp: when || stamp,
        frame: when || frame,
        when: moment.date,
        ownDate: Boolean(when),
      });
    }
    role.achievements.forEach((text, index) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      items.push({
        id: `${role.id}-done-${index}`,
        organization,
        kind: "Achievement",
        text: trimmed,
        stamp,
        frame,
        when: role.startDate,
        ownDate: false,
      });
    });
    return items;
  });
}

function inboxStamp(value: string, now = new Date()): string {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(value.trim());
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = match[3] ? Number(match[3]) : null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const label = months[month];
  if (!label) return "";
  if (year === now.getFullYear()) return day && day !== 1 ? `${label} ${day}` : label;
  return day && day !== 1 ? `${label} ${day}, ${year}` : `${label} ${year}`;
}

function roleHasPlace(role: WorkMapRole): boolean {
  return role.locations.some(
    (location) => Number.isFinite(location.latitude) && Number.isFinite(location.longitude),
  );
}
