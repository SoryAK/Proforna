import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { CareerFile } from "@core/career-file";
import {
  CAREER_HISTORY_SECTIONS,
  classifyCareerHistorySection,
  formatHistoryGist,
  formatHistoryPeriod,
  formatHistoryPlace,
  formatTenureMonths,
  groupCareerHistory,
  presentCareerHistoryStats,
  searchCareerHistory,
  tenureMonths,
  sortCareerHistory,
  type CareerHistoryItem,
  type CareerHistorySectionKey,
} from "@core/career-history";
import {
  publicationAllowsSnapshot,
  publicationNeedsAudienceConfirm,
  roleCoverPhoto,
  type WorkMapPublicationSettings,
  type WorkMapPublishSection,
  type WorkMapRole,
} from "@core/work-map";
import {
  careerFrame,
  careerMoments,
  careerMonth,
  careerSpan,
  nextCareerMoment,
  rolesStartedBy,
  type CareerTimelineResidence,
  type CareerTimelineRole,
} from "@core/career-timeline";
import { CareerTimelineScrubber } from "./CareerTimelineScrubber";
import { residenceForMap, type Residence } from "@core/residence";
import { HomesPanel } from "./HomesPanel";
import { WorkMapCanvas, type WorkMapHome } from "./WorkMapCanvas";
import { GoogleWorkMap } from "./GoogleWorkMap";
import { DEFAULT_MAP_ICONS, MAP_THEMES, type MapSettings } from "@core/map-settings";
import { lookupNote, reversePlace } from "./place-search";
import { RoleDetailPanel, type DetailTab } from "./RoleDetailPanel";
import "./work-map.css";

type WorkMapResponse = {
  profile: {
    fullName: string;
    headline: string;
    address: string;
    addressLatitude: number | null;
    addressLongitude: number | null;
    city: string;
    state: string;
    bio: string;
    avatarUrl: string | null;
  };
  roles: WorkMapRole[];
  skills: string[];
  settings: WorkMapPublicationSettings;
  residences: Residence[];
  stats: {
    roles: number;
    education: number;
    mapped: number;
    publicMedia: number;
  };
};

type Publication = {
  id: string;
  slug: string;
  status: string;
  createdAt: string;
  analytics: { events: number; accessRequests: number };
};

export function WorkMap({
  fallbackCareer: _fallbackCareer,
  error,
  focusRoleId,
  onHome,
  mapRevision = 0,
}: {
  fallbackCareer: CareerFile;
  error: string | null;
  focusRoleId?: string | null;
  onHome: () => void;
  mapRevision?: number;
}) {
  const [data, setData] = useState<WorkMapResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    focusRoleId ?? null,
  );
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [closedSections, setClosedSections] = useState<
    Set<CareerHistorySectionKey>
  >(new Set());
  const [view, setView] = useState<"map" | "timeline">("map");
  const [timelineMonth, setTimelineMonth] = useState(currentCareerMonth);
  const [timelinePlaying, setTimelinePlaying] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [placingForId, setPlacingForId] = useState<string | null>(null);
  const [placingLocationId, setPlacingLocationId] = useState<string | null>(
    null,
  );
  const [pendingPlacement, setPendingPlacement] = useState<{
    roleId: string;
    locationId?: string;
    latitude: number;
    longitude: number;
    address?: string;
  } | null>(null);
  const [settings, setSettings] =
    useState<WorkMapPublicationSettings | null>(null);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [mapSettings, setMapSettings] = useState<MapSettings | null>(null);
  const [message, setMessage] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [creatingKind, setCreatingKind] =
    useState<CareerHistorySectionKey | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("story");
  const [homesOpen, setHomesOpen] = useState(false);
  const [mapOverride, setMapOverride] = useState<"auto" | "show" | "hide">(
    "auto",
  );

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    void fetch("/api/maps")
      .then(async (response) => {
        const body = (await response.json()) as { settings?: MapSettings };
        if (body.settings) setMapSettings(body.settings);
      })
      .catch(() => setMapSettings(null));
  }, [mapRevision]);

  useEffect(() => {
    if (focusRoleId) setSelectedId(focusRoleId);
  }, [focusRoleId]);

  useEffect(() => {
    setDetailTab("story");
    setMapOverride("auto");
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || !data) return;
    const role = data.roles.find((entry) => entry.id === selectedId);
    if (!role) return;
    const section = classifyCareerHistorySection(role);
    setClosedSections((current) => {
      if (!current.has(section)) return current;
      const next = new Set(current);
      next.delete(section);
      return next;
    });
  }, [data, selectedId]);

  async function load() {
    const [mapResponse, publicationResponse] = await Promise.all([
      fetch("/api/work-map"),
      fetch("/api/projections"),
    ]);
    if (!mapResponse.ok) {
      setMessage("Career History could not be loaded.");
      return;
    }
    const next = (await mapResponse.json()) as WorkMapResponse;
    setData(next);
    setSettings(next.settings);
    setSelectedId((current) =>
      current && next.roles.some((role) => role.id === current)
        ? current
        : null,
    );
    if (publicationResponse.ok) {
      const body = (await publicationResponse.json()) as {
        projections: Publication[];
      };
      setPublications(body.projections);
    }
  }

  const historyItems = useMemo(() => {
    if (!data) return [];
    return sortCareerHistory(
      searchCareerHistory(data.roles.map(asHistoryItem), search),
      sort,
    );
  }, [data, search, sort]);
  const groups = useMemo(() => groupCareerHistory(historyItems), [historyItems]);
  const stats = useMemo(
    () => presentCareerHistoryStats(data?.roles.map(asHistoryItem) ?? []),
    [data],
  );
  const visibleRoles = useMemo(() => {
    if (!data) return [];
    const byId = new Map(data.roles.map((role) => [role.id, role]));
    return historyItems
      .map((item) => byId.get(item.id))
      .filter((role): role is WorkMapRole => Boolean(role));
  }, [data, historyItems]);
  const timelineRoles = useMemo(
    () => visibleRoles.map(asTimelineRole),
    [visibleRoles],
  );
  const timelineResidences = useMemo(
    () => (data?.residences ?? []).map(asTimelineResidence),
    [data],
  );
  const timelineMoments = useMemo(
    () => careerMoments(timelineRoles, timelineResidences),
    [timelineRoles, timelineResidences],
  );
  const timelineMonths = useMemo(
    () => careerSpan(timelineRoles, timelineMoments, currentCareerMonth()),
    [timelineRoles, timelineMoments],
  );
  const timelineActive = view === "timeline" && !placingForId;
  const shownMonth = timelineMonths.includes(timelineMonth)
    ? timelineMonth
    : (timelineMonths.at(-1) ?? timelineMonth);
  const timelineReading = useMemo(
    () => careerFrame(timelineRoles, timelineMoments, shownMonth, timelineResidences),
    [timelineRoles, timelineMoments, shownMonth, timelineResidences],
  );
  const mapRoles = timelineActive
    ? visibleRoles.filter((role) =>
        rolesStartedBy(timelineRoles, shownMonth).some((item) => item.id === role.id),
      )
    : visibleRoles;

  useEffect(() => {
    if (!timelinePlaying || !timelineActive) return;
    const timer = window.setInterval(() => {
      const upcoming = nextCareerMoment(timelineMoments, shownMonth);
      if (!upcoming) {
        setTimelinePlaying(false);
        return;
      }
      setTimelineMonth(upcoming.at);
    }, 900);
    return () => window.clearInterval(timer);
  }, [timelinePlaying, timelineActive, timelineMoments, shownMonth]);

  const selected = data?.roles.find((role) => role.id === selectedId) ?? null;
  const latest = publications.find(
    (publication) => publication.slug === settings?.slug,
  );

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    const response = await fetch("/api/work-map/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (!response.ok) {
      setMessage("Could not save publication settings.");
      return;
    }
    setSettingsOpen(false);
    setMessage("Publication settings saved.");
    await load();
  }

  function selectFromMap(id: string) {
    setSelectedId(id);
    if (view !== "timeline" || placingForId) return;
    const role = data?.roles.find((entry) => entry.id === id);
    const start = role ? careerMonth(role.startDate) : null;
    if (!start) return;
    setTimelinePlaying(false);
    setTimelineMonth(start);
  }

  function openSettings() {
    setConfirmOpen(false);
    setSettingsOpen(true);
  }

  function requestPublish() {
    if (!settings) return;
    if (
      publicationNeedsAudienceConfirm({
        visibility: settings.visibility,
        liveStatus: latest?.status,
      })
    ) {
      setSettingsOpen(false);
      setConfirmOpen(true);
      return;
    }
    void publish();
  }

  async function publish() {
    if (!settings) return;
    setPublishing(true);
    setMessage("");
    const settingsResponse = await fetch("/api/work-map/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (!settingsResponse.ok) {
      setPublishing(false);
      setMessage("Save valid publication settings before publishing.");
      return;
    }
    const response = await fetch("/api/work-map/publish", { method: "POST" });
    setPublishing(false);
    if (response.ok) {
      setMessage(
        "Published this Work Map snapshot to the public link. Private edits stay local until you publish an update.",
      );
      await load();
    } else {
      const body = (await response.json()) as { error?: string };
      setMessage(body.error ?? "The Work Map could not be published.");
    }
  }

  async function addRole(kind: CareerHistorySectionKey) {
    setCreatingKind(kind);
    setSettingsOpen(false);
    setMessage("");
    const response = await fetch("/api/work-map/roles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    setCreatingKind(null);
    if (!response.ok) {
      setMessage("Could not add that role.");
      return;
    }
    const body = (await response.json()) as { role: { id: string } };
    setClosedSections((current) => {
      const next = new Set(current);
      next.delete(kind);
      return next;
    });
    setSelectedId(body.role.id);
    await load();
  }

  async function revoke() {
    if (!latest) return;
    const response = await fetch(`/api/projections/${latest.id}/revoke`, {
      method: "POST",
    });
    setMessage(response.ok ? "Public Work Map revoked." : "Could not revoke it.");
    await load();
  }

  if (!data) {
    return (
      <section className="work-map-loading">
        <h1>Career History</h1>
        <p>{message || error || "Loading career history…"}</p>
      </section>
    );
  }

  const empty = data.roles.length === 0;
  const recordOpen = Boolean(selected);
  const mapVisible = placingForId ? true : mapOverride !== "hide";
  const publishLabel = publishing
    ? "Publishing…"
    : latest?.status === "published"
      ? "Update"
      : "Publish";

  function chooseDetailTab(next: DetailTab) {
    setDetailTab(next);
    setMapOverride("auto");
  }

  function dropPin(latitude: number, longitude: number) {
    const roleId = placingForId;
    const locationId = placingLocationId ?? undefined;
    if (!roleId) return;
    setPendingPlacement({ roleId, locationId, latitude, longitude });
    setSelectedId(roleId);
    setPlacingForId(null);
    setPlacingLocationId(null);
    void reversePlace(latitude, longitude)
      .then((found) => {
        if (!found) return;
        const note = lookupNote(found);
        if (note) setMessage(note);
        const address = found.place?.address;
        if (!address) return;
        setPendingPlacement((current) =>
          current &&
          current.roleId === roleId &&
          current.latitude === latitude &&
          current.longitude === longitude
            ? { ...current, address }
            : current,
        );
      })
      .catch(() => undefined);
  }

  return (
    <section className="work-map">
      {message ? (
        <p className="work-map-message" role="status">
          {message}
        </p>
      ) : null}

      <div
        className={[
          "work-map-layout",
          mapVisible ? "is-map" : "is-record",
        ].join(" ")}
      >
        <div className="work-map-float">
          <CareerBio profile={data.profile} onHome={onHome} />
          {recordOpen && selected ? (
          <RoleDetailPanel
            role={selected}
            tab={detailTab}
            onTab={chooseDetailTab}
            mapVisible={mapVisible}
            onToggleMap={() => setMapOverride(mapVisible ? "hide" : "show")}
            onClose={() => setSelectedId(null)}
            onSaved={load}
            placement={
              pendingPlacement?.roleId === selected.id ? pendingPlacement : null
            }
            onStartPlacement={(locationId) => {
              setDetailTab("places");
              setMapOverride("show");
              setView("map");
              setPlacingForId(selected.id);
              setPlacingLocationId(locationId ?? null);
            }}
            onLocationSaved={() => setPendingPlacement(null)}
          />
        ) : (
        <aside className="work-map-ledger">
          <header className="history-panel-head">
            <h2>Career History</h2>
            <div className="history-publish">
              <span
                title={
                  latest
                    ? `${latest.analytics.events} events · ${latest.analytics.accessRequests} requests`
                    : "Nothing leaves the vault until you publish"
                }
              >
                {latest?.status === "published"
                  ? "Published"
                  : latest?.status === "revoked"
                    ? "Revoked"
                    : "Private"}
              </span>
              <button
                className="history-icon"
                type="button"
                aria-expanded={homesOpen}
                aria-label={`Homes (${data.residences.length})`}
                title={`Homes (${data.residences.length})`}
                onClick={() => setHomesOpen((open) => !open)}
              >
                <HomesIcon />
              </button>
              <button
                className="history-icon"
                type="button"
                aria-label="Settings"
                title="Settings"
                onClick={openSettings}
              >
                <SettingsIcon />
              </button>
              <button
                className="history-icon"
                disabled={publishing}
                type="button"
                aria-label={publishLabel}
                title={publishLabel}
                onClick={requestPublish}
              >
                <PublishIcon />
              </button>
              {latest?.status === "published" ? (
                <button className="is-danger" type="button" onClick={revoke}>
                  Revoke
                </button>
              ) : null}
            </div>
          </header>
          <div className="work-map-stats">
            <div>
              <span>Total Tenure</span>
              <strong>{stats.tenure || "—"}</strong>
            </div>
            <div>
              <span>Roles</span>
              <strong>{stats.roles}</strong>
            </div>
            <div>
              <span>Miles Traveled</span>
              <strong>{stats.miles}</strong>
            </div>
            <div>
              <span>Cities</span>
              <strong>{stats.cities}</strong>
            </div>
          </div>
          <div className="work-map-tools">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search…"
              aria-label="Search career history"
            />
            <label className="work-map-sort">
              <span>Sort</span>
              <select
                value={sort}
                onChange={(event) =>
                  setSort(event.target.value === "oldest" ? "oldest" : "newest")
                }
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>
            </label>
          </div>
          {homesOpen ? (
            <HomesPanel
              residences={data.residences}
              activeId={homePin(data.residences, selected)?.id ?? null}
              onChanged={load}
            />
          ) : null}
          <div className="work-map-role-list">
            {empty ? (
              <p>Import a resume, or add a role to a section.</p>
            ) : null}
            {CAREER_HISTORY_SECTIONS.map((section) => {
              const items =
                groups.find((group) => group.key === section.key)?.items ?? [];
              const open = !closedSections.has(section.key);
              return (
                <section key={section.key}>
                  <div className="history-cat-row">
                    <button
                      type="button"
                      className="history-cat"
                      aria-expanded={open}
                      onClick={() =>
                        setClosedSections((current) => {
                          const next = new Set(current);
                          if (next.has(section.key)) next.delete(section.key);
                          else next.add(section.key);
                          return next;
                        })
                      }
                    >
                      <b>{section.label}</b>
                      <em>({items.length})</em>
                      <span aria-hidden="true">{open ? "▾" : "▸"}</span>
                    </button>
                    <button
                      aria-busy={creatingKind === section.key}
                      aria-label={sectionAddLabel(section.key)}
                      className="history-add"
                      disabled={creatingKind !== null}
                      onClick={() => void addRole(section.key)}
                      type="button"
                    >
                      +
                    </button>
                  </div>
                  {open
                    ? items.map((item) => (
                        <button
                          className="career-history-row"
                          key={item.id}
                          onClick={() => setSelectedId(item.id)}
                          type="button"
                        >
                          <span>
                            <strong>
                              {item.organization || item.title || "Untitled"}
                              {item.isCurrent ? (
                                <mark>Current</mark>
                              ) : null}
                            </strong>
                              {item.organization && item.title ? (
                              <b>{item.title}</b>
                            ) : null}
                            {formatHistoryGist(item) ? (
                              <small>{formatHistoryGist(item)}</small>
                            ) : null}
                          </span>
                        </button>
                      ))
                    : null}
                </section>
              );
            })}
            {!empty && historyItems.length === 0 ? (
              <p>No roles match that search.</p>
            ) : null}
          </div>
        </aside>
        )}
        </div>

        {mapVisible ? (
        <main className="work-map-stage">
          <div className="work-map-view-switch" aria-label="Career History view">
            <button
              className={view === "map" ? "is-active" : ""}
              onClick={() => setView("map")}
              type="button"
            >
              Map
            </button>
            <button
              className={view === "timeline" ? "is-active" : ""}
              onClick={() => setView("timeline")}
              type="button"
            >
              Timeline
            </button>
          </div>
          {mapSettings?.provider === "google" && mapSettings.googleMapsApiKey ? (
            <GoogleWorkMap
              apiKey={mapSettings.googleMapsApiKey}
              roles={mapRoles}
              home={
                timelineActive
                  ? homePinForTimeline(data.residences, timelineReading.home)
                  : homePin(data.residences, selected)
              }
              selectedId={timelineActive ? null : selectedId}
              holdView={timelineActive}
              suppressEmpty={timelineActive}
              onSelect={selectFromMap}
              onMapClick={placingForId ? dropPin : undefined}
              pinIcons={mapSettings?.icons ?? DEFAULT_MAP_ICONS}
              pinTheme={MAP_THEMES[mapSettings?.theme ?? "kind"]}
            />
          ) : (
            <WorkMapCanvas
              roles={mapRoles}
              home={
                timelineActive
                  ? homePinForTimeline(data.residences, timelineReading.home)
                  : homePin(data.residences, selected)
              }
              selectedId={timelineActive ? null : selectedId}
              holdView={timelineActive}
              suppressEmpty={timelineActive}
              onSelect={selectFromMap}
              onMapClick={placingForId ? dropPin : undefined}
              pinIcons={mapSettings?.icons ?? DEFAULT_MAP_ICONS}
              pinTheme={MAP_THEMES[mapSettings?.theme ?? "kind"]}
            />
          )}
          {timelineActive && timelineMonths.length > 0 ? (
            <CareerTimelineScrubber
              frame={timelineReading}
              month={shownMonth}
              moments={timelineMoments}
              months={timelineMonths}
              onMonth={(next) => {
                setTimelinePlaying(false);
                setTimelineMonth(next);
              }}
              onPlay={() => {
                const upcoming = nextCareerMoment(timelineMoments, shownMonth);
                if (!upcoming) {
                  const first = timelineMoments[0];
                  if (first) setTimelineMonth(first.at);
                }
                setTimelinePlaying((value) => !value);
              }}
              playing={timelinePlaying}
            />
          ) : null}
          {placingForId ? (
            <div className="map-placement-banner" role="status">
              <strong>Place this work site</strong>
              <span>Click its location on the map.</span>
              <button
                type="button"
                onClick={() => {
                  setPlacingForId(null);
                  setPlacingLocationId(null);
                }}
              >
                Cancel
              </button>
            </div>
          ) : null}
        </main>
        ) : selected ? (
          <RoleSheet role={selected} tab={detailTab} />
        ) : null}

        {settingsOpen && settings ? (
          <>
            <button
              className="publication-settings-backdrop"
              type="button"
              aria-label="Close publication settings"
              onClick={() => setSettingsOpen(false)}
            />
            <PublicationSettings
              settings={settings}
              onChange={setSettings}
              onClose={() => setSettingsOpen(false)}
              onSubmit={saveSettings}
            />
          </>
        ) : null}
        {confirmOpen && settings ? (
          <>
            <button
              className="publication-settings-backdrop"
              type="button"
              aria-label="Close publish confirmation"
              onClick={() => setConfirmOpen(false)}
            />
            <PublishConfirm
              publishing={publishing}
              visibility={settings.visibility}
              onClose={() => setConfirmOpen(false)}
              onOpenSettings={openSettings}
              onPublish={() => {
                setConfirmOpen(false);
                void publish();
              }}
            />
          </>
        ) : null}
      </div>
    </section>
  );
}

function homePin(
  residences: Residence[],
  role: WorkMapRole | null,
): (WorkMapHome & { id: string }) | null {
  const residence = residenceForMap(residences, role);
  return residence ? toHomePin(residence) : null;
}

function homePinForTimeline(
  residences: Residence[],
  home: CareerTimelineResidence | null,
): (WorkMapHome & { id: string }) | null {
  if (home) {
    if (!home.pinned) return null;
    const residence = residences.find((item) => item.id === home.id);
    return residence ? toHomePin(residence) : null;
  }
  return homePin(
    residences.filter((item) => !careerMonth(item.startDate ?? "")),
    null,
  );
}

function toHomePin(residence: Residence): (WorkMapHome & { id: string }) | null {
  if (residence.latitude == null || residence.longitude == null) return null;
  const span = residence.endDate
    ? `${residence.startDate ?? "Start"} – ${residence.endDate}`
    : residence.startDate
      ? `${residence.startDate} – Present`
      : "";
  return {
    id: residence.id,
    latitude: residence.latitude,
    longitude: residence.longitude,
    label: residence.label,
    detail: [residence.address, span].filter(Boolean).join(" · "),
  };
}

function CareerBio({
  profile,
  onHome,
}: {
  profile: WorkMapResponse["profile"];
  onHome: () => void;
}) {
  const place = [
    profile.address,
    [profile.city, profile.state].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(", ");
  const initials = profile.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();

  return (
    <section className="career-bio" aria-label="Profile">
      <button className="career-bio-home" type="button" onClick={onHome}>
        Home
      </button>
      <div className="career-bio-row">
        {profile.avatarUrl ? (
          <img src={profile.avatarUrl} alt="" />
        ) : (
          <span className="career-bio-mark" aria-hidden="true">
            {initials || "P"}
          </span>
        )}
        <div>
          <h2>{profile.fullName || "Career"}</h2>
          {profile.headline ? <p>{profile.headline}</p> : null}
          {place ? <p className="career-bio-place">{place}</p> : null}
          {profile.bio ? <p className="career-bio-about">{profile.bio}</p> : null}
        </div>
      </div>
    </section>
  );
}

function RoleSheet({
  role,
  tab,
}: {
  role: WorkMapRole;
  tab: DetailTab;
}) {
  const place = formatHistoryPlace({
    organization: role.organization,
    locationLabel: role.locationLabel,
    locations: role.locations.map((location) => ({
      address: location.address,
    })),
  });
  const period = formatHistoryPeriod(role.startDate, role.endDate, role.isCurrent);
  const tenure = formatTenureMonths(
    tenureMonths(role.startDate, role.endDate, role.isCurrent),
  );
  const cover = roleCoverPhoto(role.media);
  return (
    <article className="role-sheet" aria-label="Role record">
      <section className="role-focus">
        {cover ? (
          <div className="role-focus-photo">
            <img src={cover.url} alt="" />
          </div>
        ) : null}
        <div className="role-focus-body">
          <h2>{role.organization || "Untitled"}</h2>
          {role.title ? <p className="role-focus-title">{role.title}</p> : null}
          {place || period ? (
            <p className="role-focus-meta">
              {place ? <span>{place}</span> : null}
              {place && period ? <span aria-hidden="true">·</span> : null}
              {period ? <span>{period}</span> : null}
              {role.isCurrent ? <span className="role-focus-current">current</span> : null}
              {tenure ? <span className="role-focus-tenure">({tenure})</span> : null}
            </p>
          ) : null}
        </div>
      </section>
      {tab === "story" ? <StorySheet role={role} /> : null}
      {tab === "conditions" ? <ConditionsSheet role={role} /> : null}
      {tab === "media" ? <MediaSheet role={role} /> : null}
    </article>
  );
}

function StorySheet({ role }: { role: WorkMapRole }) {
  const story = role.description.trim();
  return (
    <>
      <h3 className="role-sheet-kicker">Story</h3>
      {story ? (
        <p className="role-sheet-body">{story}</p>
      ) : (
        <p className="role-sheet-empty">No story written for this role yet.</p>
      )}
      {role.achievements.length > 0 ? (
        <>
          <h3 className="role-sheet-kicker">Achievements</h3>
          <ul>
            {role.achievements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}

function ConditionsSheet({ role }: { role: WorkMapRole }) {
  const details = role.details;
  const rows = [
    details.schedule.shift,
    details.schedule.workMode,
    details.schedule.hoursPerWeek
      ? `${details.schedule.hoursPerWeek} hours / week`
      : "",
    details.environment,
    details.paidTimeOff,
    details.uniform,
    details.equipment.join(", "),
    details.benefits.join(", "),
  ].filter(Boolean);

  return (
    <>
      <h3 className="role-sheet-kicker">Conditions</h3>
      {rows.length > 0 ? (
        <ul>
          {rows.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="role-sheet-empty">
          Conditions stay on this role until you write them. They remain private
          unless you approve a field for publishing.
        </p>
      )}
    </>
  );
}

function MediaSheet({ role }: { role: WorkMapRole }) {
  return (
    <>
      <h3 className="role-sheet-kicker">Media</h3>
      {role.media.length > 0 ? (
        <ul>
          {role.media.map((item) => (
            <li key={item.id}>
              {item.kind === "photo" ? <img src={item.url} alt="" /> : null}
              {item.title}
              {item.caption ? ` — ${item.caption}` : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className="role-sheet-empty">No media attached to this role yet.</p>
      )}
    </>
  );
}

function PublicationSettings({
  settings,
  onChange,
  onClose,
  onSubmit,
}: {
  settings: WorkMapPublicationSettings;
  onChange: (settings: WorkMapPublicationSettings) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const sections: Array<[WorkMapPublishSection, string]> = [
    ["profile", "Profile and bio"],
    ["history", "Career history"],
    ["map", "Approved locations"],
    ["milestones", "Milestones and events"],
    ["media", "Approved galleries"],
    ["skills", "Skills"],
    ["contact", "Contact and inbound opportunities"],
  ];

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside className="publication-settings" role="dialog" aria-label="Publication settings">
      <header>
        <div>
          <h2>Publication settings</h2>
          <p>These settings shape the immutable snapshot sent to the relay.</p>
        </div>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>
      <form onSubmit={onSubmit}>
        <div className="publication-fields">
          <label>
            Public slug
            <input
              value={settings.slug}
              onChange={(event) =>
                onChange({ ...settings, slug: event.target.value })
              }
            />
          </label>
          <label>
            Target role
            <input
              value={settings.targetRole}
              onChange={(event) =>
                onChange({ ...settings, targetRole: event.target.value })
              }
            />
          </label>
          <label>
            Visibility
            <select
              value={settings.visibility}
              onChange={(event) =>
                onChange({
                  ...settings,
                  visibility: event.target
                    .value as WorkMapPublicationSettings["visibility"],
                })
              }
            >
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
              <option value="access-controlled">Access controlled</option>
              <option value="stealth">Stealth — hide identity</option>
              <option value="anonymous">Anonymous — redact career detail</option>
              <option value="private">Private — keep off the relay</option>
            </select>
          </label>
        </div>
        <fieldset className="publication-sections">
          <legend>Published sections</legend>
          {sections.map(([value, label]) => (
            <label className="publication-check" key={value}>
              <input
                type="checkbox"
                checked={settings.sections.includes(value)}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    sections: event.target.checked
                      ? [...settings.sections, value]
                      : settings.sections.filter((section) => section !== value),
                  })
                }
              />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="publication-options">
          <label className="publication-check">
            <input
              type="checkbox"
              checked={settings.hideCurrentEmployer}
              onChange={(event) =>
                onChange({
                  ...settings,
                  hideCurrentEmployer: event.target.checked,
                })
              }
            />
            Hide current employer in restricted modes
          </label>
          <label className="publication-check">
            <input
              type="checkbox"
              checked={settings.showExactLocations}
              onChange={(event) =>
                onChange({
                  ...settings,
                  showExactLocations: event.target.checked,
                })
              }
            />
            Publish exact coordinates and addresses
          </label>
        </div>
        <p className="publication-warning">
          Private notes stay out of the snapshot. Compensation, working
          conditions, unpublished locations, and unpublished media enter only
          when approved for publishing.
        </p>
        <button className="is-primary" type="submit">
          Save settings
        </button>
      </form>
    </aside>
  );
}

function PublishConfirm({
  publishing,
  visibility,
  onClose,
  onOpenSettings,
  onPublish,
}: {
  publishing: boolean;
  visibility: WorkMapPublicationSettings["visibility"];
  onClose: () => void;
  onOpenSettings: () => void;
  onPublish: () => void;
}) {
  const canPublish = publicationAllowsSnapshot(visibility);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside className="publication-confirm" role="dialog" aria-label="Publish snapshot">
      <h2>Publish snapshot</h2>
      <p>
        {canPublish
          ? `This sends the current career record to the relay as ${visibilityLabel(visibility)}.`
          : "Visibility is Private, so nothing is sent. Choose an audience in settings, then publish."}
      </p>
      <div className="publication-confirm-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        {canPublish ? (
          <button
            className="is-primary"
            disabled={publishing}
            type="button"
            onClick={onPublish}
          >
            {publishing ? "Publishing…" : "Publish snapshot"}
          </button>
        ) : (
          <button className="is-primary" type="button" onClick={onOpenSettings}>
            Open settings
          </button>
        )}
      </div>
    </aside>
  );
}

function visibilityLabel(visibility: WorkMapPublicationSettings["visibility"]) {
  switch (visibility) {
    case "public":
      return "Public";
    case "unlisted":
      return "Unlisted";
    case "access-controlled":
      return "Access controlled";
    case "stealth":
      return "Stealth";
    case "anonymous":
      return "Anonymous";
    case "private":
      return "Private";
  }
}

function currentCareerMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function asTimelineResidence(residence: Residence): CareerTimelineResidence {
  return {
    id: residence.id,
    label: residence.label,
    address: residence.address,
    startDate: residence.startDate,
    endDate: residence.endDate,
    pinned: residence.latitude != null && residence.longitude != null,
  };
}

function asTimelineRole(role: WorkMapRole): CareerTimelineRole {
  return {
    id: role.id,
    title: role.title,
    organization: role.organization,
    place: formatHistoryPlace(role),
    startDate: role.startDate,
    endDate: role.endDate,
    isCurrent: role.isCurrent,
    pinned: role.locations.some(
      (location) => Number.isFinite(location.latitude) && Number.isFinite(location.longitude),
    ),
    milestones: role.details?.milestones ?? [],
    events: role.details?.events ?? [],
  };
}

function sectionAddLabel(key: CareerHistorySectionKey): string {
  if (key === "school") return "Add education";
  if (key === "internship") return "Add internship";
  return "Add job";
}

function asHistoryItem(role: WorkMapRole): CareerHistoryItem {
  return {
    id: role.id,
    kind: role.kind,
    title: role.title,
    organization: role.organization,
    locationLabel: role.locationLabel,
    startDate: role.startDate,
    endDate: role.endDate,
    isCurrent: role.isCurrent,
    locations: role.locations.map((location) => ({
      address: location.address,
      latitude: location.latitude,
      longitude: location.longitude,
    })),
  };
}

function HomesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 11.2 12 4l8 7.2V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle cx="9" cy="7" r="1.7" />
      <circle cx="15" cy="12" r="1.7" />
      <circle cx="11" cy="17" r="1.7" />
    </svg>
  );
}

function PublishIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 15.5V5" />
      <path d="M8 8.5 12 4.5l4 4" />
      <path d="M5 15.5v4h14v-4" />
    </svg>
  );
}
