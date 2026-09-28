import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatHistoryGist,
  formatHistoryPeriod,
  formatHistoryPlace,
  formatTenureMonths,
  groupCareerHistory,
  presentCareerHistoryStats,
  searchCareerHistory,
  sortCareerHistory,
  tenureMonths,
  type CareerHistoryItem,
} from "@core/career-history";
import type { MapSettings } from "@core/map-settings";
import {
  EMPTY_WORK_MAP_DETAILS,
  roleCoverPhoto,
  workSitePublicationNote,
  type WorkMapRole,
  type WorkMapSnapshot,
} from "@core/work-map";
import { CareerMap } from "./CareerMap";

export type PublicWorkMapSnapshot = Omit<WorkMapSnapshot, "occupantId">;

type PreviewRole = PublicWorkMapSnapshot["roles"][number];

export function WorkMapPreview({
  snapshot,
  publishable,
  exactLocations,
  mapSettings,
  onClose,
}: {
  snapshot: PublicWorkMapSnapshot;
  publishable: boolean;
  exactLocations: boolean;
  mapSettings: MapSettings | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const history = useMemo(() => snapshotHistory(snapshot), [snapshot]);
  const visible = useMemo(
    () => sortCareerHistory(searchCareerHistory(history, search), sort),
    [history, search, sort],
  );
  const groups = useMemo(() => groupCareerHistory(visible), [visible]);
  const stats = useMemo(() => presentCareerHistoryStats(history), [history]);
  const selected = snapshot.roles.find((role) => role.id === selectedId) ?? null;
  const showMap = snapshot.sections.includes("map");
  const withheldSite = snapshot.roles.some((role) =>
    role.locations.some((location) => !location.isPublic),
  );
  const coarseIncluded =
    !exactLocations &&
    snapshot.roles.some((role) => role.locations.some((location) => location.isPublic));
  const place = [snapshot.profile.city, snapshot.profile.state].filter(Boolean).join(", ");
  const initials = snapshot.profile.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
  const links = [
    ["LinkedIn", snapshot.profile.links.linkedin],
    ["GitHub", snapshot.profile.links.github],
    ["Portfolio", snapshot.profile.links.portfolio],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (selectedId) {
        setSelectedId(null);
        return;
      }
      onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, selectedId]);

  return (
    <div className="work-map-preview" role="region" aria-label="Public preview">
      <div className={showMap ? "work-map-layout is-map" : "work-map-layout is-record"}>
        <div className="work-map-float">
          <section className="career-bio" aria-label="Public profile">
            <div className="career-bio-row">
              <span className="career-bio-mark" aria-hidden="true">
                {initials || "P"}
              </span>
              <div>
                <h2>{snapshot.profile.displayName || "Public preview"}</h2>
                {snapshot.profile.headline ? <p>{snapshot.profile.headline}</p> : null}
                {place ? <p className="career-bio-place">{place}</p> : null}
                {snapshot.profile.bio ? (
                  <p className="career-bio-about">{snapshot.profile.bio}</p>
                ) : null}
              </div>
            </div>
            {links.length > 0 ? (
              <ul className="work-map-preview-links">
                {links.map(([label, href]) => (
                  <li key={label}>
                    <a href={href} rel="noreferrer" target="_blank">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
          {selected ? (
            <PreviewRole
              exactLocations={exactLocations}
              role={selected}
              onBack={() => setSelectedId(null)}
            />
          ) : (
            <aside className="work-map-ledger" aria-label="Career History">
              <header className="history-panel-head">
                <h2>Career History</h2>
                <div className="history-publish">
                  <button ref={closeRef} type="button" onClick={onClose}>
                    Close preview
                  </button>
                </div>
              </header>
              <p className="work-map-preview-note">
                Local preview. Nothing has been published.
                {publishable
                  ? ""
                  : " Visibility is private, so Publish will not send this."}
                {withheldSite ? " A dashed pin is only on this preview." : ""}
                {coarseIncluded
                  ? " An included site uses a coarser pin in a publication."
                  : ""}
              </p>
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
              <div className="work-map-role-list">
                {snapshot.roles.length === 0 ? (
                  <p>No career history is included in this snapshot.</p>
                ) : null}
                {groups.map((section) => (
                  <section key={section.key}>
                    <div className="history-cat-row">
                      <p className="history-cat">
                        <b>{section.label}</b>
                        <em>({section.items.length})</em>
                      </p>
                    </div>
                    {section.items.map((item) => (
                      <button
                        className="career-history-row"
                        key={item.id}
                        onClick={() => setSelectedId(item.id)}
                        type="button"
                      >
                        <span>
                          <strong>
                            {item.organization || item.title || "Untitled"}
                            {item.isCurrent ? <mark>Current</mark> : null}
                          </strong>
                          {item.organization && item.title ? <b>{item.title}</b> : null}
                          {formatHistoryGist(item) ? (
                            <small>{formatHistoryGist(item)}</small>
                          ) : null}
                        </span>
                      </button>
                    ))}
                  </section>
                ))}
                {snapshot.roles.length > 0 && visible.length === 0 ? (
                  <p>No roles match that search.</p>
                ) : null}
                {snapshot.sections.includes("skills") && snapshot.skills.length > 0 ? (
                  <section>
                    <div className="history-cat-row">
                      <p className="history-cat">
                        <b>Skills</b>
                      </p>
                    </div>
                    <p className="work-map-preview-skills">{snapshot.skills.join(" · ")}</p>
                  </section>
                ) : null}
                {showMap && !snapshot.roles.some((role) => role.locations.length > 0) ? (
                  <p>No work sites are included in this snapshot.</p>
                ) : null}
              </div>
            </aside>
          )}
        </div>
        {showMap ? (
          <main className="work-map-stage">
            <CareerMap
              exactLocations={exactLocations}
              fitKey={selectedId ?? "preview"}
              home={null}
              onSelect={setSelectedId}
              publicationMarks
              roles={previewMapRoles(snapshot)}
              selectedId={selectedId}
              settings={mapSettings}
              suppressEmpty
              viewKey="preview-sites"
            />
          </main>
        ) : null}
      </div>
    </div>
  );
}

function PreviewRole({
  role,
  exactLocations,
  onBack,
}: {
  role: PreviewRole;
  exactLocations: boolean;
  onBack: () => void;
}) {
  const backRef = useRef<HTMLButtonElement>(null);
  const dates = datesFromSpan(role.span);
  const place =
    role.place ||
    formatHistoryPlace({
      organization: role.organization,
      locationLabel: "",
      locations: role.locations.map((location) => ({
        address: location.address,
      })),
    });
  const period = formatHistoryPeriod(dates.startDate, dates.endDate, dates.isCurrent);
  const tenure = formatTenureMonths(
    tenureMonths(dates.startDate, dates.endDate, dates.isCurrent),
  );
  const story = role.description.trim();
  const sites = role.locations.map((location) => ({
    id: location.id,
    place: location.address || role.place,
    note: workSitePublicationNote({
      isPublic: location.isPublic,
      exactLocations,
    }),
  }));
  const chips = previewChips(role);
  const cover = roleCoverPhoto(role.media);
  const media = role.media.filter((item) => item.id !== cover?.id);

  useEffect(() => {
    backRef.current?.focus();
  }, [role.id]);

  return (
    <aside className="role-detail is-inline" aria-label={`${role.title || "Role"} preview`}>
      <header>
        <button ref={backRef} className="role-back" type="button" onClick={onBack}>
          Back to history
        </button>
      </header>
      <section className="role-focus">
        {cover ? (
          <div className="role-focus-photo">
            <img src={cover.url} alt="" />
          </div>
        ) : null}
        <div className="role-focus-body">
          <h2>{role.organization || role.title || "Untitled"}</h2>
          {role.organization && role.title ? (
            <p className="role-focus-title">{role.title}</p>
          ) : null}
          {place || period ? (
            <p className="role-focus-meta">
              {place ? <span>{place}</span> : null}
              {place && period ? <span aria-hidden="true">·</span> : null}
              {period ? <span>{period}</span> : null}
              {dates.isCurrent ? <span className="role-focus-current">current</span> : null}
              {tenure ? <span className="role-focus-tenure">({tenure})</span> : null}
            </p>
          ) : null}
          {sites.length === 1 ? (
            <p className="preview-site-note">{sites[0]?.note}</p>
          ) : sites.length > 1 ? (
            <ul className="preview-sites">
              {sites.map((site) => (
                <li key={site.id}>
                  {[site.place, site.note].filter(Boolean).join(" · ")}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>
      <div className="role-detail-scroll">
        <div className="role-reading">
          {story ? (
            <section>
              <h3>Story</h3>
              <p className="role-sheet-body">{story}</p>
            </section>
          ) : null}
          {role.achievements.length > 0 ? (
            <section>
              <h3>Achievements</h3>
              <ul className="role-reading-list">
                {role.achievements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {chips.length > 0 ? (
            <ul className="work-map-preview-chips">
              {chips.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          {role.milestones.length > 0 ? (
            <section>
              <h3>Milestones</h3>
              <ul className="role-reading-list">
                {role.milestones.map((item) => (
                  <li key={item.id}>{item.title}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {media.length > 0 ? (
            <section>
              <h3>Media</h3>
              <ul className="role-reading-list">
                {media.map((item) => (
                  <li key={item.id}>
                    {item.kind === "photo" ? <img src={item.url} alt="" /> : null}
                    {item.title || item.caption || "Media"}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function previewChips(role: PreviewRole): string[] {
  const seen = new Set<string>();
  const chips: string[] = [];
  for (const item of [...(role.equipment ?? []), ...role.techStack]) {
    const label = item.trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    chips.push(label);
  }
  return chips;
}

function snapshotHistory(snapshot: PublicWorkMapSnapshot): CareerHistoryItem[] {
  return snapshot.roles.map((role) => {
    const dates = datesFromSpan(role.span);
    const location = role.locations[0];
    return {
      id: role.id,
      kind: role.kind,
      title: role.title,
      organization: role.organization,
      locationLabel: role.place || location?.address || "",
      startDate: dates.startDate,
      endDate: dates.endDate,
      isCurrent: dates.isCurrent,
      locations: role.locations.map((item) => ({
        address: item.address || item.label,
        latitude: item.latitude,
        longitude: item.longitude,
      })),
    };
  });
}

function datesFromSpan(span: string): {
  startDate: string;
  endDate: string;
  isCurrent: boolean;
} {
  const [start = "", end = ""] = span.split(" — ");
  const isCurrent = end === "Present";
  return {
    startDate: /^\d{4}-\d{2}/.test(start) ? start : "",
    endDate: isCurrent || !/^\d{4}-\d{2}/.test(end) ? "" : end,
    isCurrent,
  };
}

function previewMapRoles(snapshot: PublicWorkMapSnapshot): WorkMapRole[] {
  return snapshot.roles.map((role) => {
    const dates = datesFromSpan(role.span);
    return {
      id: role.id,
      kind: role.kind,
      title: role.title,
      organization: role.organization,
      locationLabel: role.locations[0]?.label || role.locations[0]?.address || "",
      startDate: dates.startDate,
      endDate: dates.endDate,
      isCurrent: dates.isCurrent,
      description: "",
      achievements: [],
      factId: null,
      factVersion: null,
      evidenceIds: [],
      claims: [],
      locations: role.locations,
      media: [],
      details: structuredClone(EMPTY_WORK_MAP_DETAILS),
    };
  });
}
