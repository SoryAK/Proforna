import { useEffect, useState } from "react";
import type { CareerJob } from "@core/career-file";

const NAV_ID = "home-nav";

export type HomePage =
  | "home"
  | "worklog"
  | "history"
  | "resumes"
  | "documents"
  | "network"
  | "opportunities";

export function HomeNav({
  collapsed,
  mobileOpen,
  page,
  currentJobs,
  onCloseMobile,
  onGoHome,
  onGoHistory,
  onGoPage,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  page: HomePage;
  currentJobs: CareerJob[];
  onCloseMobile: () => void;
  onGoHome: () => void;
  onGoHistory: (jobId?: string) => void;
  onGoPage: (page: HomePage) => void;
}) {
  const [jobsOpen, setJobsOpen] = useState(true);
  const slim = collapsed && !mobileOpen;

  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseMobile();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, onCloseMobile]);

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          className="home-nav-backdrop"
          aria-label="Close menu"
          onClick={onCloseMobile}
        />
      ) : null}
      <nav
        id={NAV_ID}
        className={[
          "home-nav",
          slim ? "is-collapsed" : "",
          mobileOpen ? "is-open" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label="Main"
      >
        <NavRow
          icon="home"
          label="Home"
          current={page === "home"}
          slim={slim}
          onSelect={() => {
            onGoHome();
            onCloseMobile();
          }}
        />
        <NavRow
          icon="worklog"
          label="Worklog"
          current={page === "worklog"}
          slim={slim}
          onSelect={() => {
            onGoPage("worklog");
            onCloseMobile();
          }}
        />
        <div className="home-nav-group">
          <div className="home-nav-history">
            <NavRow
              icon="history"
              label="Work Map"
              current={page === "history"}
              slim={slim}
              onSelect={() => {
                onGoHistory();
                onCloseMobile();
              }}
            />
            {!slim && currentJobs.length > 0 ? (
              <button
                type="button"
                className="home-nav-chevron"
                aria-expanded={jobsOpen}
                aria-controls="home-nav-jobs"
                aria-label={jobsOpen ? "Hide current roles" : "Show current roles"}
                onClick={() => setJobsOpen((open) => !open)}
              >
                <Icon name={jobsOpen ? "chevronDown" : "chevronRight"} />
              </button>
            ) : null}
          </div>
          {!slim && jobsOpen && currentJobs.length > 0 ? (
            <ul id="home-nav-jobs" className="home-nav-jobs">
              {currentJobs.map((job) => (
                <li key={job.id}>
                  <button
                    type="button"
                    className="home-nav-job"
                    onClick={() => {
                      onGoHistory(job.id);
                      onCloseMobile();
                    }}
                  >
                    <span className="home-nav-job-title">{job.title}</span>
                    <span className="home-nav-job-co"> · {job.company}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <p className="home-nav-label">Resources</p>
        <NavRow
          icon="docs"
          label="Resume Studio"
          current={page === "resumes"}
          slim={slim}
          onSelect={() => {
            onGoPage("resumes");
            onCloseMobile();
          }}
        />
        <NavRow
          icon="docs"
          label="My Docs"
          current={page === "documents"}
          slim={slim}
          onSelect={() => {
            onGoPage("documents");
            onCloseMobile();
          }}
        />
        <NavRow
          icon="network"
          label="My Network"
          current={page === "network"}
          slim={slim}
          onSelect={() => {
            onGoPage("network");
            onCloseMobile();
          }}
        />
        <NavRow
          icon="search"
          label="Opportunities"
          current={page === "opportunities"}
          slim={slim}
          onSelect={() => {
            onGoPage("opportunities");
            onCloseMobile();
          }}
        />
      </nav>
    </>
  );
}

export const HOME_NAV_ID = NAV_ID;

function NavRow({
  icon,
  label,
  current,
  slim,
  onSelect,
}: {
  icon: IconName;
  label: string;
  current?: boolean;
  slim: boolean;
  onSelect?: () => void;
}) {
  const className = ["home-nav-item", current ? "is-current" : ""]
    .filter(Boolean)
    .join(" ");
  const inner = (
    <>
      <Icon name={icon} />
      {slim ? <span className="sr-only">{label}</span> : label}
    </>
  );
  if (!onSelect) {
    return (
      <span className={className} title={slim ? label : undefined}>
        {inner}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={className}
      title={slim ? label : undefined}
      aria-current={current ? "page" : undefined}
      onClick={onSelect}
    >
      {inner}
    </button>
  );
}

type IconName =
  | "home"
  | "worklog"
  | "history"
  | "docs"
  | "network"
  | "search"
  | "notice"
  | "chevronDown"
  | "chevronRight"
  | "menu";

export function Icon({ name }: { name: IconName }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      {name === "home" ? (
        <path d="M4 11.2 12 4l8 7.2V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
      ) : null}
      {name === "worklog" ? (
        <>
          <path d="M7 4.5h8.5A2.5 2.5 0 0 1 18 7v12.5H8.5A2.5 2.5 0 0 1 6 17V7A2.5 2.5 0 0 1 8.5 4.5" />
          <path d="M9 9h6M9 13h6M9 17h3.5" />
        </>
      ) : null}
      {name === "history" ? (
        <>
          <path d="M4 11.5a8 8 0 1 0 2.3-5.7" />
          <path d="M4 5.5v4h4M12 8v5l3 1.5" />
        </>
      ) : null}
      {name === "docs" ? (
        <>
          <path d="M4 7.5h6l1.5 2H20v10.5H4z" />
          <path d="M4 7.5V5.5h6l1.2 1.6" />
        </>
      ) : null}
      {name === "network" ? (
        <>
          <circle cx="9" cy="8" r="2.4" />
          <circle cx="16.5" cy="8" r="2.4" />
          <circle cx="12.5" cy="16.5" r="2.6" />
          <path d="M10.6 10.1 11.4 14.1M15 10.1 13.7 14" />
        </>
      ) : null}
      {name === "search" ? (
        <>
          <circle cx="11" cy="11" r="6" />
          <path d="m20 20-3.6-3.6" />
        </>
      ) : null}
      {name === "notice" ? (
        <>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </>
      ) : null}
      {name === "chevronDown" ? (
        <path d="M6 9.5 12 15.5 18 9.5" />
      ) : null}
      {name === "chevronRight" ? (
        <path d="M9.5 6 15.5 12 9.5 18" />
      ) : null}
      {name === "menu" ? (
        <path d="M5 7h14M5 12h14M5 17h14" />
      ) : null}
    </svg>
  );
}
