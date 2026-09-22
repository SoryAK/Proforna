import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  currentJob,
  formatCareerSpan,
  type CareerFile,
  type CareerJob,
} from "@core/career-file";
import { HomeBar } from "./HomeBar";
import { HomeNav, type HomePage } from "./HomeNav";
import { HomeProfileEdit } from "./HomeProfileEdit";
import { HomeSearch } from "./HomeSearch";
import { HomeSettings } from "./HomeSettings";
import { WorkHistory } from "./WorkHistory";
import { CareerWorkspace } from "./CareerWorkspace";
import { HomeProforna } from "./HomeProforna";
import type { OnboardingProfileValue } from "./OnboardingProfile";
import "./home.css";

const NAV_COLLAPSED_KEY = "proforna.navCollapsed";
const PANEL_OPEN_KEY = "proforna.panelOpen";
const WORKBENCH = "(min-width: 760px)";
const NAV_DEFAULT = 264;
const CHAT_DEFAULT = 336;
const NAV_MIN = 176;
const CHAT_MIN = 260;
const EDITOR_MIN = 280;
const NAV_MAX = 480;
const CHAT_MAX = 560;
const SASH = 8;
const NAV_RAIL = 68;

type SideWidths = { nav: number; chat: number };
type Rails = { nav: boolean; chat: boolean };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function fitWidths(
  preferred: SideWidths,
  container: number,
  rails: Rails,
): SideWidths {
  let nav = rails.nav ? NAV_RAIL : clamp(preferred.nav, NAV_MIN, NAV_MAX);
  let chat = rails.chat ? 0 : clamp(preferred.chat, CHAT_MIN, CHAT_MAX);
  const sashCount = (rails.nav ? 0 : 1) + (rails.chat ? 0 : 1);
  let overflow = nav + chat + EDITOR_MIN + SASH * sashCount - container;
  if (overflow > 0 && !rails.chat) {
    const chatShrink = Math.min(overflow, chat - CHAT_MIN);
    chat -= chatShrink;
    overflow -= chatShrink;
  }
  if (overflow > 0 && !rails.nav) {
    nav = Math.max(NAV_MIN, nav - overflow);
  }
  return { nav, chat };
}

export function Home({
  profile,
  career,
  careerError,
  onProfileSaved,
}: {
  profile: OnboardingProfileValue;
  career: CareerFile;
  careerError: string | null;
  onProfileSaved: (profile: OnboardingProfileValue) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [page, setPage] = useState<HomePage>(readPage);
  const [focusJobId, setFocusJobId] = useState<string | null>(null);
  const [photoTick, setPhotoTick] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [profornaOpen, setProfornaOpen] = useState(readPanelOpen);
  const [desktop, setDesktop] = useState(readDesktop);
  const [widths, setWidths] = useState<SideWidths>({
    nav: NAV_DEFAULT,
    chat: CHAT_DEFAULT,
  });
  const [dragging, setDragging] = useState<"nav" | "chat" | null>(null);
  const preferred = useRef<SideWidths>({
    nav: NAV_DEFAULT,
    chat: CHAT_DEFAULT,
  });
  const shellRef = useRef<HTMLDivElement>(null);
  const role = currentJob(career);
  const place = [profile.city, profile.state].filter(Boolean).join(", ");
  const company = role?.company ?? "";
  const links = [
    profile.linkedinUrl,
    profile.githubUrl,
    profile.portfolioUrl,
  ].filter((href): href is string => Boolean(href));
  const photoSrc = profile.avatarUrl
    ? `${profile.avatarUrl}?v=${photoTick}`
    : null;
  const recentJobs = career.jobs.filter((job) => job.id !== role?.id).slice(0, 4);
  const skillTags = career.skills
    .map((skill) => skill.trim())
    .filter((skill) => skill.length > 0 && skill.length <= 36)
    .slice(0, 8);
  const next = nextCareerAction(career, role);

  useEffect(() => {
    const mq = window.matchMedia(WORKBENCH);
    function onChange() {
      setDesktop(mq.matches);
      if (mq.matches) setMobileOpen(false);
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    function onRoute() {
      setEditing(false);
      setPage(readPage());
    }
    window.addEventListener("hashchange", onRoute);
    return () => window.removeEventListener("hashchange", onRoute);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.shiftKey || event.key.toLowerCase() !== "k") return;
      if (document.querySelector("dialog.home-settings[open]")) return;
      event.preventDefault();
      setSearchOpen((open) => !open);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || !desktop) return;
    applyFit();
    const observer = new ResizeObserver(() => applyFit());
    observer.observe(shell);
    return () => observer.disconnect();
  }, [desktop, collapsed, profornaOpen]);

  function applyFit() {
    const container = shellRef.current?.clientWidth ?? 0;
    if (container <= 0) return;
    const next = fitWidths(preferred.current, container, {
      nav: collapsed,
      chat: !profornaOpen,
    });
    setWidths((current) =>
      current.nav === next.nav && current.chat === next.chat ? current : next,
    );
  }

  function dragSide(
    side: "nav" | "chat",
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (!desktop || event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const start = preferred.current[side];
    const sign = side === "nav" ? 1 : -1;
    const min = side === "nav" ? NAV_MIN : CHAT_MIN;
    const max = side === "nav" ? NAV_MAX : CHAT_MAX;
    setDragging(side);

    function move(next: PointerEvent) {
      preferred.current[side] = clamp(start + sign * (next.clientX - startX), min, max);
      applyFit();
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragging(null);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function nudge(side: "nav" | "chat", delta: number) {
    const min = side === "nav" ? NAV_MIN : CHAT_MIN;
    const max = side === "nav" ? NAV_MAX : CHAT_MAX;
    preferred.current[side] = clamp(preferred.current[side] + delta, min, max);
    applyFit();
  }

  function toggleMenu() {
    if (desktop) {
      setCollapsed((value) => {
        const next = !value;
        writeCollapsed(next);
        return next;
      });
      return;
    }
    setMobileOpen((open) => !open);
  }

  function goHome() {
    setFocusJobId(null);
    goPage("home");
  }

  function togglePanel() {
    setProfornaOpen((open) => {
      const next = !open;
      writePanelOpen(next);
      return next;
    });
  }

  function goPage(next: HomePage) {
    setPage(next);
    const hash = next === "home" ? "" : `#/${next}`;
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
  }

  function goProfile() {
    if (page === "home") {
      setEditing(true);
      return;
    }
    setEditing(false);
    goHome();
  }

  return (
    <div className="home">
      <HomeBar
        name={profile.fullName}
        headline={profile.headline}
        photoSrc={photoSrc}
        menuExpanded={desktop ? !collapsed : mobileOpen}
        menuLabel={page === "history" ? "Home" : undefined}
        onMenu={() => {
          if (page === "history") {
            setEditing(false);
            goHome();
            return;
          }
          toggleMenu();
        }}
        onProfile={goProfile}
        onSettings={() => setSettingsOpen(true)}
        onSearch={() => setSearchOpen(true)}
        onProforna={togglePanel}
        profornaOpen={profornaOpen}
        onNotice={(href) => {
          setEditing(false);
          setMobileOpen(false);
          goPage(href);
        }}
      />
      <HomeSearch
        open={searchOpen}
        career={career}
        onClose={() => setSearchOpen(false)}
        onHome={() => {
          setEditing(false);
          setMobileOpen(false);
          goHome();
        }}
        onProfile={goProfile}
        onSettings={() => setSettingsOpen(true)}
      />
      <HomeSettings
        open={settingsOpen}
        profile={profile}
        onClose={() => setSettingsOpen(false)}
        onProfileSaved={(next) => {
          setPhotoTick((n) => n + 1);
          onProfileSaved(next);
        }}
      />
      <div
        className={dragging ? "home-shell is-resizing" : "home-shell"}
        ref={shellRef}
      >
        {page === "history" ? (
          <WorkHistory
            career={career}
            careerError={careerError}
            focusJobId={focusJobId}
            onHome={() => {
              setEditing(false);
              goHome();
            }}
          />
        ) : (
          <>
        <HomeNav
          collapsed={desktop && collapsed}
          mobileOpen={mobileOpen}
          page={page}
          width={desktop && !collapsed ? widths.nav : undefined}
          onCloseMobile={() => setMobileOpen(false)}
          onGoHome={() => {
            goHome();
          }}
          onGoHistory={(jobId) => {
            setEditing(false);
            goPage("history");
            setFocusJobId(jobId ?? null);
          }}
          onGoPage={(next) => {
            setEditing(false);
            setFocusJobId(null);
            goPage(next);
          }}
        />
        {desktop && !collapsed ? (
          <WorkbenchSash
            label="Resize Career"
            value={widths.nav}
            min={NAV_MIN}
            max={NAV_MAX}
            dragging={dragging === "nav"}
            onDragStart={(event) => dragSide("nav", event)}
            onNudge={(delta) => nudge("nav", delta)}
            onReset={() => {
              preferred.current.nav = NAV_DEFAULT;
              applyFit();
            }}
          />
        ) : null}
      <main className="home-main">
      {page !== "home" ? (
        <CareerWorkspace page={page} />
      ) : editing ? (
        <div className="home-file home-edit">
          <HomeProfileEdit
            initial={profile}
            onCancel={() => setEditing(false)}
            onSaved={(saved) => {
              setPhotoTick((n) => n + 1);
              onProfileSaved(saved);
              setEditing(false);
            }}
          />
        </div>
      ) : (
        <article className="home-file">
          <header className="home-file-identity">
            {photoSrc ? (
              <img
                className="home-avatar"
                src={photoSrc}
                alt=""
                width={96}
                height={96}
              />
            ) : (
              <div className="home-avatar home-avatar-fallback" aria-hidden="true">
                {initials(profile.fullName)}
              </div>
            )}
            <div className="home-file-identity-copy">
              <h1>{profile.fullName}</h1>
              {profile.headline ? (
                <p className="home-headline">{profile.headline}</p>
              ) : null}
              {place || company ? (
                <p className="home-meta">
                  {place}
                  {place && company ? " · " : null}
                  {company ? <span className="home-span">{company}</span> : null}
                </p>
              ) : null}
              {links.length > 0 ? (
                <ul className="home-links">
                  {links.map((href) => (
                    <li key={href}>
                      <a href={href} rel="noreferrer" target="_blank">
                        {displayHref(href)}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
              <button
                type="button"
                className="home-file-edit"
                onClick={() => setEditing(true)}
              >
                Edit profile
              </button>
            </div>
          </header>

          {careerError ? (
            <p className="home-alert" role="alert">
              {careerError}
            </p>
          ) : null}

          <section className="home-file-section" aria-labelledby="home-file-now">
            <h2 id="home-file-now">Now</h2>
            {role ? (
              <button
                type="button"
                className="home-file-role"
                onClick={() => {
                  setFocusJobId(role.id);
                  goPage("history");
                }}
              >
                <strong>
                  {role.title}
                  {role.company ? ` · ${role.company}` : ""}
                </strong>
                <span>
                  {[
                    formatCareerSpan(role.startDate, role.endDate, role.isCurrent),
                    presentPlace(role.location),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
            ) : (
              <p className="home-file-empty">
                No current role yet. Add one in Career History so this file has a
                present tense.
              </p>
            )}
          </section>

          {recentJobs.length > 0 ? (
            <section
              className="home-file-section"
              aria-labelledby="home-file-recent"
            >
              <h2 id="home-file-recent">Recent</h2>
              <ol className="home-file-ledger">
                {recentJobs.map((job) => (
                  <li key={job.id}>
                    <button
                      type="button"
                      className="home-file-role"
                      onClick={() => {
                        setFocusJobId(job.id);
                        goPage("history");
                      }}
                    >
                      <strong>
                        {job.title}
                        {job.company ? ` · ${job.company}` : ""}
                      </strong>
                      <span>
                        {[
                          formatCareerSpan(
                            job.startDate,
                            job.endDate,
                            job.isCurrent,
                          ),
                          presentPlace(job.location),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {skillTags.length > 0 ? (
            <section
              className="home-file-section"
              aria-labelledby="home-file-skills"
            >
              <h2 id="home-file-skills">Skills</h2>
              <ul className="home-file-skills">
                {skillTags.map((skill) => (
                  <li key={skill}>{skill}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="home-file-next">
            <button
              type="button"
              className="home-file-primary"
              onClick={() => {
                if (next.page === "history") {
                  setFocusJobId(null);
                  goPage("history");
                  return;
                }
                setFocusJobId(null);
                goPage(next.page);
              }}
            >
              {next.label}
            </button>
            {next.secondary ? (
              <button
                type="button"
                className="home-file-secondary"
                onClick={() => {
                  setFocusJobId(null);
                  goPage(next.secondary!.page);
                }}
              >
                {next.secondary.label}
              </button>
            ) : null}
          </div>
        </article>
      )}
      </main>
          </>
        )}
        {desktop && profornaOpen ? (
          <WorkbenchSash
            label="Resize Proforna"
            value={widths.chat}
            min={CHAT_MIN}
            max={CHAT_MAX}
            dragging={dragging === "chat"}
            onDragStart={(event) => dragSide("chat", event)}
            onNudge={(delta) => nudge("chat", -delta)}
            onReset={() => {
              preferred.current.chat = CHAT_DEFAULT;
              applyFit();
            }}
          />
        ) : null}
      <HomeProforna
        open={profornaOpen}
        onToggle={togglePanel}
        width={desktop && profornaOpen ? widths.chat : undefined}
      />
      </div>
    </div>
  );
}

function readPage(): HomePage {
  const value = window.location.hash.replace(/^#\/?/, "");
  return value === "worklog" ||
    value === "history" ||
    value === "resumes" ||
    value === "documents" ||
    value === "network" ||
    value === "opportunities"
    ? value
    : "home";
}

function readDesktop(): boolean {
  return window.matchMedia(WORKBENCH).matches;
}

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(NAV_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(NAV_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

function readPanelOpen(): boolean {
  try {
    const value = window.localStorage.getItem(PANEL_OPEN_KEY);
    return value !== "0";
  } catch {
    return true;
  }
}

function writePanelOpen(open: boolean) {
  try {
    window.localStorage.setItem(PANEL_OPEN_KEY, open ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

function WorkbenchSash({
  label,
  value,
  min,
  max,
  dragging,
  onDragStart,
  onNudge,
  onReset,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  dragging: boolean;
  onDragStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onNudge: (delta: number) => void;
  onReset: () => void;
}) {
  return (
    <div
      className={dragging ? "home-sash is-dragging" : "home-sash"}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      onPointerDown={onDragStart}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 48 : 16;
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onNudge(-step);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          onNudge(step);
        }
      }}
    />
  );
}

function presentPlace(value: string): string {
  const place = value.trim();
  if (!place || /^\d{1,5}$/.test(place)) return "";
  return place;
}

function nextCareerAction(
  career: CareerFile,
  role: CareerJob | null,
): {
  label: string;
  page: HomePage;
  secondary?: { label: string; page: HomePage };
} {
  if (career.jobs.length === 0) {
    return {
      label: "Add a role",
      page: "history",
      secondary: { label: "Capture work", page: "worklog" },
    };
  }
  if (!role) {
    return {
      label: "Set a current role",
      page: "history",
      secondary: { label: "Capture work", page: "worklog" },
    };
  }
  return {
    label: "Capture work",
    page: "worklog",
    secondary: { label: "Career History", page: "history" },
  };
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function displayHref(href: string): string {
  try {
    const url = new URL(href);
    return `${url.host}${url.pathname}`.replace(/\/$/, "");
  } catch {
    return href;
  }
}
