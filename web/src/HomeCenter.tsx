import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { careerMonth, rolesToConfirmCurrent } from "@core/career-timeline";
import type { MapSettings } from "@core/map-settings";
import type { RelayStatus } from "@core/projection";
import { roleCoverPhoto, type WorkMapRole } from "@core/work-map";
import { ArrowLeft } from "lucide-react";
import { CareerMap } from "./CareerMap";
import type { MapFitMode } from "./map-camera";
import { useRelayStatus } from "./relay-status";
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
  const relay = useRelayStatus(revision);

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
          <div className="home-center-tabs">
            {pageContent ? null : view === "map" ? (
              <>
                <button type="button" className="home-center-back" onClick={() => chooseStage("story")}>
                  <Icon icon={ArrowLeft} size="sm" />
                  Story
                </button>
                <h1 className="home-center-title">Map</h1>
              </>
            ) : (
              <h1 className="home-center-title">Story</h1>
            )}
          </div>
          <div className="home-center-actions">
            <RelayState status={relay} />
            <div className="home-center-pub" />
          </div>
        </div>
        <div className="home-center-stage" id="home-center-panel">
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
                  <article className="home-story-stat">
                    <span>Places</span>
                    <strong>{placed.length}</strong>
                  </article>
                  <section className="home-story-panel home-story-timeline" aria-label="Career timeline">
                    <h2>Career timeline</h2>
                    <StoryTimeline roles={roles} now={now} onSelect={onSelectRole} />
                  </section>
                  <section className="home-story-panel home-story-highlights" aria-label="Highlights">
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
                  <section className="home-story-panel home-story-mapcard" aria-label="Map">
                    <h2>Map</h2>
                    <div className="home-story-map">
                      <CareerMap
                        emptyNote={
                          placed.length === 0
                            ? { title: "No places yet.", detail: "Roles with a workplace show up here." }
                            : null
                        }
                        fitKey={`card:${focusRoleId ?? "all"}:${mapFit}:${placed.map((role) => role.id).join(",")}`}
                        fitMode={mapFit}
                        onSelect={onSelectRole}
                        roles={roles}
                        selectedId={focusRoleId}
                        settings={settings}
                        viewKey="home-story-card"
                      />
                    </div>
                    <div className="home-story-mapfoot">
                      <span>{placed.length === 1 ? "1 place" : `${placed.length} places`}</span>
                      <button type="button" onClick={() => chooseStage("map")}>
                        Open map
                      </button>
                    </div>
                  </section>
                  <section className="home-story-panel home-story-gaps" aria-label="Missing">
                    <h2>Missing</h2>
                    {story.missing.length > 0 ? (
                      <ul>
                        {story.missing.map((gap) => (
                          <li key={gap.label}>
                            <button type="button" onClick={() => onSelectRole(gap.roleId)}>
                              <span className="home-story-gap-box" aria-hidden="true" />
                              <span>{gap.label}</span>
                              <span className="home-story-gap-go" aria-hidden="true">›</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>The main pieces are here.</p>
                    )}
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

function RelayState({ status }: { status: RelayStatus | null }) {
  if (!status) return null;
  const since =
    status.state === "current" || status.state === "changed" ? inboxStamp(status.publishedAt) : "";
  const label =
    status.state === "private"
      ? "Private"
      : status.state === "unpublished"
        ? "Not published"
        : status.state === "current"
          ? "Relay up to date"
          : "Changes to publish";
  const title =
    status.state === "unpublished"
      ? "Not on the Relay yet"
      : status.state === "changed"
        ? [`Last published ${since}`, ...status.changes].join("\n")
        : since
          ? `Last published ${since}`
          : undefined;
  return (
    <p
      className={`home-center-relay is-${status.state}`}
      role="status"
      title={title}
    >
      <span className="home-center-relay-dot" aria-hidden="true" />
      {label}
    </p>
  );
}

function StoryTimeline({
  roles,
  now,
  onSelect,
}: {
  roles: WorkMapRole[];
  now: Date;
  onSelect: (id: string) => void;
}) {
  const nowIndex = now.getFullYear() * 12 + now.getMonth();
  const spans = roles
    .map((role) => {
      const start = monthIndex(role.startDate);
      if (start == null) return null;
      const end = role.isCurrent ? nowIndex : (monthIndex(role.endDate) ?? start);
      return { role, start, end: Math.max(start, end) };
    })
    .filter((span): span is { role: WorkMapRole; start: number; end: number } => span != null)
    .sort((left, right) => left.start - right.start);
  if (spans.length === 0) return <p>Add start dates to see the timeline.</p>;
  const first = Math.floor(spans[0].start / 12) * 12;
  const last = Math.max(nowIndex, ...spans.map((span) => span.end)) + 1;
  const width = Math.max(1, last - first);
  const lanes: number[] = [];
  const placed = spans.map((span) => {
    let lane = lanes.findIndex((end) => end < span.start);
    if (lane === -1) lane = lanes.length;
    lanes[lane] = span.end;
    return { ...span, lane };
  });
  const firstYear = first / 12;
  const lastYear = Math.floor((last - 1) / 12);
  const step = Math.max(1, Math.ceil((lastYear - firstYear) / 6));
  const years: number[] = [];
  for (let year = firstYear; year <= lastYear; year += step) years.push(year);
  return (
    <div className="home-story-timeline-track" style={{ height: `${lanes.length * 22 + 22}px` }}>
      {placed.map(({ role, start, end, lane }) => {
        const about = [role.organization, role.title, formatHistoryPeriod(role.startDate, role.endDate, role.isCurrent)]
          .filter(Boolean)
          .join(" · ");
        return (
          <button
            key={role.id}
            type="button"
            className={role.isCurrent ? "home-story-timeline-bar is-current" : "home-story-timeline-bar"}
            style={{
              left: `${((start - first) / width) * 100}%`,
              width: `max(0.5rem, ${((end - start + 1) / width) * 100}%)`,
              top: `${lane * 22}px`,
            }}
            title={about}
            aria-label={about}
            onClick={() => onSelect(role.id)}
          >
            <span className="home-story-timeline-label" aria-hidden="true">
              {role.organization || role.title || "Role"}
            </span>
          </button>
        );
      })}
      <div className="home-story-timeline-axis" aria-hidden="true">
        {years.map((year) => (
          <span key={year} style={{ left: `${((year * 12 - first) / width) * 100}%` }}>
            {year}
          </span>
        ))}
      </div>
    </div>
  );
}

function monthIndex(value: string): number | null {
  const month = careerMonth(value);
  if (!month) return null;
  const [year, part] = month.split("-").map(Number);
  return year * 12 + (part - 1);
}

type StoryGap = {
  label: string;
  roleId: string;
};

type StoryFeed = {
  jobs: number;
  roles: number;
  tenure: string;
  highlights: StoryHighlight[];
  missing: StoryGap[];
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

function storyMissing(roles: WorkMapRole[]): StoryGap[] {
  const unsure = rolesToConfirmCurrent(roles).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const check: StoryGap[] =
    unsure.length > 0
      ? [
          {
            label: `Check ${unsure.length === 1 ? "1 role is" : `${unsure.length} roles are`} still current`,
            roleId: unsure[0].id,
          },
        ]
      : [];
  const newest = roles.slice().sort((a, b) => b.startDate.localeCompare(a.startDate));
  const gaps = [
    { verb: "Add skills to", lacks: (role: WorkMapRole) => role.details.skills.length === 0 },
    { verb: "Add milestones to", lacks: (role: WorkMapRole) => role.details.milestones.length === 0 },
    { verb: "Add a workplace to", lacks: (role: WorkMapRole) => !roleHasPlace(role) },
    { verb: "Add a photo to", lacks: (role: WorkMapRole) => !roleCoverPhoto(role.media) },
    {
      verb: "Write what you did for",
      lacks: (role: WorkMapRole) =>
        !(
          role.details.summary.trim() ||
          role.achievements.find((line) => line.trim())?.trim() ||
          role.description.trim()
        ),
    },
  ];
  return [
    ...check,
    ...gaps.flatMap((gap) => {
      const lacking = newest.filter(gap.lacks);
      if (lacking.length === 0) return [];
      return [
        {
          label: `${gap.verb} ${lacking.length} ${lacking.length === 1 ? "role" : "roles"}`,
          roleId: lacking[0].id,
        },
      ];
    }),
  ];
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
