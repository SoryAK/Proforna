import { useEffect, useState } from "react";
import { currentJob, currentJobs, type CareerFile } from "@core/career-file";
import { HomeBar } from "./HomeBar";
import { HomeNav } from "./HomeNav";
import { HomeProfileEdit } from "./HomeProfileEdit";
import { HomeSearch } from "./HomeSearch";
import { HomeSettings } from "./HomeSettings";
import type { OnboardingProfileValue } from "./OnboardingProfile";
import "./home.css";

const NAV_COLLAPSED_KEY = "proforna.navCollapsed";
const DESKTOP_NAV = "(min-width: 640px)";

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
  const [photoTick, setPhotoTick] = useState(0);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktop, setDesktop] = useState(readDesktop);
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

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_NAV);
    function onChange() {
      setDesktop(mq.matches);
      if (mq.matches) setMobileOpen(false);
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
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

  function toggleMenu() {
    if (desktop) {
      setCollapsed((next) => {
        const collapsedNext = !next;
        writeCollapsed(collapsedNext);
        return collapsedNext;
      });
      return;
    }
    setMobileOpen((open) => !open);
  }

  return (
    <div className="home">
      <HomeBar
        name={profile.fullName}
        headline={profile.headline}
        photoSrc={photoSrc}
        menuExpanded={desktop ? !collapsed : mobileOpen}
        onMenu={toggleMenu}
        onProfile={() => setEditing(true)}
        onSettings={() => setSettingsOpen(true)}
        onSearch={() => setSearchOpen(true)}
      />
      <HomeSearch
        open={searchOpen}
        career={career}
        onClose={() => setSearchOpen(false)}
        onHome={() => {
          setEditing(false);
          setMobileOpen(false);
        }}
        onProfile={() => setEditing(true)}
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
      <div className="home-shell">
        <HomeNav
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          currentJobs={currentJobs(career)}
          onCloseMobile={() => setMobileOpen(false)}
        />
      <main className="home-main">
      <header className="home-banner">
        <div className="home-banner-cover" aria-hidden="true" />
        {editing ? (
          <div className="home-banner-body home-edit">
            <HomeProfileEdit
              initial={profile}
              onCancel={() => setEditing(false)}
              onSaved={(next) => {
                setPhotoTick((n) => n + 1);
                onProfileSaved(next);
                setEditing(false);
              }}
            />
          </div>
        ) : (
          <div className="home-banner-body">
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

            {careerError ? (
              <p className="home-alert" role="alert">
                {careerError}
              </p>
            ) : null}
          </div>
        )}
      </header>
      </main>
      </div>
    </div>
  );
}

function readDesktop(): boolean {
  return window.matchMedia(DESKTOP_NAV).matches;
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
