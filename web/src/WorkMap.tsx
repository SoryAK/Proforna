import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { CareerFile } from "@core/career-file";
import type {
  WorkMapPublicationSettings,
  WorkMapPublishSection,
  WorkMapRole,
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
  fallbackCareer,
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
  const [view, setView] = useState<"map" | "timeline">("map");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [placingForId, setPlacingForId] = useState<string | null>(null);
  const [pendingPlacement, setPendingPlacement] = useState<{
    roleId: string;
    latitude: number;
    longitude: number;
  } | null>(null);
  const [settings, setSettings] =
    useState<WorkMapPublicationSettings | null>(null);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [message, setMessage] = useState("");
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (focusRoleId) setSelectedId(focusRoleId);
  }, [focusRoleId]);

  async function load() {
    const [mapResponse, publicationResponse] = await Promise.all([
      fetch("/api/work-map"),
      fetch("/api/projections"),
    ]);
    if (!mapResponse.ok) {
      setMessage("Work Map could not be loaded.");
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

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!data || !query) return data?.roles ?? [];
    return data.roles.filter((role) =>
      [role.title, role.organization, role.locationLabel]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [data, search]);

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
    if (response.ok) {
      setMessage("Publication settings saved.");
      setSettingsOpen(false);
      await load();
    } else {
      setMessage("Could not save publication settings.");
    }
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
        <h1>Work Map</h1>
        <p>{message || error || "Mapping your career history…"}</p>
      </section>
    );
  }

  const empty = data.roles.length === 0 && fallbackCareer.jobs.length === 0;
  return (
    <section className="work-map">
      <header className="work-map-command">
        <div className="work-map-identity">
          <span className="work-map-avatar" aria-hidden="true">
            {initials(data.profile.fullName)}
          </span>
          <div>
            <h1>{data.profile.fullName || "Your Work Map"}</h1>
            <p>
              {["Private Work Map", data.profile.headline, data.profile.city, data.profile.state]
                .filter(Boolean)
                .join(" · ") || "Private career workspace"}
            </p>
          </div>
        </div>
        <div className="work-map-publish">
          <div>
            <strong>
              {latest?.status === "published"
                ? "Published"
                : latest?.status === "revoked"
                  ? "Revoked"
                  : "Private"}
            </strong>
            <span>
              {latest
                ? `${latest.analytics.events} events · ${latest.analytics.accessRequests} requests`
                : "Nothing leaves the vault until you publish"}
            </span>
          </div>
          <button type="button" onClick={() => setSettingsOpen(true)}>
            Publication settings
          </button>
          <button
            disabled={publishing || settings?.visibility === "private"}
            type="button"
            onClick={publish}
          >
            {publishing
              ? "Publishing…"
              : latest?.status === "published"
                ? "Publish update"
                : "Publish Work Map"}
          </button>
          {latest?.status === "published" ? (
            <button className="is-danger" type="button" onClick={revoke}>
              Revoke
            </button>
          ) : null}
        </div>
      </header>

      {message ? (
        <p className="work-map-message" role="status">
          {message}
        </p>
      ) : null}

      <div className="work-map-layout">
        <aside className="work-map-ledger">
          <div className="work-map-stats">
            <div>
              <strong>{data.stats.roles}</strong>
              <span>roles</span>
            </div>
            <div>
              <strong>{data.stats.education}</strong>
              <span>schools</span>
            </div>
            <div>
              <strong>{data.stats.mapped}</strong>
              <span>mapped</span>
            </div>
            <div>
              <strong>{data.stats.publicMedia}</strong>
              <span>public media</span>
            </div>
          </div>
          <label className="work-map-search">
            <span>Search career history</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Role, organization, or place"
            />
          </label>
          <div className="work-map-role-list">
            {filtered.map((role) => (
              <button
                className={selectedId === role.id ? "is-selected" : ""}
                key={role.id}
                onClick={() => setSelectedId(role.id)}
                type="button"
              >
                <span className="role-map-dot" aria-hidden="true" />
                <span>
                  <strong>{role.organization}</strong>
                  <b>{role.title}</b>
                  <small>
                    {formatSpan(role)}
                    {role.locationLabel ? ` · ${role.locationLabel}` : ""}
                  </small>
                </span>
                <em>
                  {role.locations.length
                    ? `${role.locations.length} site${role.locations.length === 1 ? "" : "s"} · Edit`
                    : "Enrich role"}
                </em>
              </button>
            ))}
            {empty ? (
              <p>
                Import or add career history to create your first map anchor.
              </p>
            ) : null}
          </div>
        </aside>

        <main className="work-map-stage">
          <div className="work-map-view-switch" aria-label="Work Map view">
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
              roles={filtered}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onMapClick={
                placingForId
                  ? (latitude, longitude) => {
                      setPendingPlacement({
                        roleId: placingForId,
                        latitude,
                        longitude,
                      });
                      setSelectedId(placingForId);
                      setPlacingForId(null);
                    }
                  : undefined
              }
            />
          ) : (
            <CareerTimeline roles={filtered} onSelect={setSelectedId} />
          )}
          {placingForId ? (
            <div className="map-placement-banner" role="status">
              <strong>Place this work site</strong>
              <span>Click its location on the map.</span>
              <button type="button" onClick={() => setPlacingForId(null)}>
                Cancel
              </button>
            </div>
          ) : null}
        </main>

        {selected && !placingForId ? (
          <RoleDetailPanel
            role={selected}
            onClose={() => setSelectedId(null)}
            onSaved={load}
            placement={
              pendingPlacement?.roleId === selected.id
                ? pendingPlacement
                : null
            }
            onStartPlacement={() => {
              setView("map");
              setPlacingForId(selected.id);
            }}
            onLocationSaved={() => setPendingPlacement(null)}
          />
        ) : null}

        {settingsOpen && settings ? (
          <PublicationSettings
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
  onSelect,
}: {
  roles: WorkMapRole[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="career-map-timeline">
      {roles.map((role) => (
        <button key={role.id} onClick={() => onSelect(role.id)} type="button">
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
  return (
    <aside className="publication-settings">
      <header>
        <div>
          <h2>Publish the Work Map</h2>
          <p>
            These settings shape the immutable snapshot sent to the relay.
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
            <option value="private">Private — disable publishing</option>
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
          Private notes, compensation, unpublished locations, and unpublished
          media never enter the snapshot.
        </p>
        <button className="is-primary" type="submit">
          Save publication settings
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

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "WM"
  );
}
