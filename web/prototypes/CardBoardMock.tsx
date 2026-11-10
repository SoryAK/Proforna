// Throwaway. Four cards on one board.
// #/prototype/card-board
// Bio sits top left. The map sits top right, and its menu also opens live updates.
// Career history sits bottom left.
// Media and events sit bottom right, in the smaller card.
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  formatHistoryGist,
  formatHistoryPeriod,
  formatHistoryPlace,
  formatTenureMonths,
  tenureMonths,
} from "@core/career-history";
import type { MapSettings } from "@core/map-settings";
import { roleCoverPhoto, type WorkMapRole } from "@core/work-map";
import { CareerMap } from "../src/CareerMap";
import type { MapFitMode } from "../src/map-camera";
import "./card-board-mock.css";

type Profile = {
  fullName: string;
  headline: string;
  address: string;
  city: string;
  state: string;
  bio: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  avatarUrl: string | null;
};

type HistoryFile = {
  profile: Profile;
  roles: WorkMapRole[];
};

type Sheet = "people" | "more" | "media" | "canvas" | "edit" | null;

const EMPTY_PROFILE: Profile = {
  fullName: "Sory Kaba",
  headline: "",
  address: "",
  city: "",
  state: "",
  bio: "",
  linkedinUrl: "",
  githubUrl: "",
  portfolioUrl: "",
  avatarUrl: null,
};

function PanelIcon({ side, open }: { side: "left" | "right"; open: boolean }) {
  const edge = side === "left" ? "M9.5 4v16" : "M14.5 4v16";
  const fill = side === "left" ? "M4.2 5.2H9.5v13.6H4.2z" : "M14.5 5.2h5.3v13.6H14.5z";
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d={edge} />
      {open ? <path className="cbm-panel-fill" d={fill} /> : null}
    </svg>
  );
}

export function CardBoardMock() {
  const [file, setFile] = useState<HistoryFile | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [message, setMessage] = useState("");
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [mapSettings, setMapSettings] = useState<MapSettings | null>(null);
  const [updateId, setUpdateId] = useState<string | null>(null);
  const [notices, setNotices] = useState<Array<{ id: string; title: string; detail: string }>>([]);
  const [topMenu, setTopMenu] = useState<"notices" | "profile" | "publish" | "preview" | null>(null);
  const [bioDialog, setBioDialog] = useState<"know" | "contact" | "place" | null>(null);
  const [noteName, setNoteName] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteKept, setNoteKept] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(false);
  const [sideDraft, setSideDraft] = useState("");
  const [sideNotes, setSideNotes] = useState<string[]>([]);
  const topEnd = useRef<HTMLDivElement>(null);

  async function load() {
    const response = await fetch("/api/work-map");
    if (!response.ok) return;
    const body = (await response.json()) as HistoryFile;
    setFile({ ...body, roles: body.roles });
  }

  useEffect(() => {
    void load().finally(() => setReady(true));
    void fetch("/api/maps")
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { settings?: MapSettings };
        if (body.settings) setMapSettings(body.settings);
      })
      .catch(() => setMapSettings(null));
    void fetch("/api/notices")
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { notices?: Array<{ id: string; title: string; detail: string }> };
        if (Array.isArray(body.notices)) setNotices(body.notices);
      })
      .catch(() => setNotices([]));
  }, []);

  useEffect(() => {
    if (!topMenu) return;
    function onPointer(event: MouseEvent) {
      if (topEnd.current && !topEnd.current.contains(event.target as Node)) setTopMenu(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setTopMenu(null);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [topMenu]);

  useEffect(() => {
    if (!bioDialog) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setBioDialog(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [bioDialog]);

  const profile = file?.profile ?? EMPTY_PROFILE;
  const roles = [...(file?.roles ?? [])].sort((a, b) =>
    sort === "newest" ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate),
  );
  const needle = query.trim().toLowerCase();
  const shown = roles.filter((role) => {
    if (!needle) return true;
    return `${role.organization} ${role.title} ${formatHistoryPlace(role)}`.toLowerCase().includes(needle);
  });
  const focus = roles.find((role) => role.id === focusId) ?? null;
  const mediaRoles = focus ? [focus] : roles;
  const covers = mediaRoles.flatMap((role) => {
    const photo = roleCoverPhoto(role.media);
    return photo ? [{ ...photo, organization: role.organization || role.title }] : [];
  });
  const events = mediaRoles.flatMap((role) =>
    role.details.events.map((event) => ({ ...event, organization: role.organization })),
  );
  const place = [profile.city, profile.state].filter(Boolean).join(", ");
  const accountRole = profile.headline.trim();
  const updates = liveUpdates(focus ? [focus] : roles.filter((role) => role.isCurrent));
  const openUpdate = updates.find((item) => item.id === updateId) ?? null;
  const placed = roles.filter((role) => roleHasPlace(role));
  const mapFit: MapFitMode = focus && roleHasPlace(focus) ? "pin" : focus ? "hold" : "visible";

  function chooseRole(id: string | null) {
    setFocusId(id);
    setSheet(null);
    setMessage("");
  }

  function showMap() {
    setUpdatesOpen(false);
    setUpdateId(null);
  }

  function chooseStage(updates: boolean) {
    setUpdatesOpen(updates);
    setUpdateId(null);
  }

  return (
    <div className="cbm">
      <p className="cbm-banner">Prototype. Career history keeps its own actions.</p>
      <div className="cbm-board">
      <div className={["cbm-sheet", leftOpen ? "" : "is-left-closed", rightOpen ? "is-right-open" : ""].filter(Boolean).join(" ")}>
      <header className="cbm-top">
        <div className="cbm-brand-wrap">
          <button
            type="button"
            className="cbm-panel-btn"
            aria-pressed={leftOpen}
            aria-label={leftOpen ? "Hide the left panel" : "Show the left panel"}
            onClick={() => setLeftOpen((open) => !open)}
          >
            <PanelIcon side="left" open={leftOpen} />
          </button>
          <p className="cbm-brand">Proforna</p>
        </div>
        <label className="cbm-top-search">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6" />
            <path d="m20 20-3.6-3.6" />
          </svg>
          <input
            type="search"
            value={query}
            placeholder="Search…"
            aria-label="Search"
            onChange={(event) => {
              setQuery(event.target.value);
              if (event.target.value.trim()) chooseRole(null);
            }}
          />
        </label>
        <div className="cbm-top-end" ref={topEnd}>
          <button
            type="button"
            className="cbm-panel-btn"
            aria-pressed={rightOpen}
            aria-label={rightOpen ? "Hide the right panel" : "Show the right panel"}
            onClick={() => setRightOpen((open) => !open)}
          >
            <PanelIcon side="right" open={rightOpen} />
          </button>
          <div className="cbm-pub" role="group" aria-label="Publication">
            <div className="cbm-pub-anchor">
              <button
                type="button"
                className="cbm-pub-btn is-publish"
                aria-expanded={topMenu === "publish"}
                aria-haspopup="menu"
                onClick={() => setTopMenu((current) => (current === "publish" ? null : "publish"))}
              >
                Publish
              </button>
              {topMenu === "publish" ? (
                <div className="cbm-top-menu cbm-pub-menu" role="menu" aria-label="Publish">
                  <button type="button" role="menuitem" onClick={() => setTopMenu(null)}>
                    Confirm publish
                  </button>
                  <button type="button" role="menuitem" onClick={() => setTopMenu(null)}>
                    Cancel
                  </button>
                </div>
              ) : null}
            </div>
            <div className="cbm-pub-anchor">
              <button
                type="button"
                className="cbm-pub-btn"
                aria-expanded={topMenu === "preview"}
                aria-haspopup="menu"
                onClick={() => setTopMenu((current) => (current === "preview" ? null : "preview"))}
              >
                Preview
              </button>
              {topMenu === "preview" ? (
                <div className="cbm-top-menu cbm-pub-menu" role="menu" aria-label="Open preview">
                  <button type="button" role="menuitem" onClick={() => setTopMenu(null)}>
                    This window
                  </button>
                  <button type="button" role="menuitem" onClick={() => setTopMenu(null)}>
                    New window
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="cbm-notice">
            <button
              type="button"
              className="cbm-notice-btn"
              aria-label={notices.length ? `Notices, ${notices.length} waiting` : "Notices"}
              aria-expanded={topMenu === "notices"}
              aria-haspopup="menu"
              onClick={() => setTopMenu((current) => (current === "notices" ? null : "notices"))}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
              {notices.length > 0 ? <span>{notices.length > 9 ? "9+" : notices.length}</span> : null}
            </button>
            {topMenu === "notices" ? (
              <div className="cbm-top-menu" role="menu" aria-label="Notices">
                <p>Notices</p>
                {notices.length > 0 ? (
                  notices.map((notice) => (
                    <button key={notice.id} type="button" role="menuitem" onClick={() => setTopMenu(null)}>
                      <strong>{notice.title}</strong>
                      <span>{notice.detail}</span>
                    </button>
                  ))
                ) : (
                  <span className="cbm-top-empty">Nothing needs attention.</span>
                )}
              </div>
            ) : null}
          </div>
          <div className="cbm-account">
            <button
              type="button"
              className="cbm-account-btn"
              aria-label={accountRole ? `${profile.fullName}, ${accountRole}` : profile.fullName || "Profile"}
              aria-expanded={topMenu === "profile"}
              aria-haspopup="menu"
              onClick={() => setTopMenu((current) => (current === "profile" ? null : "profile"))}
            >
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt="" />
              ) : (
                <span className="cbm-account-mark">{initials(profile.fullName)}</span>
              )}
              <span className="cbm-account-copy">
                <strong>{profile.fullName || "Career"}</strong>
                {accountRole ? <small>{accountRole}</small> : null}
              </span>
              <svg className="cbm-account-caret" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path
                  d="M3 4.5 L6 7.5 L9 4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {topMenu === "profile" ? (
              <div className="cbm-top-menu" role="menu" aria-label="Profile">
                <p>{profile.fullName || "Career"}</p>
                {profile.headline ? <span className="cbm-top-empty">{profile.headline}</span> : null}
                <button type="button" role="menuitem" onClick={() => setTopMenu(null)}>
                  Profile
                </button>
                <button type="button" role="menuitem" onClick={() => setTopMenu(null)}>
                  Settings
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
        <section className="cbm-card cbm-bio" aria-label="Profile">
          <div className="cbm-bio-row">
            {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : <span className="cbm-mark">SK</span>}
            <div className="cbm-bio-id">
              <h2>{profile.fullName || "Career"}</h2>
              {accountRole ? <p>{accountRole}</p> : null}
            </div>
            <div className="cbm-socials">
              <button type="button" aria-label="Request location" onClick={() => setBioDialog("place")}>
                <svg className="cbm-pin" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
                  <circle cx="12" cy="10" r="2.25" />
                </svg>
              </button>
              {socialLinks(profile).map((item) =>
                item.url ? (
                  <a key={item.name} href={item.url} target="_blank" rel="noreferrer" aria-label={item.name}>
                    <SocialMark kind={item.kind} />
                  </a>
                ) : (
                  <span key={item.name} aria-label={`${item.name}, not added`} title={item.name}>
                    <SocialMark kind={item.kind} />
                  </span>
                ),
              )}
            </div>
          </div>
          <div className="cbm-bio-actions">
            <button type="button" className="cbm-know" onClick={() => { setNoteKept(false); setBioDialog("contact"); }}>
              Contact
            </button>
            <button type="button" className="cbm-know" onClick={() => setBioDialog("know")}>
              Get to know me
            </button>
          </div>
        </section>

        <section className="cbm-card cbm-live" aria-label={updatesOpen ? "Live update" : "Map"}>
          <div className="cbm-stage-bar" role="tablist" aria-label="Card views">
            <button type="button" role="tab" aria-selected={!updatesOpen} onClick={() => chooseStage(false)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 4.5 4 6.4v13.1l5-1.9 6 2.4 5-1.9V4.5l-5 1.9L9 4.5Zm0 1.8v11.2l-3 1.1V7.4l3-1.1Zm2 0 4 1.6v11.2l-4-1.6V6.3Zm6 1.1v11.2l-3 1.1V8.4l3-1.1Z" />
              </svg>
              Map
            </button>
            <button type="button" role="tab" aria-selected={updatesOpen} onClick={() => chooseStage(true)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 6.2h16v1.7H4V6.2Zm0 5h12.5v1.7H4v-1.7Zm0 5h9v1.7H4v-1.7Z" />
              </svg>
              Live updates
              {updates.length > 0 ? <span className="cbm-count">{updates.length}</span> : null}
            </button>
          </div>
          <div className="cbm-stage">
            {updatesOpen ? (
              updates.length > 0 ? (
                <div className={openUpdate ? "cbm-updates is-reading" : "cbm-updates"}>
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
                        <li className="cbm-update-group" key={group.key}>
                          <span>
                            <b>{group.organization}</b>
                            {group.stamp ? <time>{group.stamp}</time> : null}
                          </span>
                          <ul>
                            {group.items.map((item) => (
                              <li key={item.id}>
                                <button className="cbm-line" type="button" onClick={() => setUpdateId(item.id)}>
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
                </div>
              ) : (
                <p className="cbm-empty">
                  {focus ? "Nothing recorded for this role yet." : "Nothing new from the jobs you're in."}
                </p>
              )
            ) : (
              <div className="cbm-map">
                <CareerMap
                  emptyNote={
                    placed.length === 0
                      ? { title: "No places yet.", detail: "Roles with a workplace show up here." }
                      : null
                  }
                  fitKey={`${focusId ?? "all"}:${mapFit}`}
                  fitMode={mapFit}
                  onSelect={(id) => chooseRole(id)}
                  roles={roles}
                  selectedId={focusId}
                  settings={mapSettings}
                  viewKey="card-board"
                />
              </div>
            )}
          </div>
        </section>

        <section className={focus ? "cbm-card cbm-history is-role" : "cbm-card cbm-history"} aria-label="Career history">
          {focus ? (
            <>
              <div className="cbm-history-bar">
                <button className="cbm-back" type="button" onClick={() => chooseRole(null)}>
                  History
                </button>
                <MapViewButton on={!updatesOpen} onToggle={showMap} />
              </div>
              <RoleCard
              role={focus}
              message={message}
              onOpen={setSheet}
              onReload={load}
              onMessage={setMessage}
            />
            </>
          ) : (
            <>
              <header className="cbm-history-head">
                <div>
                  <h2>Career history</h2>
                </div>
                <MapViewButton on={!updatesOpen} onToggle={showMap} />
              </header>
              <div className="cbm-tools">
                <input
                  type="search"
                  value={query}
                  placeholder="Search"
                  aria-label="Search career history"
                  onChange={(event) => setQuery(event.target.value)}
                />
                <label>
                  Sort
                  <select
                    value={sort}
                    aria-label="Sort"
                    onChange={(event) => setSort(event.target.value === "oldest" ? "oldest" : "newest")}
                  >
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                  </select>
                </label>
              </div>
              <div className="cbm-groups">
                {groups(shown).map((group) => (
                  <section key={group.label}>
                    <h3>
                      {group.label} ({group.roles.length})
                    </h3>
                    <ul>
                      {group.roles.map((role) => (
                        <li key={role.id}>
                          <button type="button" onClick={() => chooseRole(role.id)}>
                            <span>
                              <strong>
                                {role.organization || role.title || "Untitled"}
                                {role.isCurrent ? <mark>Current</mark> : null}
                              </strong>
                              {role.organization && role.title ? <b>{role.title}</b> : null}
                              {formatHistoryGist(role) ? <small>{formatHistoryGist(role)}</small> : null}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
                {ready && shown.length === 0 ? <p className="cbm-empty">No roles match.</p> : null}
              </div>
            </>
          )}
        </section>

        <section className="cbm-card cbm-media" aria-label="Media and events">
          <header>
            <h2>Media and events</h2>
            <p>{focus ? focus.organization || "This role" : "Across the career history."}</p>
          </header>
          {covers.length > 0 ? (
            <div className="cbm-photos">
              {covers.map((item) => (
                <img key={item.id} src={item.url} alt={item.organization || item.title || ""} />
              ))}
            </div>
          ) : (
            <p className="cbm-empty">No photos yet.</p>
          )}
          {events.length > 0 ? (
            <ul className="cbm-events">
              {events.map((event) => (
                <li key={event.id}>
                  <strong>{event.title || "Event"}</strong>
                  <span>{[event.date, event.organization].filter(Boolean).join(" · ")}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
        {rightOpen ? (
          <aside className="cbm-card cbm-side" aria-label="Proforna">
            <header className="cbm-side-bar">
              <h2>Proforna</h2>
              <button type="button" onClick={() => setRightOpen(false)}>
                Hide
              </button>
            </header>
            <div className="cbm-side-body">
              {sideNotes.length > 0 ? (
                <ol>
                  {sideNotes.map((note, index) => (
                    <li key={`${index}-${note}`}>{note}</li>
                  ))}
                </ol>
              ) : (
                <p>No conversations yet.</p>
              )}
            </div>
            <form
              className="cbm-side-composer"
              onSubmit={(event) => {
                event.preventDefault();
                const text = sideDraft.trim();
                if (!text) return;
                setSideNotes((notes) => [...notes, text]);
                setSideDraft("");
              }}
            >
              <label>
                <span className="cbm-sr">Message Proforna</span>
                <textarea
                  value={sideDraft}
                  rows={3}
                  placeholder="Message Proforna"
                  onChange={(event) => setSideDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || event.shiftKey) return;
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }}
                />
              </label>
              <button type="submit" disabled={!sideDraft.trim()}>
                Send
              </button>
            </form>
          </aside>
        ) : null}
      </div>
      </div>
      {focus && sheet ? (
        <RoleSheet
          role={focus}
          sheet={sheet}
          onClose={() => setSheet(null)}
          onReload={async () => {
            await load();
            setSheet(null);
          }}
          onMessage={setMessage}
        />
      ) : null}
      {bioDialog ? (
        <div
          className="cbm-pop"
          role="dialog"
          aria-modal="true"
          aria-label={bioDialog === "know" ? "Get to know me" : bioDialog === "place" ? "Location" : "Contact"}
          onClick={(event) => {
            if (event.target === event.currentTarget) setBioDialog(null);
          }}
        >
          <div className="cbm-pop-card">
            <header>
              <h2>{bioDialog === "know" ? "Get to know me" : bioDialog === "place" ? "Location" : "Contact"}</h2>
              <button type="button" onClick={() => setBioDialog(null)}>
                Close
              </button>
            </header>
            {bioDialog === "know" ? (
              <p>{profile.bio.trim() || "Nothing written yet."}</p>
            ) : bioDialog === "place" ? (
              <p>{place || "No location yet."}</p>
            ) : noteKept ? (
              <p>Noted.</p>
            ) : (
              <form
                className="cbm-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!noteName.trim() || !noteBody.trim()) return;
                  setNoteKept(true);
                }}
              >
                <label>
                  Name
                  <input value={noteName} onChange={(event) => setNoteName(event.target.value)} required />
                </label>
                <label>
                  Message
                  <textarea rows={3} value={noteBody} onChange={(event) => setNoteBody(event.target.value)} required />
                </label>
                <button type="submit">Leave a note</button>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RoleCard({
  role,
  message,
  onOpen,
  onReload,
  onMessage,
}: {
  role: WorkMapRole;
  message: string;
  onOpen: (sheet: Sheet) => void;
  onReload: () => Promise<void>;
  onMessage: (value: string) => void;
}) {
  const cover = roleCoverPhoto(role.media);
  const place = formatHistoryPlace(role);
  const period = formatHistoryPeriod(role.startDate, role.endDate, role.isCurrent);
  const tenure = formatTenureMonths(tenureMonths(role.startDate, role.endDate, role.isCurrent));
  const gist = role.details.summary.trim();

  async function addPhoto(file: File) {
    onMessage("");
    const body = new FormData();
    body.set("photo", file);
    const response = await fetch(`/api/work-map/roles/${role.id}/photos`, { method: "POST", body });
    if (!response.ok) {
      onMessage("Could not add that photo.");
      return;
    }
    await onReload();
  }

  async function removePhoto() {
    if (!cover) return;
    onMessage("");
    const response = await fetch(`/api/work-map/roles/${role.id}/media/${cover.id}`, { method: "DELETE" });
    if (!response.ok) {
      onMessage("Could not remove that photo.");
      return;
    }
    await onReload();
  }

  return (
    <div className="cbm-role-card">
      <article className="cbm-job">
        <div className="cbm-cover-frame">
          {cover ? <img src={cover.url} alt="" /> : <div className="cbm-cover-empty">No cover photo</div>}
          <div className="cbm-cover-actions">
            <label>
              {cover ? "Change photo" : "Add photo"}
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void addPhoto(file);
                }}
              />
            </label>
            {cover ? (
              <button type="button" onClick={() => void removePhoto()}>
                Remove
              </button>
            ) : null}
          </div>
        </div>
        <div className="cbm-job-body">
          <div className="cbm-title-row">
            <h2>{role.organization || "Untitled"}</h2>
            <button type="button" onClick={() => onOpen("edit")}>
              Edit
            </button>
          </div>
          {role.title ? <p className="cbm-job-title">{role.title}</p> : null}
          {place || period ? (
            <p className="cbm-job-meta">
              {place ? <span>{place}</span> : null}
              {place && period ? <span aria-hidden="true">·</span> : null}
              {period ? <span>{period}</span> : null}
              {role.isCurrent ? <span className="cbm-current">current</span> : null}
              {tenure ? <span className="cbm-tenure">({tenure})</span> : null}
            </p>
          ) : null}
          {gist ? <p className="cbm-gist">{gist}</p> : null}
        </div>
        <div className="cbm-pills">
          {role.details.website ? (
            <a className="cbm-site" href={role.details.website} target="_blank" rel="noreferrer">
              <span>Website</span>
            </a>
          ) : null}
          {role.details.linkedin ? (
            <a className="cbm-site" href={role.details.linkedin} target="_blank" rel="noreferrer">
              <span>LinkedIn</span>
            </a>
          ) : null}
          <button type="button" onClick={() => onOpen("people")}>
            Worked with
          </button>
          <button type="button" onClick={() => onOpen("more")}>
            More about this role
          </button>
          <button type="button" onClick={() => onOpen("canvas")}>
            Show on canvas
          </button>
        </div>
      </article>
      <button type="button" className="cbm-gallery" onClick={() => onOpen("media")}>
        <GalleryStrip role={role} />
        <b>Media and events</b>
        <span>
          {role.media.length === 0 && role.details.events.length === 0
            ? "No media yet."
            : "Photos, video, and events."}
        </span>
      </button>
      {message ? <p className="cbm-message">{message}</p> : null}
    </div>
  );
}

function RoleSheet({
  role,
  sheet,
  onClose,
  onReload,
  onMessage,
}: {
  role: WorkMapRole;
  sheet: Exclude<Sheet, null>;
  onClose: () => void;
  onReload: () => Promise<void>;
  onMessage: (value: string) => void;
}) {
  const title =
    sheet === "people"
      ? "Worked with"
      : sheet === "more"
        ? "More about this role"
        : sheet === "media"
          ? "Media and events"
          : sheet === "canvas"
            ? "Canvas"
            : "Edit role";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const story = await fetch(`/api/work-map/roles/${role.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: String(form.get("kind") ?? role.kind),
        title: String(form.get("title") ?? ""),
        organization: String(form.get("organization") ?? ""),
        locationLabel: String(form.get("locationLabel") ?? ""),
        startDate: String(form.get("startDate") ?? ""),
        endDate: String(form.get("endDate") ?? ""),
        isCurrent: form.get("isCurrent") === "on",
        description: String(form.get("description") ?? ""),
        achievements: String(form.get("achievements") ?? "")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      }),
    });
    if (!story.ok) {
      onMessage("Could not save this role.");
      return;
    }
    const details = await fetch(`/api/work-map/roles/${role.id}/details`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        summary: String(form.get("summary") ?? ""),
        website: String(form.get("website") ?? ""),
        linkedin: String(form.get("linkedin") ?? ""),
      }),
    });
    if (!details.ok) {
      onMessage("The story saved. The summary and links did not.");
      await onReload();
      return;
    }
    onMessage("Role saved.");
    await onReload();
  }

  return (
    <div className="cbm-pop" role="dialog" aria-label={title}>
      <div className="cbm-pop-card">
        <header>
          <h2>{title}</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>
        {sheet === "people" ? (
          role.details.colleagues.length === 0 ? (
            <p>No one listed on this role yet.</p>
          ) : (
            <ul className="cbm-plain">
              {role.details.colleagues.map((person) => (
                <li key={person.id}>
                  <strong>{person.name}</strong>
                  {person.title ? <span>{person.title}</span> : null}
                  {person.note ? <p>{person.note}</p> : null}
                </li>
              ))}
            </ul>
          )
        ) : null}
        {sheet === "more" ? (
          <>
            {role.description ? <p>{role.description}</p> : <p>No description yet.</p>}
            {role.achievements.length > 0 ? (
              <ul className="cbm-plain">
                {role.achievements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
        {sheet === "media" ? (
          <>
            {role.media.length === 0 ? <p>No photos or video on this role yet.</p> : null}
            <div className="cbm-pop-photos">
              {role.media.map((item) =>
                item.kind === "photo" ? <img key={item.id} src={item.url} alt={item.title || ""} /> : null,
              )}
            </div>
            {role.details.events.length === 0 ? (
              <p>No events on this role yet.</p>
            ) : (
              <ul className="cbm-plain">
                {role.details.events.map((event) => (
                  <li key={event.id}>
                    <strong>{event.title || "Event"}</strong>
                    <span>{event.date}</span>
                    {event.detail ? <p>{event.detail}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
        {sheet === "canvas" ? (
          (role.canvasBoards ?? []).length === 0 ? (
            <p>No canvas for this role yet.</p>
          ) : (
            <ul className="cbm-plain">
              {(role.canvasBoards ?? []).map((board) => (
                <li key={board.id}>
                  <strong>{board.name || "Canvas"}</strong>
                  <span>{board.nodes.length} nodes</span>
                </li>
              ))}
            </ul>
          )
        ) : null}
        {sheet === "edit" ? (
          <form className="cbm-form" onSubmit={(event) => void save(event)}>
            <label>
              Kind
              <select name="kind" defaultValue={role.kind}>
                <option value="job">Job</option>
                <option value="internship">Internship</option>
                <option value="school">Education</option>
              </select>
            </label>
            <label>
              Title
              <input name="title" defaultValue={role.title} />
            </label>
            <label>
              Organization
              <input name="organization" defaultValue={role.organization} />
            </label>
            <label>
              Place
              <input name="locationLabel" defaultValue={role.locationLabel} />
            </label>
            <label>
              Start
              <input name="startDate" defaultValue={role.startDate} />
            </label>
            <label>
              End
              <input name="endDate" defaultValue={role.endDate} />
            </label>
            <label className="cbm-check">
              <input name="isCurrent" type="checkbox" defaultChecked={role.isCurrent} />
              Current
            </label>
            <label>
              Summary
              <textarea name="summary" defaultValue={role.details.summary} rows={3} />
            </label>
            <label>
              Description
              <textarea name="description" defaultValue={role.description} rows={4} />
            </label>
            <label>
              Achievements
              <textarea name="achievements" defaultValue={role.achievements.join("\n")} rows={4} />
            </label>
            <label>
              Website
              <input name="website" defaultValue={role.details.website} />
            </label>
            <label>
              LinkedIn
              <input name="linkedin" defaultValue={role.details.linkedin} />
            </label>
            <button type="submit">Save</button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function GalleryStrip({ role }: { role: WorkMapRole }) {
  const items = role.media.filter((item) => item.kind === "photo" || item.kind === "video").slice(0, 3);
  if (items.length === 0) return null;
  const count = items.length >= 3 ? "" : items.length === 2 ? " is-two" : " is-one";
  return (
    <span className={`cbm-strip${count}`} aria-hidden="true">
      {items.map((item) =>
        item.kind === "photo" ? <img key={item.id} src={item.url} alt="" /> : <span key={item.id}>Video</span>,
      )}
    </span>
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

function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return letters || "SK";
}

function httpUrl(value: string): string | null {
  const url = value.trim();
  return /^https?:\/\//i.test(url) ? url : null;
}

function socialLinks(profile: Profile): Array<{ name: string; kind: "linkedin" | "github" | "site"; url: string | null }> {
  return [
    { name: "LinkedIn", kind: "linkedin", url: httpUrl(profile.linkedinUrl) },
    { name: "GitHub", kind: "github", url: httpUrl(profile.githubUrl) },
    { name: "Site", kind: "site", url: httpUrl(profile.portfolioUrl) },
  ];
}

function SocialMark({ kind }: { kind: "linkedin" | "github" | "site" }) {
  if (kind === "linkedin") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.7 3.2a1.7 1.7 0 1 0 .02 3.4 1.7 1.7 0 0 0-.02-3.4ZM3.2 8.4h3.1V20.8H3.2V8.4Zm5 0h3v1.7h.04c.42-.8 1.44-1.64 2.96-1.64 3.17 0 3.76 2.08 3.76 4.79v7.55h-3.1v-6.7c0-1.6-.03-3.66-2.23-3.66-2.23 0-2.57 1.74-2.57 3.54v6.82H8.2V8.4Z" />
      </svg>
    );
  }
  if (kind === "github") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.36 1.12 2.94.86.09-.67.35-1.12.63-1.38-2.22-.26-4.55-1.14-4.55-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05a9.3 9.3 0 0 1 5 0c1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.38-.01 2.49-.01 2.83 0 .27.18.6.69.49A10.04 10.04 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3.75 12h16.5M12 3.75c2.15 2.25 3.25 5.05 3.25 8.25s-1.1 6-3.25 8.25c-2.15-2.25-3.25-5.05-3.25-8.25s1.1-6 3.25-8.25Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function liveUpdates(roles: WorkMapRole[]): LiveUpdate[] {
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

function MapViewButton({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      className={on ? "cbm-map-toggle is-on" : "cbm-map-toggle"}
      type="button"
      aria-pressed={on}
      aria-label="Map view"
      title="Map view"
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 4.5 4 6.4v13.1l5-1.9 6 2.4 5-1.9V4.5l-5 1.9L9 4.5Zm0 1.8v11.2l-3 1.1V7.4l3-1.1Zm2 0 4 1.6v11.2l-4-1.6V6.3Zm6 1.1v11.2l-3 1.1V8.4l3-1.1Z" />
      </svg>
    </button>
  );
}

function groups(roles: WorkMapRole[]) {
  return [
    { label: "Jobs", roles: roles.filter((role) => role.kind === "job") },
    { label: "Internships", roles: roles.filter((role) => role.kind === "internship") },
    { label: "Education", roles: roles.filter((role) => role.kind === "school") },
  ].filter((group) => group.roles.length > 0);
}

