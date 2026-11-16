// Throwaway. The canvas homepage and the quiet ground, on one page.
// #/prototype/quiet-ground
// One rounded campus. The career cards sit on it. The ground is a dark stage.
// A place icon on a role opens a location node, and that node is the map.
import { useEffect, useState } from "react";
import {
  formatHistoryPeriod,
  formatHistoryPlace,
  formatTenureMonths,
  tenureMonths,
} from "@core/career-history";
import {
  DEFAULT_WORK_MAP_OVERVIEW_FIELDS,
  roleCoverPhoto,
  WORK_MAP_OVERVIEW_FIELDS,
  type WorkMapOverviewField,
  type WorkMapRole,
} from "@core/work-map";
import { PlaceStage } from "../src/PlaceStage";
import "../src/home.css";
import "../src/role-canvas.css";
import "../src/work-map.css";
import "./quiet-ground-mock.css";

type Profile = {
  fullName: string;
  headline: string;
  address: string;
  city: string;
  state: string;
  bio: string;
  avatarUrl: string;
};

type HistoryFile = {
  profile: Profile;
  roles: WorkMapRole[];
  stats: { tenure: string; roles: number; miles: number; cities: number };
};

type Section = "history" | "network" | "documents" | "opportunities";

const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: "history", label: "Career History" },
  { id: "network", label: "Network" },
  { id: "documents", label: "My Documents" },
  { id: "opportunities", label: "Opportunities" },
];

const EMPTY_PROFILE: Profile = {
  fullName: "Sory Kaba",
  headline: "",
  address: "",
  city: "",
  state: "",
  bio: "",
  avatarUrl: "",
};

export function QuietGroundMock() {
  const [file, setFile] = useState<HistoryFile | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [locked, setLocked] = useState(false);
  const [inSequence, setInSequence] = useState(false);
  const [ready, setReady] = useState(false);
  const [section, setSection] = useState<Section>("history");
  const [query, setQuery] = useState("");
  const [noticesOpen, setNoticesOpen] = useState(false);

  useEffect(() => {
    setViewing(false);
    setMenu(null);
    setLocked(false);
    setInSequence(false);
  }, [placeId]);

  useEffect(() => {
    void fetch("/api/work-map")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: HistoryFile | null) => {
        if (!body) return;
        const roles = [...body.roles].sort(byRecent);
        setFile({ ...body, roles });
      })
      .finally(() => setReady(true));
  }, []);

  const roles = file?.roles ?? [];
  const focus = section === "history" ? roles.find((role) => role.id === focusId) ?? null : null;
  const place = roles.find((role) => role.id === placeId) ?? null;
  const placePoint = place ? mapPoint(place) : null;
  const needle = query.trim().toLowerCase();
  const shown = roles.filter((role) => {
    if (!needle) return true;
    return `${role.organization} ${role.title}`.toLowerCase().includes(needle);
  });

  function chooseRole(id: string) {
    setSection("history");
    setFocusId(id || null);
    setPlaceId(null);
  }

  function chooseSection(next: Section) {
    setSection(next);
    if (next !== "history") setPlaceId(null);
  }

  function closePlace() {
    setPlaceId(null);
    setViewing(false);
    setMenu(null);
  }

  function togglePlace(id: string) {
    setSection("history");
    setFocusId(id);
    setMenu(null);
    setViewing(false);
    setPlaceId((current) => (current === id ? null : id));
  }

  return (
    <div className="qgp">
      <div className="home">
        <div className="work-map">
          <div className="work-map-layout is-map">
            <main className="work-map-stage has-action-tab">
              <div className="qgp-ground" />
              <header className="qgp-float">
                <label className="qgp-search">
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <circle cx="7" cy="7" r="4.25" />
                    <path d="M10.2 10.2 13 13" />
                  </svg>
                  <input
                    type="search"
                    placeholder="Search"
                    aria-label="Search the canvas"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="qgp-icon"
                  aria-label="Notices"
                  aria-expanded={noticesOpen}
                  onClick={() => setNoticesOpen((open) => !open)}
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M8 2.2a3.2 3.2 0 0 0-3.2 3.2v1.7L3.4 9.2v1h9.2v-1L11.2 7.1V5.4A3.2 3.2 0 0 0 8 2.2Z" />
                    <path d="M6.6 11.2a1.4 1.4 0 0 0 2.8 0" />
                  </svg>
                </button>
                {noticesOpen ? <p className="qgp-notices">No notices.</p> : null}
                <p className="qgp-who">{file?.profile.fullName || "Sory Kaba"}</p>
              </header>
              <div className="action-dock">
                <div className="action-tab">
                  <div className="action-bar">
                    <button type="button">Publish</button>
                    <button type="button">Preview</button>
                    <button type="button">
                      Map
                    </button>
                    <button type="button">Timeline</button>
                  </div>
                </div>
              </div>
              {place && placePoint ? (
                <article
                  className={["role-canvas-node", "qgp-location", "is-selected", locked ? "is-locked" : ""].filter(Boolean).join(" ")}
                  aria-label={`${place.organization} location`}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMenu({ x: event.clientX, y: event.clientY });
                  }}
                >
                  <p className="kind">
                    <span>Location</span>
                    {locked ? (
                      <span className="role-canvas-lock" aria-label="Locked">
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                          <rect x="3.5" y="7" width="9" height="6.2" rx="1.2" />
                          <path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" />
                        </svg>
                      </span>
                    ) : null}
                    <button type="button" className="qgp-close" aria-label="Close location" onClick={closePlace}>
                      <svg viewBox="0 0 16 16" aria-hidden="true">
                        <path d="M4 4l8 8M12 4l-8 8" />
                      </svg>
                    </button>
                  </p>
                  <h3>{place.organization || "Location"}</h3>
                  {inSequence ? <span className="role-canvas-sequence-mark">1</span> : null}
                  <PlaceStage latitude={placePoint.latitude} longitude={placePoint.longitude} interactive={false} label={placePoint.label} />
                  <button type="button" className="role-canvas-view" aria-label="View map" onClick={() => { setMenu(null); setViewing(true); }}>
                    View
                  </button>
                </article>
              ) : null}
              {menu ? (
                <div className="role-canvas-context" role="menu" style={{ left: menu.x, top: menu.y }}>
                  <button type="button" role="menuitem" onClick={() => setMenu(null)}>
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setInSequence((value) => !value);
                      setMenu(null);
                    }}
                  >
                    <span>{inSequence ? "Remove from sequence" : "Start the sequence"}</span>
                  </button>
                  <div className="role-canvas-context-rule" />
                  <button type="button" role="menuitem" onClick={() => setMenu(null)}>
                    <span>Copy</span>
                    <kbd>Ctrl C</kbd>
                  </button>
                  <button type="button" role="menuitem" onClick={() => setMenu(null)}>
                    <span>Duplicate</span>
                    <kbd>Ctrl D</kbd>
                  </button>
                  <button type="button" role="menuitem" onClick={() => setMenu(null)}>
                    <span>Bring to front</span>
                    <kbd>Ctrl ]</kbd>
                  </button>
                  <button type="button" role="menuitem" onClick={() => setMenu(null)}>
                    <span>Send to back</span>
                    <kbd>Ctrl [</kbd>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setLocked((value) => !value);
                      setMenu(null);
                    }}
                  >
                    <span>{locked ? "Unlock" : "Lock"}</span>
                    <kbd>Ctrl L</kbd>
                  </button>
                  <div className="role-canvas-context-rule" />
                  <button
                    type="button"
                    role="menuitem"
                    className="is-danger"
                    onClick={() => {
                      setMenu(null);
                      setPlaceId(null);
                    }}
                  >
                    <span>Delete</span>
                  </button>
                </div>
              ) : null}
              {viewing && place && placePoint ? (
                <div className="role-canvas-document-view" role="dialog" aria-label={place.organization || "Location"}>
                  <header>
                    <div>
                      <h2>{place.organization || "Location"}</h2>
                      <p className="role-canvas-model-note">{placePoint.label}</p>
                    </div>
                    <button type="button" onClick={() => setViewing(false)}>
                      Close
                    </button>
                  </header>
                  <PlaceStage latitude={placePoint.latitude} longitude={placePoint.longitude} interactive label={place.organization || placePoint.label} />
                </div>
              ) : null}
            </main>
            <div className="work-map-float">
              <Bio profile={file?.profile ?? EMPTY_PROFILE} onHistory={focus ? () => chooseRole("") : undefined} />
              <Overview role={focus} stats={file?.stats ?? null} />
              {focus ? (
                <RoleCard role={focus} onPlace={() => togglePlace(focus.id)} />
              ) : (
                <aside className="work-map-ledger" aria-label="Career history">
                  <nav className="qgp-nav" aria-label="Main">
                    {SECTIONS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={section === item.id ? "is-current" : ""}
                        aria-current={section === item.id ? "page" : undefined}
                        onClick={() => chooseSection(item.id)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </nav>
                  {section === "history" ? (
                  <div className="work-map-role-list">
                    {shown.map((role) => {
                      const point = mapPoint(role);
                      return (
                        <div className="qgp-row" key={role.id}>
                          <button className="career-history-row" type="button" onClick={() => chooseRole(role.id)}>
                            <span>
                              <strong>
                                {role.organization || role.title || "Untitled"}
                                {role.isCurrent ? <mark>Current</mark> : null}
                              </strong>
                              {role.title ? <b>{role.title}</b> : null}
                            </span>
                          </button>
                          {point ? (
                            <button
                              type="button"
                              className="qgp-loc"
                              aria-label={`Show location for ${role.organization || role.title}`}
                              onClick={() => togglePlace(role.id)}
                            >
                              <PinIcon />
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                    {ready && shown.length === 0 ? <p className="qgp-section">No roles match.</p> : null}
                  </div>
                  ) : (
                    <p className="qgp-section">{SECTIONS.find((item) => item.id === section)?.label}</p>
                  )}
                </aside>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Bio({ profile, onHistory }: { profile: Profile; onHistory?: () => void }) {
  const place = [profile.address, [profile.city, profile.state].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  return (
    <section className="career-bio" aria-label="Profile">
      <div className="profile-bar">
        <span className="profile-links">
          <button className="career-bio-home" type="button">
            Home
          </button>
          {onHistory ? (
            <button className="career-bio-home" type="button" onClick={onHistory}>
              History
            </button>
          ) : null}
        </span>
        <button className="focus-edit" type="button">
          Edit
        </button>
      </div>
      <div className="career-bio-row">
        {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : <span className="career-bio-mark">SK</span>}
        <div>
          <h2>{profile.fullName || "Career"}</h2>
          {profile.headline ? <p>{profile.headline}</p> : null}
          {place ? <p className="career-bio-place">{place}</p> : null}
        </div>
      </div>
    </section>
  );
}

function Overview({ role, stats }: { role: WorkMapRole | null; stats: HistoryFile["stats"] | null }) {
  const figures = role
    ? (role.details.overviewFields ?? DEFAULT_WORK_MAP_OVERVIEW_FIELDS).map((key) => ({
        label: WORK_MAP_OVERVIEW_FIELDS.find((field) => field.key === key)?.label ?? key,
        value: figureValue(role, key),
      }))
    : [
        { label: "Total Tenure", value: stats?.tenure || "—" },
        { label: "Roles", value: String(stats?.roles ?? "—") },
        { label: "Miles Traveled", value: String(stats?.miles ?? "—") },
        { label: "Cities", value: String(stats?.cities ?? "—") },
      ];
  return (
    <section className={role ? "history-overview is-role" : "history-overview"} aria-label="Overview">
      <div className="history-overview-bar">
        <button className="history-overview-toggle" type="button" aria-expanded="true">
          <span>Overview</span>
          <i className="history-overview-chevron" aria-hidden="true" />
        </button>
        {role ? (
          <button className="focus-edit" type="button">
            Edit
          </button>
        ) : null}
      </div>
      <div className="work-map-stats" style={{ gridTemplateColumns: `repeat(${Math.min(figures.length, 4)}, minmax(0, 1fr))` }}>
        {figures.map((figure) => (
          <div key={figure.label}>
            <span>{figure.label}</span>
            <strong>{figure.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function RoleCard({ role, onPlace }: { role: WorkMapRole; onPlace: () => void }) {
  const cover = roleCoverPhoto(role.media);
  const place = formatHistoryPlace(role);
  const point = mapPoint(role);
  const period = formatHistoryPeriod(role.startDate, role.endDate, role.isCurrent);
  const tenure = formatTenureMonths(tenureMonths(role.startDate, role.endDate, role.isCurrent));
  const gist = role.details.summary.trim();
  return (
    <aside className="role-detail is-inline focus-card" aria-label={`${role.title || "Role"} details`}>
      <article className="focus-job">
        <section className="role-focus" aria-label="Role">
          {cover ? (
            <div className="role-focus-photo">
              <img src={cover.url} alt="" />
            </div>
          ) : null}
          <div className="role-focus-body">
            <div className="focus-title-row">
              <h2>{role.organization || "Untitled"}</h2>
              {point ? (
                <button type="button" className="qgp-loc" aria-label={`Show location for ${role.organization || role.title}`} onClick={onPlace}>
                  <PinIcon />
                </button>
              ) : null}
              <button className="focus-edit" type="button">
                Edit
              </button>
            </div>
            {role.title ? <p className="role-focus-title">{role.title}</p> : null}
            {place || period ? (
              <p className="role-focus-meta">
                {place ? <span>{place}</span> : null}
                {place && period ? <span aria-hidden="true"> · </span> : null}
                {period ? <span>{period}</span> : null}
                {role.isCurrent ? <span className="role-focus-current">current</span> : null}
                {tenure ? <span className="role-focus-tenure"> ({tenure})</span> : null}
              </p>
            ) : null}
            {gist ? <p className="focus-gist">{gist}</p> : null}
          </div>
        </section>
        <div className="job-pills">
          {role.details.website ? (
            <button className="job-site" type="button">
              Website
            </button>
          ) : null}
          {role.details.linkedin ? (
            <button className="job-site" type="button">
              LinkedIn
            </button>
          ) : null}
          <button className="job-more-toggle" type="button">
            Worked with
          </button>
          <button className="job-more-toggle" type="button">
            More about this role
          </button>
          <button className="job-more-toggle" type="button">
            Show on canvas
          </button>
        </div>
      </article>
      <section className="focus-hub">
        <button className="gallery-card" type="button">
          <b>Media and events</b>
          <span className="gallery-label">Photos, video, and events. The full view opens over the map.</span>
        </button>
      </section>
    </aside>
  );
}

function mapPoint(role: WorkMapRole): { latitude: number; longitude: number; label: string } | null {
  const spot = role.locations.find(
    (location) => Number.isFinite(location.latitude) && Number.isFinite(location.longitude) && (location.latitude !== 0 || location.longitude !== 0),
  );
  if (!spot) return null;
  return {
    latitude: spot.latitude,
    longitude: spot.longitude,
    label: formatHistoryPlace(role) || spot.label || "Location",
  };
}

function PinIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.5a4.2 4.2 0 0 0-4.2 4.2c0 3.2 4.2 8.8 4.2 8.8s4.2-5.6 4.2-8.8A4.2 4.2 0 0 0 8 1.5Zm0 5.6a1.4 1.4 0 1 1 0-2.8 1.4 1.4 0 0 1 0 2.8Z" />
    </svg>
  );
}

function figureValue(role: WorkMapRole, key: WorkMapOverviewField): string {
  switch (key) {
    case "achievements":
      return String(role.achievements.length);
    case "events":
      return String(role.details.events.length);
    case "media":
      return String(role.media.length);
    case "tools":
      return String(role.details.techStack.length);
    case "milestones":
      return String(role.details.milestones.length);
    case "skills":
      return String(role.details.skills.length);
    case "equipment":
      return String(role.details.equipment.length);
    case "colleagues":
      return String(role.details.colleagues.length);
  }
}

function byRecent(a: WorkMapRole, b: WorkMapRole): number {
  if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
  return b.startDate.localeCompare(a.startDate);
}
