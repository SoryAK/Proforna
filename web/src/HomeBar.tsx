import { useEffect, useId, useRef, useState } from "react";
import { HOME_NAV_ID, Icon } from "./HomeNav";

export function HomeBar({
  name,
  headline,
  photoSrc,
  menuExpanded,
  onMenu,
  onProfile,
  onSettings,
  onSearch,
}: {
  name: string;
  headline: string;
  photoSrc: string | null;
  menuExpanded: boolean;
  onMenu: () => void;
  onProfile: () => void;
  onSettings: () => void;
  onSearch: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const letters = initials(name);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (root.current && !root.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className="home-bar">
      <div className="home-bar-start">
        <button
          type="button"
          className="home-menu-btn"
          aria-label={menuExpanded ? "Collapse menu" : "Expand menu"}
          aria-expanded={menuExpanded}
          aria-controls={HOME_NAV_ID}
          onClick={onMenu}
        >
          <Icon name="menu" />
        </button>
        <p className="home-bar-brand">Proforna</p>
      </div>
      <div className="home-bar-search">
        <button
          type="button"
          className="home-search-pill"
          aria-label="Search"
          onClick={onSearch}
        >
          <Icon name="search" />
          <span>Search…</span>
          <kbd>{shortcutLabel()}</kbd>
        </button>
        <button
          type="button"
          className="home-search-icon"
          aria-label="Search"
          onClick={onSearch}
        >
          <Icon name="search" />
        </button>
      </div>
      <div className="home-user" ref={root}>
        <button
          type="button"
          className="home-user-chip"
          aria-label={headline ? `${name}, ${headline}` : name}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls={menuId}
          onClick={() => setOpen((next) => !next)}
        >
          {photoSrc ? (
            <img className="home-user-photo" src={photoSrc} alt="" width={32} height={32} />
          ) : (
            <span className="home-user-photo home-user-fallback" aria-hidden="true">
              {letters}
            </span>
          )}
          <span className="home-user-copy">
            <span className="home-user-name">{name}</span>
            {headline ? <span className="home-user-role">{headline}</span> : null}
          </span>
          <svg className="home-user-caret" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
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
        {open ? (
          <div className="home-user-menu" id={menuId} role="menu">
            <div className="home-user-card">
              {photoSrc ? (
                <img className="home-user-photo" src={photoSrc} alt="" width={36} height={36} />
              ) : (
                <span className="home-user-photo home-user-fallback" aria-hidden="true">
                  {letters}
                </span>
              )}
              <div>
                <p className="home-user-name">{name}</p>
                {headline ? <p className="home-user-role">{headline}</p> : null}
              </div>
            </div>
            <button
              type="button"
              className="home-user-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onProfile();
              }}
            >
              Profile
            </button>
            <button
              type="button"
              className="home-user-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSettings();
              }}
            >
              Settings
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function shortcutLabel(): string {
  if (typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform)) {
    return "⌘K";
  }
  return "Ctrl K";
}
