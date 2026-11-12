import { useEffect, useState } from "react";
import type { CanvasBoard } from "@core/canvas-board";
import type { WorkMapRole } from "@core/work-map";
import { currentJob, type CareerFile } from "@core/career-file";
import { HomeBar, type HomeBioMode } from "./HomeBar";
import { HomeNav, type HomePage } from "./HomeNav";
import { HomeProfileEdit } from "./HomeProfileEdit";
import { HomeSearch, type SearchPlace } from "./HomeSearch";
import { HomeSettings } from "./HomeSettings";
import { ResumeImport } from "./ResumeImport";
import type { DetailTab } from "./RoleDetailPanel";
import { WorkHistory } from "./WorkHistory";
import { CareerHistoryCard } from "./CareerHistoryCard";
import { CareerWorkspace } from "./CareerWorkspace";
import { HomeCenter } from "./HomeCenter";
import { HomeProforna, type ChatRole } from "./HomeProforna";
import { RoleCanvasEntry } from "./RoleCanvas";
import type { OnboardingProfileValue } from "./OnboardingProfile";
import "./home.css";

const NAV_COLLAPSED_KEY = "proforna.navCollapsed";
const PANEL_OPEN_KEY = "proforna.panelOpen";
const WORKBENCH = "(min-width: 760px)";

export function Home({
  initialFocusJobId = null,
  initialFocusTab,
  profile,
  career,
  careerError,
  onProfileSaved,
}: {
  initialFocusJobId?: string | null;
  initialFocusTab?: DetailTab;
  profile: OnboardingProfileValue;
  career: CareerFile;
  careerError: string | null;
  onProfileSaved: (profile: OnboardingProfileValue) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [bioMode, setBioMode] = useState<HomeBioMode>("browse");
  const [canvasFromNav, setCanvasFromNav] = useState(false);
  const [chatRoles, setChatRoles] = useState<ChatRole[]>([]);
  const [chatRelease, setChatRelease] = useState<{ id: string; nonce: number } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [careerRevision, setCareerRevision] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [centerView, setCenterView] = useState<{
    id: number;
    updates: boolean;
    updateId: string | null;
  } | null>(null);
  const [page, setPage] = useState<HomePage>(readPage);
  const [focusJobId, setFocusJobId] = useState<string | null>(initialFocusJobId);
  const [photoTick, setPhotoTick] = useState(0);
  const [mapRevision, setMapRevision] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [profornaOpen, setProfornaOpen] = useState(readPanelOpen);
  const [desktop, setDesktop] = useState(readDesktop);
  const leftClosed = desktop && collapsed;
  const role = currentJob(career);
  const place = [
    profile.address,
    [profile.city, profile.state].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(", ");
  const company = role?.company ?? "";
  const photoSrc = profile.avatarUrl
    ? `${profile.avatarUrl}?v=${photoTick}`
    : null;

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
      if (document.querySelector("dialog.home-settings-dialog[open]")) return;
      event.preventDefault();
      setSearchOpen((open) => !open);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

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
    const hash =
      next === "home" ? "" : next === "historyReserve" ? "#/history-reserve" : `#/${next}`;
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
  }

  function goProfile() {
    showLeft();
    if (page === "home") {
      setEditing(true);
      return;
    }
    setEditing(false);
    goHome();
  }

  function showLeft() {
    setMobileOpen(false);
    if (collapsed) {
      setCollapsed(false);
      writeCollapsed(false);
    }
  }

  function showCenter() {
    if (page === "home" || page === "history") return;
    setEditing(false);
    goPage("home");
  }

  function openSearchPlace(id: SearchPlace) {
    if (id === "profile") {
      goProfile();
      return;
    }
    if (id === "history") {
      showLeft();
      setEditing(false);
      setFocusJobId(null);
      goPage("history");
      return;
    }
    if (id === "map") {
      showCenter();
      setCenterView({ id: Date.now(), updates: false, updateId: null });
      return;
    }
    if (id === "updates") {
      showCenter();
      setFocusJobId(null);
      setCenterView({ id: Date.now(), updates: true, updateId: null });
      return;
    }
    if (id === "media") {
      showCenter();
      return;
    }
    setProfornaOpen(true);
    writePanelOpen(true);
  }

  function openSearchRole(id: string) {
    showLeft();
    setEditing(false);
    setFocusJobId(id);
    goPage("history");
  }

  function openSearchUpdate(id: string) {
    showCenter();
    setFocusJobId(null);
    setCenterView({ id: Date.now(), updates: true, updateId: id });
  }

  return (
    <div className="home">
      <HomeSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onPlace={openSearchPlace}
        onRole={openSearchRole}
        onUpdate={openSearchUpdate}
      />
      <HomeSettings
        open={settingsOpen}
        profile={profile}
        onClose={() => setSettingsOpen(false)}
        onProfileSaved={(next) => {
          setPhotoTick((n) => n + 1);
          onProfileSaved(next);
        }}
        onMapsSaved={() => setMapRevision((n) => n + 1)}
      />
      {importOpen ? (
        <ResumeImport
          onClose={() => setImportOpen(false)}
          onDone={() => {
            setImportOpen(false);
            setCareerRevision((n) => n + 1);
          }}
        />
      ) : null}
      <div
        className={[
          "home-sheet",
          leftClosed ? "is-left-closed" : "",
          profornaOpen ? "is-right-open" : "",
          page === "home" || page === "history" ? "" : "is-stage-full",
          page === "history" && bioMode === "preview" ? "" : "is-bio-hidden",
        ]
          .filter(Boolean)
          .join(" ")}
      >
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
          onSettings={() => setSettingsOpen(true)}
          onSearch={() => setSearchOpen(true)}
          onProforna={togglePanel}
          profornaOpen={profornaOpen}
          bioMode={bioMode}
          onBioMode={setBioMode}
          onNotice={(href) => {
            setEditing(false);
            setMobileOpen(false);
            if (href === "worklog") {
              goHome();
              return;
            }
            goPage(href);
          }}
        />
        {leftClosed ? null : (
          <>
            <section className="home-card home-bio" aria-label="Profile">
              {editing ? (
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
                    <button
                      type="button"
                      className="home-file-edit"
                      onClick={() => setEditing(true)}
                    >
                      Edit profile
                    </button>
                  </div>
                </header>
              )}
            </section>
            <section className="home-card home-history" aria-label="Career history">
              <HomeNav
                collapsed={false}
                mobileOpen={mobileOpen}
                page={page}
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
                onCanvas={setCanvasFromNav}
                canvasOpen={canvasFromNav}
                history={
                  page === "history" ? (
                    <CareerHistoryCard
                      revision={careerRevision}
                      focusRoleId={focusJobId}
                      onBack={() => {
                        setFocusJobId(null);
                        goHome();
                      }}
                      onImport={() => setImportOpen(true)}
                      onAsk={() => {
                        if (!profornaOpen) togglePanel();
                      }}
                      onRemoved={(ids) => {
                        setCareerRevision((n) => n + 1);
                        setFocusJobId((current) => (current && ids.includes(current) ? null : current));
                      }}
                      onSelectionChange={setChatRoles}
                      release={chatRelease}
                    />
                  ) : null
                }
              />
            </section>
          </>
        )}
        {page === "historyReserve" ? (
          <main className="home-card home-stage">
            <WorkHistory
              career={career}
              careerError={careerError}
              focusJobId={focusJobId}
              focusTab={focusJobId === initialFocusJobId ? initialFocusTab : undefined}
              mapRevision={mapRevision}
              careerRevision={careerRevision}
              canvasFromNav={canvasFromNav}
              onHome={() => {
                setEditing(false);
                goHome();
              }}
            />
          </main>
        ) : page !== "home" && page !== "history" ? (
          <main className="home-card home-stage">
            <CareerWorkspace page={page} />
          </main>
        ) : (
          <HomeCenter
            revision={careerRevision}
            focusRoleId={focusJobId}
            viewRequest={centerView}
            onSelectRole={(id) => {
              setEditing(false);
              setFocusJobId(id);
              goPage("history");
            }}
          />
        )}
        <HomeProforna
          open={profornaOpen}
          onToggle={togglePanel}
          roles={chatRoles}
          onReleaseRole={(id) => {
            setChatRoles((current) => current.filter((role) => role.id !== id));
            setChatRelease({ id, nonce: Date.now() });
          }}
        />
        {canvasFromNav && page !== "historyReserve" ? (
          <HomeCanvas onClose={() => setCanvasFromNav(false)} />
        ) : null}
      </div>
    </div>
  );
}

function HomeCanvas({ onClose }: { onClose: () => void }) {
  const [roles, setRoles] = useState<WorkMapRole[]>([]);
  const [studyBoards, setStudyBoards] = useState<CanvasBoard[]>([]);
  const [studyRevision, setStudyRevision] = useState(0);

  useEffect(() => {
    void fetch("/api/work-map")
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as {
          roles?: WorkMapRole[];
          studyBoards?: CanvasBoard[];
          studyRevision?: number;
        };
        setRoles(body.roles ?? []);
        setStudyBoards(body.studyBoards ?? []);
        setStudyRevision(body.studyRevision ?? 0);
      })
      .catch(() => {
        setRoles([]);
        setStudyBoards([]);
      });
  }, []);

  const role = roles[0];
  if (!role) return null;
  return (
    <RoleCanvasEntry
      role={role}
      roles={roles}
      studyBoards={studyBoards}
      studyRevision={studyRevision}
      scope="all"
      minimized={false}
      slot={null}
      dockSlot={null}
      onMinimizedChange={(minimized) => {
        if (minimized) onClose();
      }}
      onShowRole={() => undefined}
      onClose={onClose}
    />
  );
}

function readPage(): HomePage {
  const value = window.location.hash.replace(/^#\/?/, "");
  if (value === "history-reserve") return "historyReserve";
  return value === "history" ||
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

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
