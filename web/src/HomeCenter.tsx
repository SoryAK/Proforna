import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@astryxdesign/core/Icon";
import { ScrollableArea } from "@astryxdesign/core/ScrollableArea";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { formatHistoryPeriod, presentCareerHistoryStats } from "@core/career-history";
import type { MapSettings } from "@core/map-settings";
import { roleCoverPhoto, type WorkMapRole } from "@core/work-map";
import { Image, LayoutGrid, Map as MapIcon } from "lucide-react";
import { CareerMap } from "./CareerMap";
import type { MapFitMode } from "./map-camera";
import "./home-center.css";

export function HomeCenter({
  revision = 0,
  focusRoleId,
  onSelectRole,
  viewRequest = null,
}: {
  revision?: number;
  focusRoleId: string | null;
  onSelectRole: (id: string) => void;
  viewRequest?: { id: number; updates: boolean; updateId: string | null } | null;
}) {
  const [roles, setRoles] = useState<WorkMapRole[]>([]);
  const [settings, setSettings] = useState<MapSettings | null>(null);
  const [view, setView] = useState<CenterView>("story");
  const [updateId, setUpdateId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [recentLens, setRecentLens] = useState<RecentLens>("recent");
  const [recentQuery, setRecentQuery] = useState("");
  const galleryHost = useGalleryHost();

  useEffect(() => {
    if (!viewRequest) return;
    setView("story");
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
  const recentNeedle = recentQuery.trim().toLowerCase();
  const recentShown = recentNeedle
    ? recentItems.filter((item) =>
        [item.kind, item.organization, item.text, item.stamp].join(" ").toLowerCase().includes(recentNeedle),
      )
    : recentItems;
  const mediaRoles = focus ? [focus] : roles;
  const covers = mediaRoles.flatMap((role) => {
    const photo = roleCoverPhoto(role.media);
    return photo
      ? [{ ...photo, roleId: role.id, organization: role.organization || role.title }]
      : [];
  });
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
        aria-label={view === "map" ? "Map" : "Career story"}
      >
        <div className="home-center-bar" role="tablist" aria-label="Card views">
          <div className="home-center-tabs">
            <button type="button" role="tab" aria-selected={view === "story"} onClick={() => chooseStage("story")}>
              <Icon icon={LayoutGrid} size="sm" />
              Story
            </button>
            <button type="button" role="tab" aria-selected={view === "map"} onClick={() => chooseStage("map")}>
              <Icon icon={MapIcon} size="sm" />
              Map
            </button>
          </div>
          <div className="home-center-pub" />
        </div>
        <div className="home-center-stage">
          <div className="home-story-layout">
            {view === "map" ? (
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
                      width="100%"
                      hasClear
                      startIcon={MagnifyingGlassIcon}
                      value={recentQuery}
                      onChange={setRecentQuery}
                    />
                  </div>
                  <ScrollableArea className="home-story-recent-scroll" label={recentLensLabel(recentLens)}>
                    <div className="home-story-panel home-story-recent-card">
                      {openUpdate ? (
                        <article>
                          <button type="button" onClick={() => setUpdateId(null)}>
                            {recentLensLabel(recentLens)}
                          </button>
                          <strong>
                            {openUpdate.organization}
                            {openUpdate.kind ? ` · ${openUpdate.kind}` : ""}
                          </strong>
                          {openUpdate.frame ? <time dateTime={openUpdate.when}>{openUpdate.frame}</time> : null}
                          <p>{openUpdate.text}</p>
                        </article>
                      ) : recentShown.length > 0 ? (
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
                        <p>{recentNeedle ? "No matches." : recentEmpty(recentLens, focus)}</p>
                      )}
                    </div>
                  </ScrollableArea>
                </section>
          </div>
        </div>
      </main>
      {galleryHost
        ? createPortal(
            <>
              <button
                type="button"
                className={galleryOpen ? "home-nav-item is-current" : "home-nav-item"}
                aria-expanded={galleryOpen}
                onClick={() => setGalleryOpen((open) => !open)}
              >
                <Icon icon={Image} size="sm" />
                Gallery
              </button>
              {galleryOpen ? (
                <div className="home-center-gallery">
                  {covers.length > 0 ? (
                    <div className="home-center-photos">
                      {covers.map((item) => (
                        <Thumbnail
                          key={item.id}
                          className="home-center-thumb"
                          src={item.url}
                          alt={item.organization || item.title || "Photo"}
                          label={item.organization || item.title || "Photo"}
                          onClick={() => onSelectRole(item.roleId)}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="home-center-empty">No photos yet.</p>
                  )}
                </div>
              ) : null}
            </>,
            galleryHost,
          )
        : null}
    </div>
  );
}

function useGalleryHost() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const sheet = document.querySelector(".home-sheet");
    if (!sheet) return;
    function place() {
      const history = sheet.querySelector(".home-history");
      const menu = history?.querySelector(".home-nav-main");
      if (!(menu instanceof HTMLElement) || history?.querySelector(".pch")) {
        setHost(null);
        return;
      }
      setHost((current) => (current === menu ? current : menu));
    }
    place();
    const observer = new MutationObserver(place);
    observer.observe(sheet, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return host;
}

type CenterView = "story" | "map";
type RecentLens = "recent" | "notes" | "milestones";

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
