import { useEffect, useState } from "react";
import type { CanvasBoard } from "@core/canvas-board";
import type { WorkMapRole } from "@core/work-map";
import type { CareerFile } from "@core/career-file";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { ScrollableArea } from "@astryxdesign/core/ScrollableArea";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { MapPin } from "lucide-react";
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
import { clearEvidenceRole } from "./onboarding-evidence";
import { careerPreviewWindowUrl, isCareerPreview } from "./preview-placement";
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
  const [bioMode, setBioMode] = useState<HomeBioMode>(isCareerPreview() ? "preview" : "browse");
  const [canvasFromNav, setCanvasFromNav] = useState(false);
  const [chatRoles, setChatRoles] = useState<ChatRole[]>([]);
  const [chatRelease, setChatRelease] = useState<{ id: string; nonce: number } | null>(null);
  const [chatAttach, setChatAttach] = useState<{ id: string; nonce: number } | null>(null);
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
  const [previewNote, setPreviewNote] = useState("");
  const [bioDialog, setBioDialog] = useState<"know" | "contact" | "place" | null>(null);
  const [desktop, setDesktop] = useState(readDesktop);
  const leftClosed = desktop && collapsed;
  const place = [
    profile.address,
    [profile.city, profile.state].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(", ");
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
      if (isCareerPreview()) setBioMode("preview");
    }
    window.addEventListener("hashchange", onRoute);
    return () => window.removeEventListener("hashchange", onRoute);
  }, []);

  useEffect(() => {
    if (!initialFocusJobId || focusJobId === initialFocusJobId) return;
    clearEvidenceRole();
  }, [focusJobId, initialFocusJobId]);

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

  useEffect(() => {
    if (!bioDialog) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setBioDialog(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [bioDialog]);

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

  function openSearchUpdate(id: string, roleId: string) {
    showCenter();
    setFocusJobId(roleId);
    setCenterView({ id: Date.now(), updates: true, updateId: id });
  }

  function chooseBioMode(mode: HomeBioMode) {
    setBioMode(mode);
    setPreviewNote("");
    if (mode === "preview") {
      setEditing(false);
      setFocusJobId(null);
      if (readPage() !== "history") goPage("history");
      return;
    }
    if (!isCareerPreview()) return;
    const next = window.location.hash.split("?")[0];
    if (window.location.hash !== next) window.location.hash = next;
  }

  function openCareerPreview(where: "here" | "window") {
    if (where === "window") {
      const opened = window.open(
        careerPreviewWindowUrl(),
        "proforna-career-preview",
        "popup,width=1100,height=800",
      );
      if (opened) return;
      setPreviewNote("The browser blocked the preview window. Preview is staying in this window.");
    }
    chooseBioMode("preview");
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
          onBioMode={chooseBioMode}
          notice={previewNote}
          onPreview={openCareerPreview}
          onExitPreview={() => chooseBioMode("browse")}
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
                <>
                  <div className="home-bio-row">
                    <Avatar
                      name={profile.fullName || "Career"}
                      src={photoSrc ?? undefined}
                      size={48}
                      tooltip={false}
                    />
                    <div className="home-bio-id">
                      <h2>{profile.fullName || "Career"}</h2>
                      {profile.headline.trim() ? <p>{profile.headline.trim()}</p> : null}
                    </div>
                    <div className="home-bio-socials">
                      <button type="button" aria-label="Request location" onClick={() => setBioDialog("place")}>
                        <Icon className="home-bio-pin" icon={MapPin} size="sm" />
                      </button>
                      {bioSocials(profile).map((item) =>
                        item.url ? (
                          <a key={item.name} href={item.url} target="_blank" rel="noreferrer" aria-label={item.name}>
                            <BioSocialMark kind={item.kind} />
                          </a>
                        ) : (
                          <span key={item.name} aria-label={`${item.name}, not added`} title={item.name}>
                            <BioSocialMark kind={item.kind} />
                          </span>
                        ),
                      )}
                    </div>
                  </div>
                  <div className="home-bio-actions">
                    <Button
                      label="Contact"
                      variant="secondary"
                      size="sm"
                      onClick={() => setBioDialog("contact")}
                    />
                    <Button
                      label="Get to know me"
                      variant="secondary"
                      size="sm"
                      onClick={() => setBioDialog("know")}
                    />
                  </div>
                </>
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
                      onAdded={() => setCareerRevision((n) => n + 1)}
                      onRemoved={(ids) => {
                        setCareerRevision((n) => n + 1);
                        setFocusJobId((current) => (current && ids.includes(current) ? null : current));
                      }}
                      onSelectionChange={setChatRoles}
                      release={chatRelease}
                      attach={chatAttach}
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
          focusRoleId={focusJobId}
          onReleaseRole={(id) => {
            setChatRoles((current) => current.filter((role) => role.id !== id));
            setChatRelease({ id, nonce: Date.now() });
          }}
          onAttachRole={(role) => {
            setChatRoles((current) =>
              current.some((item) => item.id === role.id) ? current : [...current, role],
            );
            setChatAttach({ id: role.id, nonce: Date.now() });
          }}
        />
        {canvasFromNav && page !== "historyReserve" ? (
          <HomeCanvas onClose={() => setCanvasFromNav(false)} />
        ) : null}
      </div>
      {bioDialog === "know" || bioDialog === "place" ? (
        <div
          className="home-bio-pop"
          role="dialog"
          aria-modal="true"
          aria-label={bioDialog === "know" ? "Get to know me" : "Location"}
          onClick={(event) => {
            if (event.target === event.currentTarget) setBioDialog(null);
          }}
        >
          <ScrollableArea
            className="home-bio-pop-card"
            label={bioDialog === "know" ? "Get to know me" : "Location"}
          >
            <header>
              <h2>{bioDialog === "know" ? "Get to know me" : "Location"}</h2>
              <Button label="Close" variant="ghost" size="sm" onClick={() => setBioDialog(null)} />
            </header>
            {bioDialog === "know" ? (
              <p>{profile.bio.trim() || "Nothing written yet."}</p>
            ) : (
              <p>{place || "No location yet."}</p>
            )}
          </ScrollableArea>
        </div>
      ) : null}
      <ContactNoteDialog isOpen={bioDialog === "contact"} onClose={() => setBioDialog(null)} />
    </div>
  );
}

function ContactNoteDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [jobs, setJobs] = useState(false);
  const [networks, setNetworks] = useState(false);
  const [posting, setPosting] = useState(false);
  const [jobName, setJobName] = useState("");
  const [jobRole, setJobRole] = useState("");
  const [jobCompany, setJobCompany] = useState("");
  const [jobLocation, setJobLocation] = useState("");
  const [jobPost, setJobPost] = useState("");
  const [firstError, setFirstError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) return;
    setFirstName("");
    setLastName("");
    setEmail("");
    setCompany("");
    setJobTitle("");
    setPhone("");
    setJobs(false);
    setNetworks(false);
    setPosting(false);
    setJobName("");
    setJobRole("");
    setJobCompany("");
    setJobLocation("");
    setJobPost("");
    setFirstError(null);
    setLastError(null);
    setEmailError(null);
  }, [isOpen]);

  function submit() {
    const missingFirst = !firstName.trim();
    const missingLast = !lastName.trim();
    const missingEmail = !email.trim();
    setFirstError(missingFirst ? "Required" : null);
    setLastError(missingLast ? "Required" : null);
    setEmailError(missingEmail ? "Required" : null);
    if (missingFirst || missingLast || missingEmail) {
      setPosting(false);
      return;
    }
    onClose();
  }

  function chooseJobs(next: boolean) {
    setJobs(next);
    if (next) setPosting(true);
  }

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      width={620}
      maxHeight="min(40rem, calc(100dvh - 2rem))"
      purpose="form"
    >
      <Layout
        height="fill"
        padding={4}
        defaultHasDividers
        header={<DialogHeader title="Contact" onOpenChange={onClose} hasDivider={false} />}
        content={
          <LayoutContent label="Contact">
            {posting ? (
              <VStack gap={4}>
                <Text type="label">Job opportunity</Text>
                <Grid columns={2} gap={3}>
                  <TextInput label="Name" isLabelHidden placeholder="Name" value={jobName} onChange={setJobName} />
                  <TextInput label="Role" isLabelHidden placeholder="Role" value={jobRole} onChange={setJobRole} />
                  <TextInput label="Company" isLabelHidden placeholder="Company" value={jobCompany} onChange={setJobCompany} />
                  <TextInput label="Location" isLabelHidden placeholder="Location" value={jobLocation} onChange={setJobLocation} />
                </Grid>
                <TextArea
                  label="Description"
                  isLabelHidden
                  placeholder="Describe the job opportunity"
                  value={jobPost}
                  onChange={setJobPost}
                />
              </VStack>
            ) : (
              <VStack gap={4}>
                <Text type="label">Your details</Text>
                <Grid columns={2} gap={3}>
                  <TextInput
                    label="First name"
                    isLabelHidden
                    placeholder="First name*"
                    value={firstName}
                    onChange={setFirstName}
                    status={firstError ? { type: "error", message: firstError } : undefined}
                  />
                  <TextInput
                    label="Last name"
                    isLabelHidden
                    placeholder="Last name*"
                    value={lastName}
                    onChange={setLastName}
                    status={lastError ? { type: "error", message: lastError } : undefined}
                  />
                  <TextInput
                    label="Email"
                    isLabelHidden
                    placeholder="Email*"
                    value={email}
                    onChange={setEmail}
                    status={emailError ? { type: "error", message: emailError } : undefined}
                  />
                  <TextInput
                    label="Company name"
                    isLabelHidden
                    placeholder="Company name"
                    value={company}
                    onChange={setCompany}
                  />
                  <TextInput label="Job title" isLabelHidden placeholder="Job title" value={jobTitle} onChange={setJobTitle} />
                  <TextInput label="Phone number" isLabelHidden placeholder="Phone number" value={phone} onChange={setPhone} />
                </Grid>
                <VStack gap={2}>
                  <Text type="label">What are you interested in?</Text>
                  <CheckboxInput label="Job opportunities" value={jobs} onChange={chooseJobs} />
                  <CheckboxInput label="Connecting networks" value={networks} onChange={setNetworks} />
                </VStack>
              </VStack>
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            {posting ? (
              <HStack gap={2} vAlign="center">
                <Button label="Back" variant="secondary" onClick={() => setPosting(false)} />
                <Button label="Let's connect" variant="primary" onClick={submit} />
              </HStack>
            ) : (
              <Button label="Let's connect" variant="primary" onClick={submit} />
            )}
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}

function HomeCanvas({ onClose }: { onClose: () => void }) {
  const [ready, setReady] = useState(false);
  const [roles, setRoles] = useState<WorkMapRole[]>([]);
  const [studyBoards, setStudyBoards] = useState<CanvasBoard[]>([]);
  const [studyRevision, setStudyRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/work-map")
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as {
          roles?: WorkMapRole[];
          studyBoards?: CanvasBoard[];
          studyRevision?: number;
        };
        if (cancelled) return;
        setRoles(body.roles ?? []);
        setStudyBoards(body.studyBoards ?? []);
        setStudyRevision(body.studyRevision ?? 0);
        setReady(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return null;
  const role = roles[0];
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
  const value = window.location.hash.replace(/^#\/?/, "").split("?")[0];
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

function bioSocials(profile: {
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
}): Array<{ name: string; kind: "linkedin" | "github" | "site"; url: string | null }> {
  return [
    { name: "LinkedIn", kind: "linkedin", url: httpUrl(profile.linkedinUrl) },
    { name: "GitHub", kind: "github", url: httpUrl(profile.githubUrl) },
    { name: "Site", kind: "site", url: httpUrl(profile.portfolioUrl) },
  ];
}

function httpUrl(value: string): string | null {
  const url = value.trim();
  return /^https?:\/\//i.test(url) ? url : null;
}

function BioSocialMark({ kind }: { kind: "linkedin" | "github" | "site" }) {
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
