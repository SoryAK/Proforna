import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Divider } from "@astryxdesign/core/Divider";
import type { OccupantNoticeHref } from "@core/notices";
import type { RelayStatus } from "@core/projection";
import type { WorkMapPublicationSettings } from "@core/work-map";
import { HOME_NAV_ID, Icon } from "./HomeNav";
import { HomeNotices } from "./HomeNotices";
import mark from "./docier-mark.svg";
import { announceRelayChange, useRelayStatus } from "./relay-status";

export type HomeBioMode = "browse" | "preview" | "share";

export function HomeBar({
  name,
  headline,
  photoSrc,
  menuExpanded,
  menuLabel,
  onMenu,
  onSettings,
  onSearch,
  onProforna,
  onRequest,
  profornaOpen,
  bioMode,
  onBioMode,
  onPreview,
  previewOpen = false,
  onExitPreview,
  notice = "",
  onNotice,
  revision = 0,
}: {
  name: string;
  headline: string;
  photoSrc: string | null;
  menuExpanded: boolean;
  menuLabel?: string;
  onMenu: () => void;
  onSettings: () => void;
  onSearch: () => void;
  onProforna?: () => void;
  onRequest?: () => void;
  profornaOpen?: boolean;
  bioMode: HomeBioMode;
  onBioMode: (mode: HomeBioMode) => void;
  onPreview: (where: "here" | "window") => void;
  previewOpen?: boolean;
  onExitPreview?: () => void;
  notice?: string;
  onNotice: (href: OccupantNoticeHref) => void;
  revision?: number;
}) {
  const [menu, setMenu] = useState<"user" | "notices" | "publish" | "preview" | "relay" | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publication, setPublication] = useState<PublicationDraft | null>(null);
  const [visibilityNote, setVisibilityNote] = useState("");
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [publishNote, setPublishNote] = useState("");
  const [searchMax, setSearchMax] = useState<number | null>(null);
  const barRef = useRef<HTMLElement>(null);
  const startRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const relayRef = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const relay = useRelayStatus(revision);
  const relayState = relay?.state;
  const showPublish = relayState === "unpublished" || relayState === "changed" || relayState === "current";
  const publishLead = relayState === "unpublished" || relayState === "changed";
  const publishPlan = describePublish(relay);
  const planId = useId();
  const menuId = useId();
  const letters = initials(name);

  useLayoutEffect(() => {
    const header = barRef.current;
    const brand = startRef.current;
    const end = root.current;
    if (!header || !brand || !end) return;
    const fit = () => {
      const side = Math.max(brand.offsetWidth, end.offsetWidth);
      const relayWidth = relayRef.current?.offsetWidth ?? 0;
      const room = Math.max(header.clientWidth - side * 2 - 24 - relayWidth - (relayWidth ? 8 : 0), 0);
      setSearchMax((current) => (current === room ? current : room));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(header);
    observer.observe(brand);
    observer.observe(end);
    if (relayRef.current) observer.observe(relayRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (menu !== "relay") return;
    let cancel = false;
    setVisibilityNote("");
    void fetch("/api/work-map/settings")
      .then(async (response) => {
        if (!response.ok) throw new Error("load");
        const body = (await response.json()) as {
          settings?: WorkMapPublicationSettings;
          updatedAt?: string | null;
        };
        if (cancel || !body.settings) return;
        setPublication({ settings: body.settings, updatedAt: body.updatedAt ?? null });
      })
      .catch(() => {
        if (!cancel) setVisibilityNote("Could not load visibility.");
      });
    return () => {
      cancel = true;
    };
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      const insideBar = root.current?.contains(target);
      const insideSearch = searchRef.current?.contains(target);
      if (!insideBar && !insideSearch) setMenu(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  function publishFailure(code: string | undefined) {
    if (code === "slug-required") {
      return "Save a public slug in publication settings before publishing.";
    }
    if (code === "sections-required") {
      return "Choose at least one section in publication settings before publishing.";
    }
    if (code === "private-not-publishable") {
      return "A private Work Map cannot be published.";
    }
    return code ?? "The Work Map could not be published.";
  }

  async function confirmPublish() {
    if (publishing) return;
    setPublishing(true);
    setPublishNote("");
    setMenu(null);
    try {
      const response = await fetch("/api/work-map/publish", { method: "POST" });
      if (response.ok) {
        setPublishNote(
          "Published this Work Map snapshot to the public link. Private edits stay local until you publish an update.",
        );
        announceRelayChange();
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setPublishNote(publishFailure(body.error));
    } catch {
      setPublishNote("The Work Map could not be published.");
    } finally {
      setPublishing(false);
    }
  }

  async function chooseVisibility(value: WorkMapPublicationSettings["visibility"]) {
    if (!publication || visibilityBusy || publication.settings.visibility === value) return;
    setVisibilityBusy(true);
    setVisibilityNote("");
    const next = { ...publication.settings, visibility: value };
    try {
      const response = await fetch("/api/work-map/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...next, updatedAt: publication.updatedAt }),
      });
      if (response.status === 409) {
        setVisibilityNote("Publication settings changed. Open this again.");
        return;
      }
      if (!response.ok) {
        setVisibilityNote("Could not save visibility.");
        return;
      }
      const body = (await response.json()) as {
        settings?: WorkMapPublicationSettings;
        updatedAt?: string | null;
      };
      if (body.settings) {
        setPublication({ settings: body.settings, updatedAt: body.updatedAt ?? null });
      }
      announceRelayChange();
    } catch {
      setVisibilityNote("Could not save visibility.");
    } finally {
      setVisibilityBusy(false);
    }
  }

  function publishMenu() {
    return (
      <div className="home-pub-menu is-publish" role="menu" aria-label="Publish">
        {publishPlan ? (
          <div className="home-pub-plan" id={planId}>
            <p>{publishPlan.lead}</p>
            {publishPlan.lines.length > 0 ? (
              <ul>
                {publishPlan.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          role="menuitem"
          aria-describedby={publishPlan ? planId : undefined}
          disabled={publishing}
          onClick={() => void confirmPublish()}
        >
          Confirm publish
        </button>
        <button type="button" role="menuitem" onClick={() => setMenu(null)}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <header
      className="home-bar"
      ref={barRef}
      style={searchMax == null ? undefined : { ["--home-search-max" as string]: `${searchMax}px` }}
    >
      <div className="home-bar-start" ref={startRef}>
        <button
          type="button"
          className="home-menu-btn"
          aria-label={
            menuLabel ?? (menuExpanded ? "Collapse menu" : "Expand menu")
          }
          aria-expanded={menuLabel ? undefined : menuExpanded}
          aria-controls={menuLabel ? undefined : HOME_NAV_ID}
          onClick={onMenu}
        >
          <Icon name={menuExpanded ? "rail" : "railOff"} />
        </button>
        <img className="home-bar-mark" src={mark} alt="" />
        <p className="home-bar-brand">Docier</p>
      </div>
      <div className="home-bar-search" ref={searchRef}>
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
        <div className={`home-sync is-${relayState ?? "private"}`} ref={relayRef}>
          <button
            type="button"
            className="home-sync-track"
            aria-expanded={menu === "relay"}
            aria-label={relayName(relay)}
            onClick={() => setMenu((current) => (current === "relay" ? null : "relay"))}
          >
            <span className="home-sync-node is-you" aria-hidden="true" />
            <svg className="home-sync-link" viewBox="0 0 40 8" preserveAspectRatio="none" aria-hidden="true">
              <path d="M1 4H39" />
            </svg>
            <span className="home-sync-node is-relay" aria-hidden="true" />
            <span className="home-sync-label">Relay</span>
            {relayState === "changed" && (relay?.changes.length ?? 0) > 0 ? (
              <span className="home-sync-count">{relay?.changes.length}</span>
            ) : null}
          </button>
          {previewOpen || bioMode === "preview" ? (
            <button
              type="button"
              className="home-sync-ghost"
              onClick={() => {
                if (previewOpen) onExitPreview?.();
                else onBioMode("browse");
                setMenu(null);
              }}
            >
              Exit preview
            </button>
          ) : (
            <button
              type="button"
              className="home-sync-ghost"
              aria-expanded={menu === "preview"}
              aria-haspopup="menu"
              onClick={() => setMenu((current) => (current === "preview" ? null : "preview"))}
            >
              Preview
            </button>
          )}
          {showPublish ? (
            <button
              type="button"
              className={publishLead ? "home-sync-send is-lead" : "home-sync-send"}
              aria-expanded={menu === "publish"}
              aria-haspopup="menu"
              onClick={() => setMenu((current) => (current === "publish" ? null : "publish"))}
            >
              Publish
            </button>
          ) : null}
          {menu === "relay" ? (
            <div className="home-pub-menu home-sync-menu home-sync-settings">
              <div className="home-pub-plan">
                <p>{relayState === "private" || !publishPlan ? "A private career stays off the Relay." : publishPlan.lead}</p>
                {publishPlan && publishPlan.lines.length > 0 ? (
                  <ul>
                    {publishPlan.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <p className="home-sync-setting">Visibility</p>
              <div role="radiogroup" aria-label="Visibility">
                {VISIBILITY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={publication?.settings.visibility === option.value}
                    disabled={!publication || visibilityBusy}
                    onClick={() => void chooseVisibility(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {visibilityNote ? <p className="home-sync-setting-note">{visibilityNote}</p> : null}
            </div>
          ) : null}
          {menu === "preview" && bioMode !== "preview" ? (
            <div className="home-pub-menu home-sync-menu" role="menu" aria-label="Preview">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onPreview("here");
                  setMenu(null);
                }}
              >
                This window
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onPreview("window");
                  setMenu(null);
                }}
              >
                New window
              </button>
            </div>
          ) : null}
          {menu === "publish" ? publishMenu() : null}
        </div>
      </div>
      <div className="home-bar-end" ref={root}>
        {publishNote || notice ? (
          <p className="home-pub-status" role="status">
            {publishNote || notice}
          </p>
        ) : null}
        {onRequest ? (
          <button type="button" className="home-notice-btn" aria-label="Request" onClick={onRequest}>
            <Icon name="request" />
          </button>
        ) : null}
        {onRequest && onProforna ? (
          <span className="home-bar-request-divider">
            <Divider orientation="vertical" variant="strong" />
          </span>
        ) : null}
        {onProforna ? (
          <button
            type="button"
            className={
              profornaOpen
                ? "home-notice-btn home-proforna-toggle is-current"
                : "home-notice-btn home-proforna-toggle"
            }
            aria-label={profornaOpen ? "Hide Proforna" : "Show Proforna"}
            aria-pressed={profornaOpen}
            onClick={onProforna}
          >
            <Icon name={profornaOpen ? "panel" : "panelOff"} />
          </button>
        ) : null}
        <HomeNotices
          open={menu === "notices"}
          onToggle={() =>
            setMenu((current) => (current === "notices" ? null : "notices"))
          }
          onSelect={(href) => {
            setMenu(null);
            onNotice(href);
          }}
        />
        <div className="home-user">
          <button
            type="button"
            className="home-user-chip"
            aria-label={headline ? `${name}, ${headline}` : name}
            aria-expanded={menu === "user"}
            aria-haspopup="menu"
            aria-controls={menuId}
            onClick={() =>
              setMenu((current) => (current === "user" ? null : "user"))
            }
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
          {menu === "user" ? (
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
                  setMenu(null);
                  onSettings();
                }}
              >
                Settings
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

const VISIBILITY_OPTIONS: Array<{ value: WorkMapPublicationSettings["visibility"]; label: string }> = [
  { value: "public", label: "Public" },
  { value: "unlisted", label: "Unlisted" },
  { value: "access-controlled", label: "Access controlled" },
  { value: "stealth", label: "Stealth — hide identity" },
  { value: "anonymous", label: "Anonymous — redact career detail" },
  { value: "private", label: "Private — keep off the relay" },
];

type PublicationDraft = {
  settings: WorkMapPublicationSettings;
  updatedAt: string | null;
};

function relayName(relay: RelayStatus | null): string {
  if (!relay || relay.state === "private") return "Relay, private";
  if (relay.state === "unpublished") return "Relay, not published";
  if (relay.state === "current") return "Relay, up to date";
  const count = relay.changes.length;
  return count > 0 ? `Relay, ${count} ${count === 1 ? "change" : "changes"}` : "Relay, changes to publish";
}

function describePublish(relay: RelayStatus | null): { lead: string; lines: string[] } | null {
  if (!relay || relay.state === "private") return null;
  if (relay.state === "unpublished") {
    return { lead: "This puts your career on the Relay for the first time.", lines: [] };
  }
  if (relay.state === "current") {
    return { lead: "The Relay already matches your career.", lines: [] };
  }
  const since = new Date(relay.publishedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return relay.changes.length > 0
    ? { lead: `Since ${since}:`, lines: relay.changes }
    : { lead: "Only private details changed. The Relay looks the same.", lines: [] };
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
