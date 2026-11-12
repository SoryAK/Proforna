import { useEffect, useMemo, useState } from "react";
import { Icon } from "@astryxdesign/core/Icon";
import { ScrollableArea } from "@astryxdesign/core/ScrollableArea";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";
import { formatHistoryPeriod } from "@core/career-history";
import type { MapSettings } from "@core/map-settings";
import { roleCoverPhoto, type WorkMapRole } from "@core/work-map";
import { List, Map as MapIcon } from "lucide-react";
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
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [updateId, setUpdateId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!viewRequest) return;
    setUpdatesOpen(viewRequest.updates);
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
    () => liveUpdates(focus ? [focus] : roles.filter((role) => role.isCurrent)),
    [focus, roles],
  );
  const openUpdate = updates.find((item) => item.id === updateId) ?? null;
  const mediaRoles = focus ? [focus] : roles;
  const covers = mediaRoles.flatMap((role) => {
    const photo = roleCoverPhoto(role.media);
    return photo ? [{ ...photo, organization: role.organization || role.title }] : [];
  });
  const events = mediaRoles.flatMap((role) =>
    role.details.events.map((event) => ({ ...event, organization: role.organization })),
  );
  const placed = roles.filter(roleHasPlace);
  const mapFit: MapFitMode = focus && roleHasPlace(focus) ? "pin" : focus ? "hold" : "visible";

  function chooseStage(updatesView: boolean) {
    setUpdatesOpen(updatesView);
    setUpdateId(null);
  }

  return (
    <>
      <main className="home-card home-stage home-center-live" aria-label={updatesOpen ? "Live update" : "Map"}>
        <div className="home-center-bar" role="tablist" aria-label="Card views">
          <button type="button" role="tab" aria-selected={!updatesOpen} onClick={() => chooseStage(false)}>
            <Icon icon={MapIcon} size="sm" />
            Map
          </button>
          <button type="button" role="tab" aria-selected={updatesOpen} onClick={() => chooseStage(true)}>
            <Icon icon={List} size="sm" />
            Live updates
            {updates.length > 0 ? <span className="home-center-count">{updates.length}</span> : null}
          </button>
        </div>
        <div className="home-center-stage">
          {updatesOpen ? (
            updates.length > 0 ? (
              <ScrollableArea className={openUpdate ? "home-center-updates is-reading" : "home-center-updates"} label="Live updates">
                {openUpdate ? (
                  <article>
                    <button type="button" onClick={() => setUpdateId(null)}>
                      Updates
                    </button>
                    <b>
                      {openUpdate.organization}
                      {openUpdate.kind ? (
                        <>
                          <span aria-hidden="true"> · </span>
                          {openUpdate.kind === "Achievement" ? <mark>{openUpdate.kind}</mark> : openUpdate.kind}
                        </>
                      ) : null}
                    </b>
                    {openUpdate.frame ? <time>{openUpdate.frame}</time> : null}
                    <p>{openUpdate.text}</p>
                  </article>
                ) : (
                  <ul>
                    {updateGroups(updates).map((group) => (
                      <li className="home-center-group" key={group.key}>
                        <span>
                          <b>{group.organization}</b>
                          {group.stamp ? <time>{group.stamp}</time> : null}
                        </span>
                        <ul>
                          {group.items.map((item) => (
                            <li key={item.id}>
                              <button className="home-center-line" type="button" onClick={() => setUpdateId(item.id)}>
                                {item.kind ? (
                                  <b>{item.kind === "Achievement" ? <mark>{item.kind}</mark> : item.kind}</b>
                                ) : null}
                                <p>{item.text}</p>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollableArea>
            ) : (
              <p className="home-center-empty">
                {focus ? "Nothing recorded for this role yet." : "Nothing new from the jobs you're in."}
              </p>
            )
          ) : (
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
          )}
        </div>
      </main>
      <section className="home-card home-media home-center-media" aria-label="Media and events">
        <header>
          <h2>Media and events</h2>
          <p>{focus ? focus.organization || "This role" : "Across the career history."}</p>
        </header>
        {covers.length > 0 ? (
          <div className="home-center-photos">
            {covers.map((item) => (
              <Thumbnail
                key={item.id}
                className="home-center-thumb"
                src={item.url}
                alt={item.organization || item.title || "Photo"}
                label={item.organization || item.title || "Photo"}
              />
            ))}
          </div>
        ) : (
          <p className="home-center-empty">No photos yet.</p>
        )}
        {events.length > 0 ? (
          <ul className="home-center-events">
            {events.map((event) => (
              <li key={event.id}>
                <strong>{event.title || "Event"}</strong>
                <span>{[event.date, event.organization].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </>
  );
}

type LiveUpdate = {
  id: string;
  organization: string;
  kind: string;
  text: string;
  stamp: string;
  frame: string;
  ownDate: boolean;
};

export function liveUpdates(roles: WorkMapRole[]): LiveUpdate[] {
  return roles.flatMap((role) => {
    const organization = role.organization || role.title || "Role";
    const frame = formatHistoryPeriod(role.startDate, role.endDate, role.isCurrent);
    const stamp = inboxStamp(role.startDate);
    const items: LiveUpdate[] = [];
    const summary = role.details.summary.trim();
    if (summary) {
      items.push({ id: `${role.id}-now`, organization, kind: "Now", text: summary, stamp, frame, ownDate: false });
    }
    const moments = [
      ...role.details.events.map((item) => ({ ...item, kind: "Event" })),
      ...role.details.milestones.map((item) => ({ ...item, kind: "Milestone" })),
      ...role.details.notes.map((item) => ({ ...item, kind: "Note" })),
    ].sort((a, b) => b.date.localeCompare(a.date));
    for (const moment of moments) {
      const text = [moment.title, moment.detail].filter(Boolean).join(" — ");
      if (!text) continue;
      const when = inboxStamp(moment.date);
      items.push({
        id: moment.id,
        organization,
        kind: moment.kind,
        text,
        stamp: when || stamp,
        frame: when || frame,
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
        ownDate: false,
      });
    });
    return items;
  });
}

function updateGroups(items: LiveUpdate[]) {
  const groups: Array<{ key: string; organization: string; stamp: string; items: LiveUpdate[] }> = [];
  for (const item of items) {
    const last = groups.at(-1);
    const share =
      last &&
      !item.ownDate &&
      last.items.every((entry) => !entry.ownDate) &&
      last.organization === item.organization &&
      last.stamp === item.stamp;
    if (share && last) last.items.push(item);
    else groups.push({ key: item.id, organization: item.organization, stamp: item.stamp, items: [item] });
  }
  return groups;
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
