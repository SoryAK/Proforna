import { useEffect, useState } from "react";

const NAV_ID = "home-nav";
const RESOURCE_PAGES = new Set<HomePage>(["resumes", "documents", "network"]);

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
  width,
  onCloseMobile,
  onGoHome,
  onGoHistory,
  onGoPage,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  page: HomePage;
  width?: number;
  onCloseMobile: () => void;
  onGoHome: () => void;
  onGoHistory: (jobId?: string) => void;
  onGoPage: (page: HomePage) => void;
}) {
  const slim = collapsed && !mobileOpen;
  const [resourcesOpen, setResourcesOpen] = useState(() =>
    RESOURCE_PAGES.has(page),
  );

  useEffect(() => {
    if (RESOURCE_PAGES.has(page)) setResourcesOpen(true);
  }, [page]);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseMobile();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, onCloseMobile]);

  function go(next: HomePage) {
    onGoPage(next);
    onCloseMobile();
  }

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
        style={width ? { width } : undefined}
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
          onSelect={() => go("worklog")}
        />
        <NavRow
          icon="history"
          label="Career History"
          current={page === "history"}
          slim={slim}
          onSelect={() => {
            onGoHistory();
            onCloseMobile();
          }}
        />
        <NavRow
          icon="search"
          label="Opportunities"
          current={page === "opportunities"}
          slim={slim}
          onSelect={() => go("opportunities")}
        />

        {slim ? (
          <>
            <NavRow
              icon="studio"
              label="Resume Studio"
              current={page === "resumes"}
              slim={slim}
              onSelect={() => go("resumes")}
            />
            <NavRow
              icon="docs"
              label="My Docs"
              current={page === "documents"}
              slim={slim}
              onSelect={() => go("documents")}
            />
            <NavRow
              icon="network"
              label="My Network"
              current={page === "network"}
              slim={slim}
              onSelect={() => go("network")}
            />
          </>
        ) : (
          <div className="home-nav-group">
            <button
              type="button"
              className="home-nav-group-toggle"
              aria-expanded={resourcesOpen}
              onClick={() => setResourcesOpen((open) => !open)}
            >
              Resources
              <svg
                className={
                  resourcesOpen
                    ? "home-nav-group-caret is-open"
                    : "home-nav-group-caret"
                }
                width="12"
                height="12"
                viewBox="0 0 12 12"
                aria-hidden="true"
              >
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
            {resourcesOpen ? (
              <div className="home-nav-group-body">
                <NavRow
                  icon="studio"
                  label="Resume Studio"
                  current={page === "resumes"}
                  slim={false}
                  onSelect={() => go("resumes")}
                />
                <NavRow
                  icon="docs"
                  label="My Docs"
                  current={page === "documents"}
                  slim={false}
                  onSelect={() => go("documents")}
                />
                <NavRow
                  icon="network"
                  label="My Network"
                  current={page === "network"}
                  slim={false}
                  onSelect={() => go("network")}
                />
              </div>
            ) : null}
          </div>
        )}
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
  | "studio"
  | "network"
  | "search"
  | "notice"
  | "menu"
  | "rail"
  | "railOff"
  | "proforna"
  | "panel"
  | "panelOff";

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
      {name === "studio" ? (
        <>
          <path d="M5 5.5h14v13H5z" />
          <path d="M5 10h14M10 5.5v13" />
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
      {name === "menu" || name === "railOff" ? (
        <>
          <rect x="3" y="4" width="18" height="16" rx="1.5" />
          <path d="M9.5 4v16" />
        </>
      ) : null}
      {name === "rail" ? (
        <>
          <rect x="3" y="4" width="18" height="16" rx="1.5" />
          <path d="M9.5 4v16" />
          <path className="home-panel-fill" d="M4.2 5.2H9.5v13.6H4.2z" />
        </>
      ) : null}
      {name === "proforna" ? (
        <>
          <path d="M5 6.5h14v11l-4-2.5H5z" />
          <path d="M8.5 10.5h7M8.5 13.5h4.5" />
        </>
      ) : null}
      {name === "panel" ? (
        <>
          <rect x="3" y="4" width="18" height="16" rx="1.5" />
          <path d="M14.5 4v16" />
          <path className="home-panel-fill" d="M14.5 5.2h5.3v13.6H14.5z" />
        </>
      ) : null}
      {name === "panelOff" ? (
        <>
          <rect x="3" y="4" width="18" height="16" rx="1.5" />
          <path d="M14.5 4v16" />
        </>
      ) : null}
    </svg>
  );
}
