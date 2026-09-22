import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { CareerFile } from "@core/career-file";
import {
  CAREER_HISTORY_SECTIONS,
  classifyCareerHistorySection,
  formatHistoryGist,
  groupCareerHistory,
  presentCareerHistoryStats,
  searchCareerHistory,
  sortCareerHistory,
  type CareerHistoryItem,
  type CareerHistorySectionKey,
} from "@core/career-history";
import {
  publicationAllowsSnapshot,
  publicationNeedsAudienceConfirm,
  type WorkMapPublicationSettings,
  type WorkMapPublishSection,
  type WorkMapRole,
} from "@core/work-map";
import { WorkMapCanvas } from "./WorkMapCanvas";
import { RoleDetailPanel } from "./RoleDetailPanel";
import "./work-map.css";

type WorkMapResponse = {
  profile: {
    fullName: string;
    headline: string;
    city: string;
    state: string;
  };
  roles: WorkMapRole[];
  skills: string[];
  settings: WorkMapPublicationSettings;
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
}: {
  fallbackCareer: CareerFile;
  error: string | null;
  focusRoleId?: string | null;
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsIntent, setSettingsIntent] = useState<"edit" | "publish">(
    "edit",
  );
  const [placingForId, setPlacingForId] = useState<string | null>(null);
  const [placingLocationId, setPlacingLocationId] = useState<string | null>(
    null,
  );
  const [pendingPlacement, setPendingPlacement] = useState<{
    roleId: string;
    locationId?: string;
    latitude: number;
    longitude: number;
  } | null>(null);
  const [settings, setSettings] =
    useState<WorkMapPublicationSettings | null>(null);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [message, setMessage] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [creatingKind, setCreatingKind] =
    useState<CareerHistorySectionKey | null>(null);

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (focusRoleId) setSelectedId(focusRoleId);
  }, [focusRoleId]);

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
    if (
      settingsIntent === "publish" &&
      !publicationAllowsSnapshot(settings.visibility)
    ) {
      setMessage("Choose a visibility other than Private, then publish.");
      return;
    }
    setSettingsOpen(false);
    if (
      settingsIntent === "publish" &&
      publicationAllowsSnapshot(settings.visibility)
    ) {
      await publish();
      return;
    }
    setMessage("Publication settings saved.");
    await load();
  }

  function openSettings(intent: "edit" | "publish") {
    setSelectedId(null);
    setSettingsIntent(intent);
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
      openSettings("publish");
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
          selected ? "is-role-focused" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
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
              <button type="button" onClick={() => openSettings("edit")}>
                Settings
              </button>
              <button
                disabled={publishing}
                type="button"
                onClick={requestPublish}
              >
                {publishing
                  ? "Publishing…"
                  : latest?.status === "published"
                    ? "Update"
                    : "Publish"}
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
          {selected ? (
            <div className="work-map-focus" role="status">
              <div>
                <strong>
                  {selected.title || selected.organization || "Untitled role"}
                </strong>
                {selected.organization && selected.title ? (
                  <span>{selected.organization}</span>
                ) : null}
              </div>
              <button type="button" onClick={() => setSelectedId(null)}>
                Show all
              </button>
            </div>
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
                          className={[
                            "career-history-row",
                            selectedId === item.id ? "is-selected" : "",
                            selectedId && selectedId !== item.id
                              ? "is-secondary"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
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
          {view === "map" ? (
            <WorkMapCanvas
              roles={visibleRoles}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onMapClick={
                placingForId
                  ? (latitude, longitude) => {
                      setPendingPlacement({
                        roleId: placingForId,
                        locationId: placingLocationId ?? undefined,
                        latitude,
                        longitude,
                      });
                      setSelectedId(placingForId);
                      setPlacingForId(null);
                      setPlacingLocationId(null);
                    }
                  : undefined
              }
            />
          ) : (
            <CareerTimeline
              roles={visibleRoles}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
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

        {selected && !placingForId && !settingsOpen ? (
          <RoleDetailPanel
            role={selected}
            onClose={() => setSelectedId(null)}
            onSaved={load}
            placement={
              pendingPlacement?.roleId === selected.id
                ? pendingPlacement
                : null
            }
            onStartPlacement={(locationId) => {
              setView("map");
              setPlacingForId(selected.id);
              setPlacingLocationId(locationId ?? null);
            }}
            onLocationSaved={() => setPendingPlacement(null)}
          />
        ) : null}

        {settingsOpen && settings ? (
          <PublicationSettings
            intent={settingsIntent}
            settings={settings}
            onChange={setSettings}
            onClose={() => setSettingsOpen(false)}
            onSubmit={saveSettings}
          />
        ) : null}
      </div>
    </section>
  );
}

function CareerTimeline({
  roles,
  selectedId,
  onSelect,
}: {
  roles: WorkMapRole[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="career-map-timeline">
      {roles.map((role) => (
        <button
          className={[
            selectedId === role.id ? "is-selected" : "",
            selectedId && selectedId !== role.id ? "is-secondary" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          key={role.id}
          onClick={() => onSelect(role.id)}
          type="button"
        >
          <time>{formatSpan(role)}</time>
          <span>
            <strong>{role.title}</strong>
            <b>{role.organization}</b>
            <small>{role.description || role.locationLabel}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

function PublicationSettings({
  intent,
  settings,
  onChange,
  onClose,
  onSubmit,
}: {
  intent: "edit" | "publish";
  settings: WorkMapPublicationSettings;
  onChange: (settings: WorkMapPublicationSettings) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const visibilityField = useRef<HTMLSelectElement>(null);
  const canPublish = publicationAllowsSnapshot(settings.visibility);
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
    if (intent === "publish") visibilityField.current?.focus();
  }, [intent]);

  return (
    <aside className="publication-settings">
      <header>
        <div>
          <h2>Publication settings</h2>
          <p>
            {intent === "publish" && !canPublish
              ? "Visibility is Private, so nothing is sent to the relay. Choose an audience to publish."
              : intent === "publish"
                ? "Confirm who can see this snapshot, then send it to the relay. Private keeps it off the relay."
                : "These settings shape the immutable snapshot sent to the relay."}
          </p>
        </div>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>
      <form onSubmit={onSubmit}>
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
            ref={visibilityField}
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
        <fieldset>
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
        <p className="publication-warning">
          Private notes stay out of the snapshot. Compensation, working
          conditions, unpublished locations, and unpublished media enter only
          when approved for publishing.
        </p>
        <button className="is-primary" type="submit">
          {intent === "publish" && canPublish
            ? "Save and publish"
            : "Save settings"}
        </button>
      </form>
    </aside>
  );
}

function formatSpan(role: WorkMapRole): string {
  const from = role.startDate.slice(0, 7) || "—";
  const to = role.isCurrent ? "Present" : role.endDate.slice(0, 7) || "—";
  return `${from} – ${to}`;
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
